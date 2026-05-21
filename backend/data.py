"""
Agora Scout — data layer.
Sources: Hyperliquid leaderboard, DeFiLlama yields, CoinGecko prices.
All fetches are async and fault-tolerant — one failure doesn't block others.
"""
import asyncio
import logging
from datetime import datetime, timezone

import aiohttp

logger = logging.getLogger(__name__)

# Hyperliquid public API
HL_STATS_URL = "https://stats-data.hyperliquid.xyz/Mainnet/user_stats"
HL_LEADERBOARD_URL = "https://api.hyperliquid.xyz/info"

# DeFiLlama yields
DEFILLAMA_POOLS_URL = "https://yields.llama.fi/pools"

# CoinGecko — no auth required for basic endpoints
COINGECKO_PRICE_URL = (
    "https://api.coingecko.com/api/v3/simple/price"
    "?ids=ethereum,bitcoin&vs_currencies=usd&include_24hr_change=true"
)

# USDC-bearing protocols to track (DeFiLlama pool symbols)
USDC_PROTOCOLS = {"aave-v3", "compound-v3", "morpho", "euler", "fluid"}


async def _get(session: aiohttp.ClientSession, url: str, **kwargs) -> dict | list | None:
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=10), **kwargs) as resp:
            if resp.status == 200:
                return await resp.json()
    except Exception as exc:
        logger.warning("GET %s failed: %s", url, exc)
    return None


async def get_prices() -> dict:
    """Returns ETH and BTC price + 24h change."""
    async with aiohttp.ClientSession() as session:
        data = await _get(session, COINGECKO_PRICE_URL)
    if not data:
        return {"eth": 0.0, "btc": 0.0, "eth_change": 0.0, "btc_change": 0.0}
    return {
        "eth": data.get("ethereum", {}).get("usd", 0.0),
        "btc": data.get("bitcoin", {}).get("usd", 0.0),
        "eth_change": data.get("ethereum", {}).get("usd_24h_change", 0.0),
        "btc_change": data.get("bitcoin", {}).get("usd_24h_change", 0.0),
    }


async def get_top_usdc_yields(top_n: int = 5) -> list[dict]:
    """Fetch USDC pools from DeFiLlama, return top N by APY."""
    async with aiohttp.ClientSession() as session:
        data = await _get(session, DEFILLAMA_POOLS_URL)

    if not data or "data" not in data:
        return []

    usdc_pools = [
        p for p in data["data"]
        if "usdc" in (p.get("symbol") or "").lower()
        and p.get("apy") is not None
        and p.get("tvlUsd", 0) > 500_000   # min $500K TVL
        and p.get("apy", 0) <= 100.0        # cap out reward-inflated outliers
        and p.get("apy", 0) > 0.1           # ignore near-zero pools
    ]

    usdc_pools.sort(key=lambda p: p.get("apy", 0), reverse=True)

    return [
        {
            "protocol": p.get("project", "unknown"),
            "chain": p.get("chain", "unknown"),
            "symbol": p.get("symbol", ""),
            "apy": round(p.get("apy", 0), 2),
            "tvl_usd": p.get("tvlUsd", 0),
            "pool_id": p.get("pool", ""),
        }
        for p in usdc_pools[:top_n]
    ]


async def get_whale_migration_signal() -> dict:
    """
    Analyze Hyperliquid top traders' recent activity.
    Returns a signal: ACCUMULATING | DISTRIBUTING | NEUTRAL
    with details about the observed pattern.

    Uses HL public leaderboard — no auth required.
    """
    try:
        async with aiohttp.ClientSession() as session:
            # Get top traders by PnL
            payload = {"type": "leaderboard"}
            async with session.post(
                HL_LEADERBOARD_URL,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=15),
            ) as resp:
                if resp.status != 200:
                    return _neutral_whale_signal("HL API unavailable")
                raw = await resp.json()

        leaderboard = raw if isinstance(raw, list) else raw.get("leaderboardRows", [])
        if not leaderboard:
            return _neutral_whale_signal("Empty leaderboard")

        # Sample top 20 by 30-day PnL
        top_traders = sorted(
            leaderboard,
            key=lambda x: float(x.get("pnl", 0) or 0),
            reverse=True,
        )[:20]

        # Calculate average recent performance trend
        recent_pnls = []
        for t in top_traders:
            pnl = float(t.get("pnl", 0) or 0)
            recent_pnls.append(pnl)

        if not recent_pnls:
            return _neutral_whale_signal("No PnL data")

        avg_pnl = sum(recent_pnls) / len(recent_pnls)
        positive_count = sum(1 for p in recent_pnls if p > 0)
        positive_ratio = positive_count / len(recent_pnls)

        # Signal logic
        if positive_ratio > 0.7 and avg_pnl > 10_000:
            signal = "ACCUMULATING"
            summary = f"{int(positive_ratio*100)}% of top 20 HL whales profitable — risk-on behavior"
        elif positive_ratio < 0.4 or avg_pnl < -5_000:
            signal = "DISTRIBUTING"
            summary = f"Only {int(positive_ratio*100)}% profitable — whales reducing exposure"
        else:
            signal = "NEUTRAL"
            summary = f"Mixed signals: {int(positive_ratio*100)}% profitable, avg PnL ${avg_pnl:,.0f}"

        return {
            "signal": signal,
            "summary": summary,
            "positive_ratio": round(positive_ratio, 2),
            "avg_pnl": round(avg_pnl, 2),
            "sample_size": len(recent_pnls),
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }

    except Exception as exc:
        logger.error("Whale signal fetch failed: %s", exc)
        return _neutral_whale_signal(f"Error: {exc}")


def _neutral_whale_signal(reason: str) -> dict:
    return {
        "signal": "NEUTRAL",
        "summary": reason,
        "positive_ratio": 0.5,
        "avg_pnl": 0.0,
        "sample_size": 0,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


async def gather_market_data() -> dict:
    """Fetch all market data concurrently. Returns unified context dict."""
    prices_task = asyncio.create_task(get_prices())
    yields_task = asyncio.create_task(get_top_usdc_yields())
    whale_task = asyncio.create_task(get_whale_migration_signal())

    prices, yields, whale = await asyncio.gather(
        prices_task, yields_task, whale_task, return_exceptions=True
    )

    # Handle any failures gracefully
    if isinstance(prices, Exception):
        logger.error("Prices fetch failed: %s", prices)
        prices = {"eth": 0.0, "btc": 0.0, "eth_change": 0.0, "btc_change": 0.0}
    if isinstance(yields, Exception):
        logger.error("Yields fetch failed: %s", yields)
        yields = []
    if isinstance(whale, Exception):
        logger.error("Whale fetch failed: %s", whale)
        whale = _neutral_whale_signal("Gather exception")

    top_yield = yields[0] if yields else {"protocol": "none", "apy": 0.0}

    return {
        "prices": prices,
        "yields": yields,
        "whale": whale,
        "top_yield_protocol": top_yield.get("protocol", "none"),
        "top_yield_apy": top_yield.get("apy", 0.0),
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }
