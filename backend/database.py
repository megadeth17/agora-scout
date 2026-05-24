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
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
"""

# Idempotent column additions for pre-existing rebalances tables
REBALANCE_MIGRATIONS = [
    "ALTER TABLE rebalances ADD COLUMN decision_hash TEXT",
    "ALTER TABLE rebalances ADD COLUMN anchored INTEGER DEFAULT 0",
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


async def init_db() -> None:
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute(CREATE_PORTFOLIO_STATE)
        await db.execute(CREATE_REGIME_DECISIONS)
        await db.execute(CREATE_REBALANCES)
        await db.execute(CREATE_VISITORS)
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
               (from_allocation, to_allocation, trigger_regime, status, tx_hash, decision_hash, anchored, executed_at)
               VALUES
               (:from_allocation, :to_allocation, :trigger_regime, :status, :tx_hash, :decision_hash, :anchored, :executed_at)""",
            {
                "from_allocation": json.dumps(rebalance.get("from_allocation", {})),
                "to_allocation": json.dumps(rebalance.get("to_allocation", {})),
                "trigger_regime": rebalance.get("trigger_regime", ""),
                "status": rebalance.get("status", "pending"),
                "tx_hash": rebalance.get("tx_hash", ""),
                "decision_hash": rebalance.get("decision_hash", ""),
                "anchored": rebalance.get("anchored", 0),
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
            result.append(d)
        return result


async def record_visit(ip: str, path: str = "/", user_agent: str = "") -> None:
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute(
            "INSERT INTO visitors (ip, path, user_agent, visited_at) VALUES (?, ?, ?, ?)",
            (ip, path, user_agent, datetime.utcnow().isoformat()),
        )
        await db.commit()


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

    return {
        "total_page_views": total_views,
        "unique_visitors": unique_visitors,
        "views_today": views_today,
        "unique_today": unique_today,
        "total_decisions": total_decisions,
        "total_rebalances": total_rebalances,
        "onchain_anchored": onchain_anchored,
        "total_manual_triggers": total_triggers,
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
