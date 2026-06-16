"""
Agora Scout — multi-tenant user accounts (self-serve).

Each user account is a pair of Arc wallets:
  - cash wallet  → the safe bucket; the user funds THIS address (faucet on testnet)
  - yield wallet → the at-risk bucket

The agent rebalances real native USDC between the two on every cycle, using the
same global regime decision as the showcase treasury. The user can withdraw all
funds to any address at any time.

Testnet only. Keys are stored in the DB in plaintext — acceptable for a faucet
pilot, NEVER for mainnet (mainnet needs Circle Wallets custody / KMS). Guarded by
config.EXECUTION_MODE == "live"; degrades to no-op otherwise.

This is additive — it does not touch the single-treasury showcase loop.
"""
import asyncio
import logging

import config
import database as db
from arc_transfer import USDC_DECIMALS, DUST_USDC, GAS_LIMIT, GAS_BUFFER_MULT, ArcTransfer

logger = logging.getLogger(__name__)


def _enabled() -> bool:
    return config.EXECUTION_MODE == "live" and bool(config.ARC_PRIVATE_KEY)


def _w3():
    from web3 import Web3
    return Web3(Web3.HTTPProvider(config.ARC_RPC_URL, request_kwargs={"timeout": 20}))


def _new_wallet() -> tuple[str, str]:
    from eth_account import Account
    a = Account.create()
    return a.address, a.key.hex()


def _balance_wei(w3, addr: str) -> int:
    return w3.eth.get_balance(addr)


def _send_sync(w3, from_key: str, to_addr: str, amount_wei: int) -> str | None:
    """Native-USDC value transfer. Same proven path as ArcTransfer (pending nonce,
    gas reserve, wait for receipt)."""
    from eth_account import Account
    sender = Account.from_key(from_key)
    gas_price = w3.eth.gas_price
    reserve = gas_price * GAS_LIMIT * GAS_BUFFER_MULT
    bal = w3.eth.get_balance(sender.address)
    if amount_wei + reserve > bal:
        amount_wei = bal - reserve
    if amount_wei <= 0:
        return None
    tx = {
        "chainId": config.ARC_CHAIN_ID,
        "from": sender.address,
        "to": to_addr,
        "value": int(amount_wei),
        "nonce": w3.eth.get_transaction_count(sender.address, "pending"),
        "gas": GAS_LIMIT,
        "gasPrice": gas_price,
    }
    signed = w3.eth.account.sign_transaction(tx, sender.key)
    raw = getattr(signed, "raw_transaction", None) or getattr(signed, "rawTransaction")
    h = w3.eth.send_raw_transaction(raw)
    w3.eth.wait_for_transaction_receipt(h, timeout=90)
    hx = h.hex()
    return hx if hx.startswith("0x") else "0x" + hx


# ── public async API ──────────────────────────────────────────────────────────

async def create_account(label: str = "") -> dict:
    """Generate a fresh cash+yield wallet pair for a new user."""
    import uuid
    cash_addr, cash_key = _new_wallet()
    yield_addr, yield_key = _new_wallet()
    secret = uuid.uuid4().hex
    account_id = await db.save_account({
        "label": (label or "")[:60],
        "secret": secret,
        "cash_addr": cash_addr,
        "cash_key": cash_key,
        "yield_addr": yield_addr,
        "yield_key": yield_key,
    })
    return {
        "id": account_id,
        "secret": secret,  # keep this — required to withdraw
        "deposit_address": cash_addr,
        "yield_address": yield_addr,
        "faucet": "https://faucet.circle.com",
        "note": "Send Arc testnet USDC to the deposit address. The agent starts managing it on the next cycle. Save your secret — you need it to withdraw.",
    }


def _state_sync(row: dict) -> dict:
    w3 = _w3()
    cash = _balance_wei(w3, row["cash_addr"])
    yld = _balance_wei(w3, row["yield_addr"])
    total = cash + yld
    d = 10 ** USDC_DECIMALS
    return {
        "id": row["id"],
        "label": row.get("label") or "",
        "deposit_address": row["cash_addr"],
        "yield_address": row["yield_addr"],
        "cash_usdc": cash / d,
        "yield_usdc": yld / d,
        "total_usdc": total / d,
        "yield_pct_actual": round(100 * yld / total, 1) if total else 0.0,
        "funded": total / d >= DUST_USDC,
    }


async def account_state(account_id: int) -> dict | None:
    row = await db.get_account(account_id)
    if not row:
        return None
    if not _enabled():
        # Without live mode we can't read chain balances meaningfully.
        return {"id": account_id, "deposit_address": row["cash_addr"], "funded": False,
                "cash_usdc": 0.0, "yield_usdc": 0.0, "total_usdc": 0.0, "live": False}
    try:
        state = await asyncio.to_thread(_state_sync, row)
        state["live"] = True
        return state
    except Exception as exc:
        logger.error("account_state %s failed: %s", account_id, exc)
        return None


def _rebalance_sync(row: dict, yield_pct: float) -> dict | None:
    w3 = _w3()
    cash = _balance_wei(w3, row["cash_addr"])
    yld = _balance_wei(w3, row["yield_addr"])
    plan = ArcTransfer.plan_move(cash, yld, yield_pct)
    if plan["skipped"]:
        return None
    amount = plan["amount_wei"]
    if plan["direction"] == "treasury->vault":   # cash → yield
        tx = _send_sync(w3, row["cash_key"], row["yield_addr"], amount)
        direction = "cash->yield"
    else:                                          # yield → cash
        tx = _send_sync(w3, row["yield_key"], row["cash_addr"], amount)
        direction = "yield->cash"
    if not tx:
        return None
    return {
        "tx_hash": tx,
        "direction": direction,
        "amount_usdc": amount / 10 ** USDC_DECIMALS,
        "arcscan_url": f"{config.ARCSCAN_TX_BASE}/{tx}",
    }


async def rebalance_account(account_id: int, yield_pct: float) -> dict | None:
    """Move real USDC between the account's cash and yield wallets to hit yield_pct."""
    if not _enabled():
        return None
    row = await db.get_account(account_id)
    if not row:
        return None
    try:
        res = await asyncio.to_thread(_rebalance_sync, row, yield_pct)
        if res:
            await db.save_account_rebalance({
                "account_id": account_id,
                "yield_pct": yield_pct,
                "tx_hash": res["tx_hash"],
                "direction": res["direction"],
                "amount_usdc": res["amount_usdc"],
            })
            logger.info("Account %s rebalanced: %.4f USDC %s", account_id,
                        res["amount_usdc"], res["direction"])
        return res
    except Exception as exc:
        logger.error("rebalance_account %s failed: %s", account_id, exc)
        return None


async def rebalance_all_funded(yield_pct: float) -> int:
    """Rebalance every funded account toward yield_pct. Returns count moved."""
    if not _enabled():
        return 0
    rows = await db.get_accounts()
    moved = 0
    for row in rows:
        try:
            state = await asyncio.to_thread(_state_sync, row)
        except Exception:
            continue
        if not state["funded"]:
            continue
        res = await rebalance_account(row["id"], yield_pct)
        if res:
            moved += 1
    return moved


def _withdraw_sync(row: dict, to_address: str) -> dict:
    from web3 import Web3
    w3 = _w3()
    to_address = Web3.to_checksum_address(to_address)
    out = {"transfers": []}
    for wallet_key, src in ((row["yield_key"], "yield"), (row["cash_key"], "cash")):
        bal = _balance_wei(w3, Web3.to_checksum_address(
            row["yield_addr"] if src == "yield" else row["cash_addr"]))
        if bal / 10 ** USDC_DECIMALS < DUST_USDC:
            continue
        tx = _send_sync(w3, wallet_key, to_address, bal)
        if tx:
            out["transfers"].append({"from": src, "tx_hash": tx,
                                     "arcscan_url": f"{config.ARCSCAN_TX_BASE}/{tx}"})
    return out


async def withdraw(account_id: int, to_address: str, secret: str = "") -> dict | None:
    """Send the account's full cash + yield balance to a user-specified address.
    Requires the account's secret (bearer) so only the owner can withdraw."""
    if not _enabled():
        return None
    row = await db.get_account(account_id)
    if not row:
        return None
    if not secret or secret != (row.get("secret") or ""):
        return {"error": "invalid_secret", "transfers": []}
    try:
        res = await asyncio.to_thread(_withdraw_sync, row, to_address)
        logger.info("Account %s withdrawn to %s: %d transfers", account_id,
                    to_address, len(res.get("transfers", [])))
        return res
    except Exception as exc:
        logger.error("withdraw %s failed: %s", account_id, exc)
        return {"error": str(exc), "transfers": []}
