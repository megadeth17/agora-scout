"""
Agora Scout — FastAPI orchestrator.
Runs the AI agent loop in background and serves REST + WebSocket API.
"""
import asyncio
import json
import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import config
import database as db
from agent import AgoraAgent
from executor import CircleExecutor

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("main")

# Shared state
ws_clients: list[WebSocket] = []
agent = AgoraAgent()
executor = CircleExecutor()

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


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

@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "ws_clients": len(ws_clients),
        "agent_interval_seconds": config.AGENT_INTERVAL_SECONDS,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
