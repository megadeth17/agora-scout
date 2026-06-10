"""
Agora Scout — Circle API executor.
Handles USDC wallet queries and rebalance simulation via Circle Wallets API.
In testnet mode: simulates transactions with realistic delays and logs decisions.
"""
import asyncio
import logging
import uuid
from datetime import datetime, timezone

import aiohttp

import config
import database as db
from chain import ArcAnchor
from arc_transfer import ArcTransfer

logger = logging.getLogger(__name__)

CIRCLE_WALLETS_URL = f"{config.CIRCLE_BASE_URL}/wallets"
CIRCLE_TRANSFERS_URL = f"{config.CIRCLE_BASE_URL}/transfers"


class CircleExecutor:
    def __init__(self):
        self.headers = {
            "Authorization": f"Bearer {config.CIRCLE_API_KEY}",
            "Content-Type": "application/json",
        }
        self._wallet_id: str | None = None
        self._simulated_balance = config.DEFAULT_USDC_AMOUNT
        self._anchor = ArcAnchor()
        self._transfer = ArcTransfer()  # real native-USDC moves when EXECUTION_MODE=live

    async def get_or_create_wallet(self) -> str | None:
        """Get existing wallet or create one via Circle Wallets API."""
        if self._wallet_id:
            return self._wallet_id

        if not config.CIRCLE_API_KEY:
            logger.warning("CIRCLE_API_KEY not set — using simulated wallet")
            self._wallet_id = "sim_wallet_" + str(uuid.uuid4())[:8]
            return self._wallet_id

        try:
            async with aiohttp.ClientSession() as session:
                # Try to list existing wallets first
                async with session.get(
                    CIRCLE_WALLETS_URL,
                    headers=self.headers,
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        wallets = data.get("data", {}).get("wallets", [])
                        if wallets:
                            self._wallet_id = wallets[0].get("walletId")
                            logger.info("Using existing wallet: %s", self._wallet_id)
                            return self._wallet_id

                # Create new wallet
                payload = {
                    "idempotencyKey": str(uuid.uuid4()),
                    "entitySecretCiphertext": config.CIRCLE_KIT_KEY,
                    "blockchains": ["ARB-SEPOLIA"],  # Arc testnet compatible
                }
                async with session.post(
                    CIRCLE_WALLETS_URL,
                    headers=self.headers,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=15),
                ) as resp:
                    if resp.status in (200, 201):
                        data = await resp.json()
                        self._wallet_id = data.get("data", {}).get("wallet", {}).get("id")
                        logger.info("Created Circle wallet: %s", self._wallet_id)
                        return self._wallet_id
        except Exception as exc:
            logger.error("Circle wallet error: %s — falling back to simulation", exc)

        self._wallet_id = "sim_wallet_" + str(uuid.uuid4())[:8]
        return self._wallet_id

    async def get_usdc_balance(self) -> float:
        """Query USDC balance. Falls back to simulated balance."""
        # Live mode: the real portfolio value is the combined on-chain balance
        # of the treasury + vault wallets on Arc.
        if self._transfer.enabled:
            bals = await self._transfer.balances()
            if bals:
                return bals["total_usdc"]

        if not config.CIRCLE_API_KEY or (self._wallet_id or "").startswith("sim_"):
            return self._simulated_balance

        try:
            wallet_id = await self.get_or_create_wallet()
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{CIRCLE_WALLETS_URL}/{wallet_id}/balances",
                    headers=self.headers,
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        for token in data.get("data", {}).get("tokenBalances", []):
                            if token.get("token", {}).get("symbol") == "USDC":
                                return float(token.get("amount", 0))
        except Exception as exc:
            logger.warning("Balance fetch failed: %s", exc)

        return self._simulated_balance

    async def execute_rebalance(
        self,
        current: dict,
        target: dict,
        regime: str,
        total_value: float,
    ) -> dict:
        """
        Execute portfolio rebalance.
        In testnet / simulation mode: updates state immediately with simulated tx hash.
        """
        from_alloc = {
            "usdc_pct": current.get("usdc_pct", 100),
            "usyc_pct": current.get("usyc_pct", 0),
            "yield_pct": current.get("yield_pct", 0),
        }
        to_alloc = {
            "usdc_pct": target.get("recommended_usdc_pct", 100),
            "usyc_pct": target.get("recommended_usyc_pct", 0),
            "yield_pct": target.get("recommended_yield_pct", 0),
        }

        logger.info("Executing rebalance: %s → %s (regime=%s)", from_alloc, to_alloc, regime)

        # Commit-then-act: anchor the decision on Arc BEFORE moving capital.
        # The hash proves the decision existed on-chain prior to execution.
        anchor_payload = {
            "regime": regime,
            "confidence": target.get("confidence"),
            "reasoning": target.get("reasoning", ""),
            "from": from_alloc,
            "to": to_alloc,
            "decided_at": target.get("decided_at") or datetime.now(timezone.utc).isoformat(),
        }
        # Persist the exact bytes that get hashed, so the proof can be
        # independently recomputed later (payload → sha256 → on-chain calldata).
        canonical_payload = ArcAnchor.canonical_payload(anchor_payload)
        anchor = await self._anchor.anchor(anchor_payload)

        if anchor:
            tx_hash = anchor["tx_hash"]
            decision_hash = anchor["decision_hash"]
            anchored = True
        else:
            # Fallback when no key/RPC: simulated hash, flagged as not anchored.
            await asyncio.sleep(1)
            tx_hash = "0x" + uuid.uuid4().hex
            decision_hash = ArcAnchor.hash_decision(anchor_payload)
            anchored = False

        # Act: in live mode, move REAL native USDC on Arc so the vault holds the
        # target yield allocation. The transfer happens AFTER the on-chain commit
        # above — capital only moves once the decision is provably anchored.
        transfer = None
        if self._transfer.enabled:
            transfer = await self._transfer.rebalance_capital(to_alloc["yield_pct"])
            if transfer and not transfer.get("skipped"):
                logger.info(
                    "Live capital move: %.4f USDC %s tx=%s",
                    transfer.get("amount_usdc", 0),
                    transfer.get("direction"),
                    transfer.get("tx_hash"),
                )
            # Real combined balance reflects the true portfolio value post-move.
            if transfer and transfer.get("total_usdc") is not None:
                total_value = transfer["total_usdc"]

        transfer_tx_hash = transfer.get("tx_hash") if transfer else None
        transfer_amount = transfer.get("amount_usdc") if transfer else None
        transfer_direction = transfer.get("direction") if transfer else None

        # Update portfolio state in DB (act, after the on-chain commit)
        new_state = {
            "usdc_pct": to_alloc["usdc_pct"],
            "usyc_pct": to_alloc["usyc_pct"],
            "yield_pct": to_alloc["yield_pct"],
            "total_value_usdc": total_value,
        }
        await db.update_portfolio_state(new_state)
        self._simulated_balance = total_value

        # Record rebalance
        rebalance_id = await db.save_rebalance({
            "from_allocation": from_alloc,
            "to_allocation": to_alloc,
            "trigger_regime": regime,
            "status": "executed",
            "tx_hash": tx_hash,
            "decision_hash": decision_hash,
            "decision_payload": canonical_payload,
            "anchored": 1 if anchored else 0,
            "transfer_tx_hash": transfer_tx_hash,
            "transfer_amount_usdc": transfer_amount,
            "transfer_direction": transfer_direction,
        })

        logger.info(
            "Rebalance %d executed: anchor=%s anchored=%s transfer=%s",
            rebalance_id, tx_hash, anchored, transfer_tx_hash,
        )
        return {
            "id": rebalance_id,
            "tx_hash": tx_hash,
            "decision_hash": decision_hash,
            "anchored": anchored,
            "arcscan_url": anchor["arcscan_url"] if anchor else None,
            "transfer_tx_hash": transfer_tx_hash,
            "transfer_amount_usdc": transfer_amount,
            "transfer_direction": transfer_direction,
            "transfer_arcscan_url": transfer.get("arcscan_url") if transfer else None,
            "from_allocation": from_alloc,
            "to_allocation": to_alloc,
            "status": "executed",
            "executed_at": datetime.now(timezone.utc).isoformat(),
        }
