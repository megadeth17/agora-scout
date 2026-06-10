"""
Agora Scout — real native-USDC capital transfers on Arc.

On Arc, USDC is the native gas/value token (18-decimal precision). A rebalance
that actually "moves capital" is therefore a native value transfer between the
agent's treasury wallet (the safe bucket: cash + T-bills) and a vault wallet
(the at-risk bucket: DeFi yield). Each transfer is a real on-chain USDC
movement, independently verifiable on Arcscan — distinct from the zero-value
anchor transaction that commits the decision hash (see chain.py).

Commit-then-act, end to end:
    1. chain.ArcAnchor   commits sha256(decision) on-chain   (zero value)
    2. arc_transfer      moves real USDC per that decision    (real value)

Gated by config.EXECUTION_MODE == "live" AND a configured treasury + vault key.
Any missing config or RPC failure degrades gracefully to simulation (returns
None), so the agent loop never breaks.
"""
import asyncio
import logging

import config

logger = logging.getLogger(__name__)

USDC_DECIMALS = 18          # native USDC precision on Arc
DUST_USDC = 0.001           # moves smaller than this are not worth a tx
GAS_LIMIT = 21000           # plain native value transfer
GAS_BUFFER_MULT = 3         # keep this many gas-costs in reserve, never drain


class ArcTransfer:
    def __init__(self) -> None:
        self._w3 = None
        self._treasury = None
        self._vault = None
        self._enabled = (
            config.EXECUTION_MODE == "live"
            and bool(config.ARC_PRIVATE_KEY)
            and bool(config.ARC_VAULT_PRIVATE_KEY)
        )
        if config.EXECUTION_MODE == "live" and not self._enabled:
            logger.warning(
                "EXECUTION_MODE=live but treasury/vault key missing — staying simulated"
            )
        elif self._enabled:
            logger.info("ArcTransfer LIVE — real native-USDC rebalancing enabled")

    @property
    def enabled(self) -> bool:
        return self._enabled

    # ── connection (lazy, sync — always run via asyncio.to_thread) ────────────

    def _connect(self):
        if self._w3 is None:
            from web3 import Web3
            from eth_account import Account

            self._w3 = Web3(Web3.HTTPProvider(
                config.ARC_RPC_URL, request_kwargs={"timeout": 20}
            ))
            self._treasury = Account.from_key(config.ARC_PRIVATE_KEY)
            self._vault = Account.from_key(config.ARC_VAULT_PRIVATE_KEY)
            logger.info(
                "ArcTransfer wallets — treasury=%s vault=%s",
                self._treasury.address, self._vault.address,
            )
        return self._w3

    # ── balances ──────────────────────────────────────────────────────────────

    def _balances_sync(self) -> dict:
        w3 = self._connect()
        t = w3.eth.get_balance(self._treasury.address)
        v = w3.eth.get_balance(self._vault.address)
        return {
            "treasury_addr": self._treasury.address,
            "vault_addr": self._vault.address,
            "treasury_usdc": t / 10 ** USDC_DECIMALS,
            "vault_usdc": v / 10 ** USDC_DECIMALS,
            "total_usdc": (t + v) / 10 ** USDC_DECIMALS,
            "treasury_wei": t,
            "vault_wei": v,
        }

    async def balances(self) -> dict | None:
        if not self._enabled:
            return None
        try:
            return await asyncio.to_thread(self._balances_sync)
        except Exception as exc:
            logger.error("Arc balances fetch failed: %s", exc)
            return None

    # ── low-level send (sync) ─────────────────────────────────────────────────

    def _send_sync(self, sender, to_addr: str, amount_wei: int) -> str | None:
        w3 = self._connect()
        if not w3.is_connected():
            logger.error("Arc RPC not reachable at %s", config.ARC_RPC_URL)
            return None

        gas_price = w3.eth.gas_price
        gas_cost = gas_price * GAS_LIMIT
        bal = w3.eth.get_balance(sender.address)

        # Never spend into the gas reserve — cap the move if needed.
        reserve = gas_cost * GAS_BUFFER_MULT
        if amount_wei + reserve > bal:
            amount_wei = bal - reserve
        if amount_wei <= 0:
            logger.warning("Insufficient balance to transfer from %s", sender.address)
            return None

        tx = {
            "chainId": config.ARC_CHAIN_ID,
            "from": sender.address,
            "to": to_addr,
            "value": int(amount_wei),
            # "pending" so back-to-back sends from the same wallet (e.g. anchor
            # then transfer, both from the treasury) get sequential nonces.
            "nonce": w3.eth.get_transaction_count(sender.address, "pending"),
            "gas": GAS_LIMIT,
            "gasPrice": gas_price,
        }
        signed = w3.eth.account.sign_transaction(tx, sender.key)
        raw = getattr(signed, "raw_transaction", None) or getattr(signed, "rawTransaction")
        tx_hash = w3.eth.send_raw_transaction(raw)
        # Wait for inclusion so the value move is confirmed before we report it.
        w3.eth.wait_for_transaction_receipt(tx_hash, timeout=90)
        h = tx_hash.hex()
        return h if h.startswith("0x") else "0x" + h

    # ── rebalance: move real USDC to match the target yield allocation ────────

    @staticmethod
    def plan_move(treasury_wei: int, vault_wei: int, yield_pct: float) -> dict:
        """
        Pure allocation math (no network): decide how much native USDC to move so
        the vault ends up holding ~yield_pct of the combined balance.
        Returns {direction, amount_wei, skipped, total_wei}. Direction is
        "treasury->vault", "vault->treasury", or "" when the delta is dust.
        """
        total = treasury_wei + vault_wei
        pct = max(0.0, min(100.0, float(yield_pct)))
        target_vault = int(total * pct / 100.0)
        delta = target_vault - vault_wei      # >0: treasury→vault ; <0: vault→treasury
        amount = abs(delta)
        if amount / 10 ** USDC_DECIMALS < DUST_USDC:
            return {"direction": "", "amount_wei": 0, "skipped": True, "total_wei": total}
        direction = "treasury->vault" if delta > 0 else "vault->treasury"
        return {"direction": direction, "amount_wei": amount, "skipped": False, "total_wei": total}

    def _rebalance_sync(self, yield_pct: float) -> dict | None:
        w3 = self._connect()
        if not w3.is_connected():
            return None

        t = w3.eth.get_balance(self._treasury.address)
        v = w3.eth.get_balance(self._vault.address)
        plan = self.plan_move(t, v, yield_pct)
        total = plan["total_wei"]
        pct = max(0.0, min(100.0, float(yield_pct)))
        amount = plan["amount_wei"]

        if plan["skipped"]:
            return {
                "skipped": True,
                "reason": "below_dust",
                "treasury_usdc": t / 10 ** USDC_DECIMALS,
                "vault_usdc": v / 10 ** USDC_DECIMALS,
                "total_usdc": total / 10 ** USDC_DECIMALS,
            }

        if plan["direction"] == "treasury->vault":
            sender, to_addr, direction = self._treasury, self._vault.address, "treasury->vault"
        else:
            sender, to_addr, direction = self._vault, self._treasury.address, "vault->treasury"

        tx_hash = self._send_sync(sender, to_addr, amount)
        if not tx_hash:
            return None

        return {
            "tx_hash": tx_hash,
            "direction": direction,
            "amount_usdc": amount / 10 ** USDC_DECIMALS,
            "target_vault_pct": pct,
            "total_usdc": total / 10 ** USDC_DECIMALS,
            "arcscan_url": f"{config.ARCSCAN_TX_BASE}/{tx_hash}",
        }

    async def rebalance_capital(self, yield_pct: float) -> dict | None:
        """
        Move real native USDC so the vault holds ~yield_pct of the combined
        (treasury + vault) balance; the treasury keeps the safe remainder.
        Returns {tx_hash, direction, amount_usdc, arcscan_url, ...},
        {skipped: True, ...} when the delta is dust, or None on failure.
        """
        if not self._enabled:
            return None
        try:
            return await asyncio.to_thread(self._rebalance_sync, yield_pct)
        except Exception as exc:
            logger.error("Arc capital rebalance failed: %s", exc)
            return None

    # ── one-time bootstrap: seed the vault from the treasury ──────────────────

    def _bootstrap_sync(self, amount_usdc: float) -> str | None:
        amount_wei = int(amount_usdc * 10 ** USDC_DECIMALS)
        return self._send_sync(self._treasury, self._vault.address, amount_wei)

    async def bootstrap_vault(self, amount_usdc: float) -> str | None:
        """Seed the vault with an initial amount so bidirectional moves work."""
        if not self._enabled:
            return None
        try:
            return await asyncio.to_thread(self._bootstrap_sync, amount_usdc)
        except Exception as exc:
            logger.error("Arc vault bootstrap failed: %s", exc)
            return None
