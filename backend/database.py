"""
Agora Scout — SQLite persistence layer.
Tables: portfolio_state, regime_decisions, rebalances.
"""
import aiosqlite
import json
from datetime import datetime
from config import DATABASE_PATH

CREATE_PORTFOLIO_STATE = """
CREATE TABLE IF NOT EXISTS portfolio_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usdc_pct REAL NOT NULL DEFAULT 100.0,
    usyc_pct REAL NOT NULL DEFAULT 0.0,
    yield_pct REAL NOT NULL DEFAULT 0.0,
    total_value_usdc REAL NOT NULL DEFAULT 0.0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
"""

CREATE_REGIME_DECISIONS = """
CREATE TABLE IF NOT EXISTS regime_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    regime TEXT NOT NULL,
    confidence INTEGER NOT NULL,
    reasoning TEXT,
    whale_signal TEXT,
    eth_change_24h REAL,
    btc_change_24h REAL,
    top_yield_protocol TEXT,
    top_yield_apy REAL,
    recommended_usdc_pct REAL,
    recommended_usyc_pct REAL,
    recommended_yield_pct REAL,
    decided_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
"""

CREATE_REBALANCES = """
CREATE TABLE IF NOT EXISTS rebalances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_allocation TEXT,
    to_allocation TEXT,
    trigger_regime TEXT,
    status TEXT DEFAULT 'pending',
    tx_hash TEXT,
    decision_hash TEXT,
    anchored INTEGER DEFAULT 0,
    transfer_tx_hash TEXT,
    transfer_amount_usdc REAL,
    transfer_direction TEXT,
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
"""

# Idempotent column additions for pre-existing rebalances tables
REBALANCE_MIGRATIONS = [
    "ALTER TABLE rebalances ADD COLUMN decision_hash TEXT",
    "ALTER TABLE rebalances ADD COLUMN anchored INTEGER DEFAULT 0",
    "ALTER TABLE rebalances ADD COLUMN decision_payload TEXT",
    "ALTER TABLE rebalances ADD COLUMN transfer_tx_hash TEXT",
    "ALTER TABLE rebalances ADD COLUMN transfer_amount_usdc REAL",
    "ALTER TABLE rebalances ADD COLUMN transfer_direction TEXT",
]

CREATE_VISITORS = """
CREATE TABLE IF NOT EXISTS visitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    path TEXT NOT NULL DEFAULT '/',
    user_agent TEXT,
    visited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
"""

# Multi-tenant self-serve accounts (testnet). Keys stored plaintext — pilot only.
CREATE_ACCOUNTS = """
CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT,
    secret TEXT,
    cash_addr TEXT NOT NULL,
    cash_key TEXT NOT NULL,
    yield_addr TEXT NOT NULL,
    yield_key TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
"""

CREATE_ACCOUNT_REBALANCES = """
CREATE TABLE IF NOT EXISTS account_rebalances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    yield_pct REAL,
    tx_hash TEXT,
    direction TEXT,
    amount_usdc REAL,
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
"""

# x402 nanopayments settled on Arc (USDC paid per agent action via Circle Gateway).
CREATE_NANOPAYMENTS = """
CREATE TABLE IF NOT EXISTS nanopayments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payer TEXT,
    amount_usdc REAL,
    tx_hash TEXT,
    resource TEXT,
    settled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
"""


async def init_db() -> None:
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute(CREATE_PORTFOLIO_STATE)
        await db.execute(CREATE_REGIME_DECISIONS)
        await db.execute(CREATE_REBALANCES)
        await db.execute(CREATE_VISITORS)
        await db.execute(CREATE_ACCOUNTS)
        await db.execute(CREATE_ACCOUNT_REBALANCES)
        await db.execute(CREATE_NANOPAYMENTS)
        # Apply idempotent migrations (ignore "duplicate column" on existing DBs)
        for migration in REBALANCE_MIGRATIONS:
            try:
                await db.execute(migration)
            except Exception:
                pass
        # Seed initial portfolio state if empty
        cursor = await db.execute("SELECT COUNT(*) FROM portfolio_state")
        count = (await cursor.fetchone())[0]
        if count == 0:
            await db.execute(
                """INSERT INTO portfolio_state (usdc_pct, usyc_pct, yield_pct, total_value_usdc)
                   VALUES (100.0, 0.0, 0.0, 100.0)"""
            )
        await db.commit()


async def get_portfolio_state() -> dict:
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM portfolio_state ORDER BY id DESC LIMIT 1"
        )
        row = await cursor.fetchone()
        return dict(row) if row else {}


async def update_portfolio_state(state: dict) -> None:
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute(
            """INSERT INTO portfolio_state (usdc_pct, usyc_pct, yield_pct, total_value_usdc, updated_at)
               VALUES (:usdc_pct, :usyc_pct, :yield_pct, :total_value_usdc, :updated_at)""",
            {**state, "updated_at": datetime.utcnow().isoformat()},
        )
        await db.commit()


async def save_regime_decision(decision: dict) -> int:
    async with aiosqlite.connect(DATABASE_PATH) as db:
        cursor = await db.execute(
            """INSERT INTO regime_decisions
               (regime, confidence, reasoning, whale_signal, eth_change_24h, btc_change_24h,
                top_yield_protocol, top_yield_apy,
                recommended_usdc_pct, recommended_usyc_pct, recommended_yield_pct, decided_at)
               VALUES
               (:regime, :confidence, :reasoning, :whale_signal, :eth_change_24h, :btc_change_24h,
                :top_yield_protocol, :top_yield_apy,
                :recommended_usdc_pct, :recommended_usyc_pct, :recommended_yield_pct, :decided_at)""",
            {**decision, "decided_at": datetime.utcnow().isoformat()},
        )
        await db.commit()
        return cursor.lastrowid


async def get_regime_decisions(limit: int = 50) -> list:
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM regime_decisions ORDER BY decided_at DESC LIMIT ?", (limit,)
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]


async def save_rebalance(rebalance: dict) -> int:
    async with aiosqlite.connect(DATABASE_PATH) as db:
        cursor = await db.execute(
            """INSERT INTO rebalances
               (from_allocation, to_allocation, trigger_regime, status, tx_hash, decision_hash, decision_payload, anchored,
                transfer_tx_hash, transfer_amount_usdc, transfer_direction, executed_at)
               VALUES
               (:from_allocation, :to_allocation, :trigger_regime, :status, :tx_hash, :decision_hash, :decision_payload, :anchored,
                :transfer_tx_hash, :transfer_amount_usdc, :transfer_direction, :executed_at)""",
            {
                "from_allocation": json.dumps(rebalance.get("from_allocation", {})),
                "to_allocation": json.dumps(rebalance.get("to_allocation", {})),
                "trigger_regime": rebalance.get("trigger_regime", ""),
                "status": rebalance.get("status", "pending"),
                "tx_hash": rebalance.get("tx_hash", ""),
                "decision_hash": rebalance.get("decision_hash", ""),
                "decision_payload": rebalance.get("decision_payload", ""),
                "anchored": rebalance.get("anchored", 0),
                "transfer_tx_hash": rebalance.get("transfer_tx_hash", ""),
                "transfer_amount_usdc": rebalance.get("transfer_amount_usdc"),
                "transfer_direction": rebalance.get("transfer_direction", ""),
                "executed_at": datetime.utcnow().isoformat(),
            },
        )
        await db.commit()
        return cursor.lastrowid


async def get_rebalances(limit: int = 20) -> list:
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM rebalances ORDER BY executed_at DESC LIMIT ?", (limit,)
        )
        rows = await cursor.fetchall()
        from config import ARCSCAN_TX_BASE
        result = []
        for r in rows:
            d = dict(r)
            for key in ("from_allocation", "to_allocation"):
                if d.get(key) and isinstance(d[key], str):
                    try:
                        d[key] = json.loads(d[key])
                    except (json.JSONDecodeError, TypeError):
                        d[key] = {}
            # Only real anchored txs get a verifiable Arcscan link
            if d.get("anchored") and d.get("tx_hash"):
                d["arcscan_url"] = f"{ARCSCAN_TX_BASE}/{d['tx_hash']}"
            else:
                d["arcscan_url"] = None
            # Real native-USDC capital move (live mode) — its own Arcscan link
            if d.get("transfer_tx_hash"):
                d["transfer_arcscan_url"] = f"{ARCSCAN_TX_BASE}/{d['transfer_tx_hash']}"
            else:
                d["transfer_arcscan_url"] = None
            # Keep the list response lean — full payload is served by /api/verify
            d.pop("decision_payload", None)
            result.append(d)
        return result


async def get_rebalance_by_id(rebalance_id: int) -> dict | None:
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM rebalances WHERE id = ?", (rebalance_id,)
        )
        row = await cursor.fetchone()
        return dict(row) if row else None


async def record_visit(ip: str, path: str = "/", user_agent: str = "") -> None:
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute(
            "INSERT INTO visitors (ip, path, user_agent, visited_at) VALUES (?, ?, ?, ?)",
            (ip, path, user_agent, datetime.utcnow().isoformat()),
        )
        await db.commit()


async def save_account(account: dict) -> int:
    async with aiosqlite.connect(DATABASE_PATH, timeout=30.0) as db:
        await db.execute("PRAGMA busy_timeout=30000")
        cursor = await db.execute(
            """INSERT INTO accounts (label, secret, cash_addr, cash_key, yield_addr, yield_key, created_at)
               VALUES (:label, :secret, :cash_addr, :cash_key, :yield_addr, :yield_key, :created_at)""",
            {**account, "created_at": datetime.utcnow().isoformat()},
        )
        await db.commit()
        return cursor.lastrowid


async def get_account(account_id: int) -> dict | None:
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM accounts WHERE id = ?", (account_id,))
        row = await cursor.fetchone()
        return dict(row) if row else None


async def get_accounts() -> list:
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM accounts ORDER BY id ASC")
        return [dict(r) for r in await cursor.fetchall()]


async def save_account_rebalance(reb: dict) -> int:
    async with aiosqlite.connect(DATABASE_PATH, timeout=30.0) as db:
        await db.execute("PRAGMA busy_timeout=30000")
        cursor = await db.execute(
            """INSERT INTO account_rebalances (account_id, yield_pct, tx_hash, direction, amount_usdc, executed_at)
               VALUES (:account_id, :yield_pct, :tx_hash, :direction, :amount_usdc, :executed_at)""",
            {**reb, "executed_at": datetime.utcnow().isoformat()},
        )
        await db.commit()
        return cursor.lastrowid


async def get_account_rebalances(account_id: int, limit: int = 20) -> list:
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM account_rebalances WHERE account_id = ? ORDER BY id DESC LIMIT ?",
            (account_id, limit),
        )
        from config import ARCSCAN_TX_BASE
        out = []
        for r in await cursor.fetchall():
            d = dict(r)
            d["arcscan_url"] = f"{ARCSCAN_TX_BASE}/{d['tx_hash']}" if d.get("tx_hash") else None
            out.append(d)
        return out


async def save_nanopayment(np: dict) -> int:
    async with aiosqlite.connect(DATABASE_PATH, timeout=30.0) as db:
        await db.execute("PRAGMA busy_timeout=30000")
        cursor = await db.execute(
            """INSERT INTO nanopayments (payer, amount_usdc, tx_hash, resource, settled_at)
               VALUES (:payer, :amount_usdc, :tx_hash, :resource, :settled_at)""",
            {
                "payer": np.get("payer", ""),
                "amount_usdc": np.get("amount_usdc"),
                "tx_hash": np.get("tx_hash", ""),
                "resource": np.get("resource", ""),
                "settled_at": datetime.utcnow().isoformat(),
            },
        )
        await db.commit()
        return cursor.lastrowid


async def get_nanopayments(limit: int = 20) -> list:
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM nanopayments ORDER BY id DESC LIMIT ?", (limit,)
        )
        from config import ARCSCAN_TX_BASE
        out = []
        for r in await cursor.fetchall():
            d = dict(r)
            d["arcscan_url"] = f"{ARCSCAN_TX_BASE}/{d['tx_hash']}" if d.get("tx_hash") else None
            out.append(d)
        return out


async def count_nanopayments() -> dict:
    async with aiosqlite.connect(DATABASE_PATH) as db:
        n = (await (await db.execute("SELECT COUNT(*) FROM nanopayments")).fetchone())[0]
        vol = (await (await db.execute("SELECT COALESCE(SUM(amount_usdc),0) FROM nanopayments")).fetchone())[0]
        return {"total_nanopayments": n, "nanopayment_volume_usdc": round(vol or 0, 6)}


async def count_accounts() -> dict:
    async with aiosqlite.connect(DATABASE_PATH) as db:
        n = (await (await db.execute("SELECT COUNT(*) FROM accounts")).fetchone())[0]
        r = (await (await db.execute("SELECT COUNT(*) FROM account_rebalances")).fetchone())[0]
        return {"total_accounts": n, "total_account_rebalances": r}


async def get_traction() -> dict:
    async with aiosqlite.connect(DATABASE_PATH) as db:
        cursor = await db.execute("SELECT COUNT(*) FROM visitors")
        total_views = (await cursor.fetchone())[0]

        cursor = await db.execute("SELECT COUNT(DISTINCT ip) FROM visitors")
        unique_visitors = (await cursor.fetchone())[0]

        cursor = await db.execute(
            "SELECT COUNT(*) FROM visitors WHERE visited_at >= datetime('now', '-24 hours')"
        )
        views_today = (await cursor.fetchone())[0]

        cursor = await db.execute(
            "SELECT COUNT(DISTINCT ip) FROM visitors WHERE visited_at >= datetime('now', '-24 hours')"
        )
        unique_today = (await cursor.fetchone())[0]

        cursor = await db.execute("SELECT COUNT(*) FROM regime_decisions")
        total_decisions = (await cursor.fetchone())[0]

        cursor = await db.execute("SELECT COUNT(*) FROM rebalances")
        total_rebalances = (await cursor.fetchone())[0]

        cursor = await db.execute("SELECT COUNT(*) FROM rebalances WHERE anchored = 1")
        onchain_anchored = (await cursor.fetchone())[0]

        cursor = await db.execute(
            "SELECT COUNT(*) FROM visitors WHERE path = '/api/trigger'"
        )
        total_triggers = (await cursor.fetchone())[0]

        cursor = await db.execute("SELECT COUNT(*) FROM accounts")
        total_accounts = (await cursor.fetchone())[0]

        cursor = await db.execute("SELECT COUNT(*) FROM account_rebalances")
        total_account_rebalances = (await cursor.fetchone())[0]

        cursor = await db.execute("SELECT COUNT(*) FROM nanopayments")
        total_nanopayments = (await cursor.fetchone())[0]

        cursor = await db.execute("SELECT COALESCE(SUM(amount_usdc),0) FROM nanopayments")
        nanopayment_volume = (await cursor.fetchone())[0] or 0

    return {
        "total_page_views": total_views,
        "unique_visitors": unique_visitors,
        "views_today": views_today,
        "unique_today": unique_today,
        "total_decisions": total_decisions,
        "total_rebalances": total_rebalances,
        "onchain_anchored": onchain_anchored,
        "total_manual_triggers": total_triggers,
        "total_accounts": total_accounts,
        "total_account_rebalances": total_account_rebalances,
        "total_nanopayments": total_nanopayments,
        "nanopayment_volume_usdc": round(nanopayment_volume, 6),
    }


async def get_stats() -> dict:
    async with aiosqlite.connect(DATABASE_PATH) as db:
        cursor = await db.execute("SELECT COUNT(*) FROM regime_decisions")
        total_decisions = (await cursor.fetchone())[0]

        cursor = await db.execute(
            "SELECT COUNT(*) FROM regime_decisions WHERE decided_at >= datetime('now', '-24 hours')"
        )
        decisions_today = (await cursor.fetchone())[0]

        cursor = await db.execute("SELECT COUNT(*) FROM rebalances")
        total_rebalances = (await cursor.fetchone())[0]

        cursor = await db.execute(
            "SELECT regime, COUNT(*) as cnt FROM regime_decisions "
            "GROUP BY regime ORDER BY cnt DESC LIMIT 1"
        )
        row = await cursor.fetchone()
        dominant_regime = row[0] if row else "UNKNOWN"

        # Latest decision
        cursor = await db.execute(
            "SELECT regime, confidence, decided_at FROM regime_decisions ORDER BY decided_at DESC LIMIT 1"
        )
        latest = await cursor.fetchone()

    return {
        "total_decisions": total_decisions,
        "decisions_today": decisions_today,
        "total_rebalances": total_rebalances,
        "dominant_regime": dominant_regime,
        "latest_regime": latest[0] if latest else None,
        "latest_confidence": latest[1] if latest else None,
        "latest_decided_at": latest[2] if latest else None,
    }
