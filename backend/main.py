"""
Agora Scout — FastAPI orchestrator.
Runs the AI agent loop in background and serves REST + WebSocket API.
"""
import asyncio
import json
import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import config
import database as db
import accounts
from agent import AgoraAgent
from executor import CircleExecutor
from chain import ArcAnchor

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("main")

# Shared state
ws_clients: list[WebSocket] = []
agent = AgoraAgent()
executor = CircleExecutor()
verifier = ArcAnchor()  # read-only use: recompute hashes + fetch on-chain calldata

# Rate limiting: per-IP cooldown for /api/trigger (seconds)
TRIGGER_COOLDOWN = 60  # 1 call per IP per minute
_trigger_last: dict[str, float] = {}


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _check_rate_limit(ip: str) -> tuple[bool, int]:
    """Returns (allowed, retry_after_seconds)."""
    now = time.monotonic()
    last = _trigger_last.get(ip, 0)
    elapsed = now - last
    if elapsed < TRIGGER_COOLDOWN:
        return False, int(TRIGGER_COOLDOWN - elapsed)
    _trigger_last[ip] = now
    return True, 0


async def broadcast(payload: dict) -> None:
    text = json.dumps(payload)
    dead = []
    for ws in ws_clients:
        try:
            await ws.send_text(text)
        except Exception:
            dead.append(ws)
    for ws in dead:
        ws_clients.remove(ws)


async def agent_loop() -> None:
    """Main agent loop — runs every AGENT_INTERVAL_SECONDS."""
    # Wait a bit after startup so DB is ready
    await asyncio.sleep(5)

    while True:
        try:
            decision = await agent.run_cycle()

            # Get current portfolio state
            current = await db.get_portfolio_state()
            balance = await executor.get_usdc_balance()

            # Execute rebalance if needed
            rebalance = None
            if decision.get("rebalance_needed"):
                rebalance = await executor.execute_rebalance(
                    current=current,
                    target=decision,
                    regime=decision["regime"],
                    total_value=balance,
                )
                # Refresh current state after rebalance
                current = await db.get_portfolio_state()

            # Broadcast to all WebSocket clients
            await broadcast({
                "type": "agent_decision",
                "decision": {
                    "regime": decision.get("regime"),
                    "confidence": decision.get("confidence"),
                    "reasoning": decision.get("reasoning"),
                    "whale_signal": decision.get("whale_signal"),
                    "eth_change_24h": decision.get("eth_change_24h"),
                    "btc_change_24h": decision.get("btc_change_24h"),
                    "top_yield_protocol": decision.get("top_yield_protocol"),
                    "top_yield_apy": decision.get("top_yield_apy"),
                    "recommended_usdc_pct": decision.get("recommended_usdc_pct"),
                    "recommended_usyc_pct": decision.get("recommended_usyc_pct"),
                    "recommended_yield_pct": decision.get("recommended_yield_pct"),
                    "decided_at": decision.get("decided_at"),
                },
                "portfolio": {
                    "usdc_pct": current.get("usdc_pct"),
                    "usyc_pct": current.get("usyc_pct"),
                    "yield_pct": current.get("yield_pct"),
                    "total_value_usdc": current.get("total_value_usdc"),
                },
                "rebalance": rebalance,
                "market": {
                    "prices": decision.get("market", {}).get("prices", {}),
                    "top_yields": decision.get("market", {}).get("yields", [])[:3],
                },
            })

            # Multi-tenant: rebalance every funded user account toward the same
            # regime target. Additive — never blocks the showcase loop.
            try:
                moved = await accounts.rebalance_all_funded(
                    decision.get("recommended_yield_pct", 0) or 0
                )
                if moved:
                    logger.info("Rebalanced %d funded user account(s)", moved)
            except Exception as exc:
                logger.error("Account rebalance pass error: %s", exc)

        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.error("Agent loop error: %s", exc, exc_info=True)

        await asyncio.sleep(config.AGENT_INTERVAL_SECONDS)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.init_db()
    # Init wallet in background
    asyncio.create_task(executor.get_or_create_wallet())
    loop_task = asyncio.create_task(agent_loop())
    logger.info("Agora Scout started — agent loop active (interval=%ds)", config.AGENT_INTERVAL_SECONDS)
    yield
    loop_task.cancel()
    try:
        await loop_task
    except asyncio.CancelledError:
        pass
    logger.info("Agora Scout stopped")


app = FastAPI(title="Agora Scout", version="1.0.0", lifespan=lifespan)

# CORS: the dashboard calls the API same-origin (Vite proxies /api → backend),
# so it never exercises CORS. Restrict to known hosts + local dev; override via
# ALLOWED_ORIGINS (comma-separated) if the API is ever served cross-origin.
_default_origins = (
    "https://agora-scout.tail127286.ts.net,"
    "http://localhost:3003,http://localhost:5173"
)
ALLOWED_ORIGINS = [
    o.strip() for o in os.getenv("ALLOWED_ORIGINS", _default_origins).split(",") if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.middleware("http")
async def track_visitors(request: Request, call_next):
    """Track page views and API usage for traction metrics."""
    response = await call_next(request)
    # Track meaningful paths only (not health checks or static)
    path = request.url.path
    if path in ("/api/portfolio", "/api/decisions", "/api/stats", "/api/trigger"):
        ip = _get_client_ip(request)
        ua = request.headers.get("User-Agent", "")[:200]
        asyncio.create_task(db.record_visit(ip, path, ua))
    return response


# ── REST API ─────────────────────────────────────────────────────────────────

@app.get("/api/portfolio")
async def get_portfolio() -> dict:
    state = await db.get_portfolio_state()
    balance = await executor.get_usdc_balance()
    state["total_value_usdc"] = balance
    return state


@app.get("/api/decisions")
async def list_decisions(limit: int = 50) -> dict:
    decisions = await db.get_regime_decisions(limit=limit)
    return {"decisions": decisions, "count": len(decisions)}


@app.get("/api/rebalances")
async def list_rebalances(limit: int = 20) -> dict:
    rebalances = await db.get_rebalances(limit=limit)
    return {"rebalances": rebalances, "count": len(rebalances)}


@app.get("/api/stats")
async def stats() -> dict:
    return await db.get_stats()


@app.get("/api/timeline")
async def timeline(limit: int = 100) -> dict:
    """Decision timeline for performance chart."""
    decisions = await db.get_regime_decisions(limit=limit)
    # Return chronological order (oldest first) for charting
    decisions.reverse()
    return {"timeline": decisions, "count": len(decisions)}


@app.get("/api/traction")
async def traction() -> dict:
    """Public traction metrics for hackathon judges."""
    return await db.get_traction()


@app.get("/api/verify/{rebalance_id}")
async def verify_decision(rebalance_id: int) -> dict:
    """
    Independently verify a rebalance's commit-then-act proof end-to-end:
        stored payload → sha256 → on-chain calldata.

    Read-only: touches only our DB and a read-only Arc RPC call
    (eth_getTransactionByHash). No writes, no signing, no capital movement.
    `rebalance_id` is path-typed as int — non-integer input is rejected (422).
    """
    row = await db.get_rebalance_by_id(rebalance_id)
    if not row:
        return JSONResponse(status_code=404, content={"error": "rebalance not found"})

    stored_hash = row.get("decision_hash") or None
    payload = row.get("decision_payload") or None
    tx_hash = row.get("tx_hash") or None
    anchored = bool(row.get("anchored"))

    result = {
        "rebalance_id": rebalance_id,
        "anchored": anchored,
        "tx_hash": tx_hash,
        "arcscan_url": f"{config.ARCSCAN_TX_BASE}/{tx_hash}" if (anchored and tx_hash) else None,
        "stored_hash": stored_hash,
        "recomputed_hash": None,
        "onchain_calldata": None,
        "payload_matches_hash": None,   # Level 2: payload → hash
        "hash_matches_chain": None,     # Level 1: hash → on-chain calldata
        "verified": False,
    }

    # Level 2 — recompute the sha256 from the stored canonical payload.
    if payload:
        recomputed = ArcAnchor.hash_canonical(payload)
        result["recomputed_hash"] = recomputed
        result["payload_matches_hash"] = (
            bool(stored_hash) and recomputed.lower() == stored_hash.lower()
        )

    # Level 1 — compare the stored hash against the real on-chain calldata.
    if anchored and tx_hash:
        calldata = await verifier.fetch_onchain_calldata(tx_hash)
        result["onchain_calldata"] = calldata
        if calldata and stored_hash:
            result["hash_matches_chain"] = calldata.lower() == stored_hash.lower()

    # Verdict: anchored rows need the on-chain match (Level 1); if a payload is
    # present it must also reproduce the hash (Level 2). Legacy rows without a
    # stored payload verify on Level 1 alone. Simulated (un-anchored) rows can
    # only prove internal consistency (Level 2).
    if anchored:
        result["verified"] = (
            result["hash_matches_chain"] is True
            and result["payload_matches_hash"] is not False
        )
    else:
        result["verified"] = result["payload_matches_hash"] is True

    return result


@app.post("/api/trigger")
async def trigger_cycle(request: Request) -> dict:
    """Manually trigger an agent cycle (for demo/traction purposes)."""
    ip = _get_client_ip(request)
    allowed, retry_after = _check_rate_limit(ip)
    if not allowed:
        return JSONResponse(
            status_code=429,
            content={"error": "Too many requests", "retry_after_seconds": retry_after},
            headers={"Retry-After": str(retry_after)},
        )

    decision = await agent.run_cycle()
    current = await db.get_portfolio_state()
    rebalance = None
    if decision.get("rebalance_needed"):
        balance = await executor.get_usdc_balance()
        rebalance = await executor.execute_rebalance(
            current=current,
            target=decision,
            regime=decision["regime"],
            total_value=balance,
        )
    return {"decision": decision, "rebalance": rebalance}


# ── Multi-tenant accounts (self-serve) ────────────────────────────────────────

@app.post("/api/account")
async def create_account(request: Request) -> dict:
    """Create a self-serve account. Returns deposit address + secret (save it)."""
    ip = _get_client_ip(request)
    allowed, retry_after = _check_rate_limit(ip)
    if not allowed:
        return JSONResponse(status_code=429,
                            content={"error": "Too many requests", "retry_after_seconds": retry_after})
    try:
        body = await request.json()
    except Exception:
        body = {}
    label = (body or {}).get("label", "")
    return await accounts.create_account(label)


@app.get("/api/account/{account_id}")
async def get_account(account_id: int) -> dict:
    """Live on-chain state of a user account + its recent rebalances."""
    state = await accounts.account_state(account_id)
    if not state:
        return JSONResponse(status_code=404, content={"error": "account not found"})
    state["rebalances"] = await db.get_account_rebalances(account_id, limit=15)
    return state


@app.post("/api/account/{account_id}/withdraw")
async def withdraw_account(account_id: int, request: Request) -> dict:
    """Withdraw the account's full balance to a user-specified address (needs secret)."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    to_address = (body or {}).get("to_address", "").strip()
    secret = (body or {}).get("secret", "").strip()
    if not to_address:
        return JSONResponse(status_code=400, content={"error": "to_address required"})
    res = await accounts.withdraw(account_id, to_address, secret)
    if res is None:
        return JSONResponse(status_code=404, content={"error": "account not found or live mode off"})
    if res.get("error") == "invalid_secret":
        return JSONResponse(status_code=403, content={"error": "invalid secret"})
    return res


@app.post("/api/account/{account_id}/rebalance")
async def rebalance_account_now(account_id: int) -> dict:
    """On-demand rebalance of a user account toward the current regime target.
    Self-limiting: once at target the move is dust-skipped (no tx, no gas), so it
    needs no rate limit or secret — spamming it does nothing after the first move."""
    decisions = await db.get_regime_decisions(limit=1)
    yield_pct = (decisions[0].get("recommended_yield_pct") if decisions else 20) or 20
    res = await accounts.rebalance_account(account_id, yield_pct)
    if res is None:
        return {"moved": False, "target_yield_pct": yield_pct,
                "note": "already balanced or live mode off"}
    return {"moved": True, "target_yield_pct": yield_pct, **res}


@app.get("/api/accounts/stats")
async def accounts_stats() -> dict:
    return await db.count_accounts()


# ── x402 nanopayments (called by the payment sidecar after settlement) ─────────

@app.post("/api/internal/rebalance")
async def internal_rebalance(request: Request) -> dict:
    """Run an agent cycle after a USDC nanopayment settles on Arc via x402.
    Called ONLY by the payment sidecar (gated by X-Internal-Secret); no rate limit.
    The sidecar passes the settled payment so it's recorded as flowing volume."""
    if not config.INTERNAL_SECRET or request.headers.get("X-Internal-Secret") != config.INTERNAL_SECRET:
        return JSONResponse(status_code=403, content={"error": "forbidden"})
    try:
        body = await request.json()
    except Exception:
        body = {}

    # Record the nanopayment that paid for this call (the traction metric).
    amount = body.get("amount_usdc")
    tx_hash = body.get("tx_hash", "")
    if amount is not None or tx_hash:
        await db.save_nanopayment({
            "payer": body.get("payer", ""),
            "amount_usdc": amount,
            "tx_hash": tx_hash,
            "resource": body.get("resource", "/paid/rebalance"),
        })

    decision = await agent.run_cycle()
    current = await db.get_portfolio_state()
    rebalance = None
    if decision.get("rebalance_needed"):
        balance = await executor.get_usdc_balance()
        rebalance = await executor.execute_rebalance(
            current=current, target=decision, regime=decision["regime"], total_value=balance,
        )
    return {"paid": True, "regime": decision.get("regime"), "rebalance": rebalance}


@app.get("/api/nanopayments")
async def list_nanopayments(limit: int = 20) -> dict:
    payments = await db.get_nanopayments(limit=limit)
    return {"nanopayments": payments, "count": len(payments)}


@app.get("/api/nanopayments/stats")
async def nanopayments_stats() -> dict:
    return await db.count_nanopayments()


# ── WebSocket ─────────────────────────────────────────────────────────────────

@app.websocket("/ws/feed")
async def websocket_feed(websocket: WebSocket):
    await websocket.accept()
    ws_clients.append(websocket)

    # Send current state immediately on connect
    state = await db.get_portfolio_state()
    decisions = await db.get_regime_decisions(limit=1)
    await websocket.send_text(json.dumps({
        "type": "init",
        "portfolio": state,
        "latest_decision": decisions[0] if decisions else None,
    }))

    try:
        while True:
            await websocket.receive_text()  # heartbeat
    except WebSocketDisconnect:
        if websocket in ws_clients:
            ws_clients.remove(websocket)


# ── Health ────────────────────────────────────────────────────────────────────

def _health_payload() -> dict:
    return {
        "status": "ok",
        "ws_clients": len(ws_clients),
        "agent_interval_seconds": config.AGENT_INTERVAL_SECONDS,
        "execution_mode": config.EXECUTION_MODE,
        "live_transfers": executor._transfer.enabled,
        "anchoring_enabled": verifier.enabled,
    }


@app.get("/health")
async def health() -> dict:
    return _health_payload()


# Same payload under /api so it's reachable through the frontend proxy
# (Vite proxies only /api and /ws to the backend — bare /health hits the SPA).
@app.get("/api/health")
async def api_health() -> dict:
    return _health_payload()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
