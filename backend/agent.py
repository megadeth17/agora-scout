"""
Agora Scout — AI Agent core.
Uses Kimi K2 (OpenAI-compatible) for regime detection and allocation decisions.
Falls back to rule-based logic if API is unavailable.
"""
import json
import logging
import re

from openai import AsyncOpenAI

import config
import database as db
from data import gather_market_data

logger = logging.getLogger(__name__)

REGIME_PROMPT = """\
You are Agora Scout, an autonomous AI portfolio manager on Arc (a stablecoin-native L1).
Your job: detect the current market regime and decide how to allocate a USDC portfolio.

AVAILABLE ASSETS:
- USDC (cash, yield = 0%, risk = none)
- USYC (Circle tokenized T-bill fund, yield ≈ 4.5%, risk = near-zero)
- DeFi Yield (best available USDC pool, risk = smart contract)

MARKET DATA:
- ETH 24h change: {eth_change:+.2f}%
- BTC 24h change: {btc_change:+.2f}%
- Whale signal: {whale_signal} — {whale_summary}
- Whale positive ratio: {whale_positive_ratio:.0%}
- Top USDC yield: {top_yield_protocol} at {top_yield_apy:.2f}% APY
- Current portfolio: USDC {current_usdc:.0f}% / USYC {current_usyc:.0f}% / Yield {current_yield:.0f}%

REGIME RULES:
- BULL: ETH > +3% AND whales ACCUMULATING → risk-on → DeFi yield exposure
- BEAR: ETH < -3% OR whales DISTRIBUTING → risk-off → move to USYC
- SIDEWAYS: everything else → balanced → USYC + small yield exposure

OUTPUT (exact JSON, no extra text):
{{
  "regime": "BULL" | "BEAR" | "SIDEWAYS",
  "confidence": <integer 0-100>,
  "reasoning": "<2-3 sentence explanation>",
  "recommended_usdc_pct": <number 0-100>,
  "recommended_usyc_pct": <number 0-100>,
  "recommended_yield_pct": <number 0-100>
}}

Rules:
- The three percentages must sum to exactly 100.
- BULL: favor yield (30-50%), USYC (20-30%), remainder USDC.
- BEAR: favor USYC (50-70%), minimal yield (0-10%), remainder USDC.
- SIDEWAYS: USYC (30-50%), yield (10-20%), remainder USDC.
- confidence reflects how clear the signal is (>2 confirming indicators = 70+).
"""


class AgoraAgent:
    def __init__(self):
        self._client = None

    def _get_client(self) -> AsyncOpenAI | None:
        if not config.KIMI_API_KEY:
            return None
        if self._client is None:
            self._client = AsyncOpenAI(
                api_key=config.KIMI_API_KEY,
                base_url=config.KIMI_BASE_URL,
                timeout=60.0,
            )
        return self._client

    async def run_cycle(self) -> dict:
        """Full agent cycle: fetch data → decide regime → save → return decision."""
        logger.info("Agent cycle starting...")
        market = await gather_market_data()
        current = await db.get_portfolio_state()

        decision = await self._decide(market, current)
        decision_id = await db.save_regime_decision(decision)
        decision["id"] = decision_id

        # Check if rebalance is needed
        rebalance_needed = self._needs_rebalance(current, decision)
        decision["rebalance_needed"] = rebalance_needed

        if rebalance_needed:
            logger.info("Rebalance needed: %s → %s", current, decision)

        logger.info(
            "Agent cycle done: regime=%s confidence=%d rebalance=%s",
            decision["regime"],
            decision["confidence"],
            rebalance_needed,
        )
        return {**decision, "market": market}

    async def _decide(self, market: dict, current: dict) -> dict:
        prices = market.get("prices", {})
        whale = market.get("whale", {})

        prompt = REGIME_PROMPT.format(
            eth_change=prices.get("eth_change", 0.0),
            btc_change=prices.get("btc_change", 0.0),
            whale_signal=whale.get("signal", "NEUTRAL"),
            whale_summary=whale.get("summary", "No data"),
            whale_positive_ratio=whale.get("positive_ratio", 0.5),
            top_yield_protocol=market.get("top_yield_protocol", "none"),
            top_yield_apy=market.get("top_yield_apy", 0.0),
            current_usdc=current.get("usdc_pct", 100.0),
            current_usyc=current.get("usyc_pct", 0.0),
            current_yield=current.get("yield_pct", 0.0),
        )

        client = self._get_client()
        if client:
            try:
                response = await client.chat.completions.create(
                    model=config.KIMI_MODEL,
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=1500,
                    temperature=0.6,
                    extra_body={"thinking": {"type": "disabled"}},
                )
                raw = response.choices[0].message.content.strip()
                parsed = self._parse_decision(raw)
                if parsed:
                    return self._enrich_decision(parsed, market, whale)
            except Exception as exc:
                logger.error("Kimi API error: %s — using fallback", exc)

        # Rule-based fallback
        return self._fallback_decision(market, whale, current)

    def _parse_decision(self, raw: str) -> dict | None:
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", raw, re.DOTALL)
            if match:
                try:
                    return json.loads(match.group())
                except json.JSONDecodeError:
                    pass
        return None

    def _enrich_decision(self, parsed: dict, market: dict, whale: dict) -> dict:
        prices = market.get("prices", {})

        # Normalize percentages to sum to 100
        total = (
            parsed.get("recommended_usdc_pct", 0)
            + parsed.get("recommended_usyc_pct", 0)
            + parsed.get("recommended_yield_pct", 0)
        )
        if total != 100 and total > 0:
            factor = 100 / total
            parsed["recommended_usdc_pct"] = round(parsed.get("recommended_usdc_pct", 0) * factor, 1)
            parsed["recommended_usyc_pct"] = round(parsed.get("recommended_usyc_pct", 0) * factor, 1)
            parsed["recommended_yield_pct"] = round(parsed.get("recommended_yield_pct", 0) * factor, 1)

        valid_regimes = {"BULL", "BEAR", "SIDEWAYS"}
        if parsed.get("regime") not in valid_regimes:
            parsed["regime"] = "SIDEWAYS"

        parsed["confidence"] = max(0, min(100, int(parsed.get("confidence", 50))))
        parsed["whale_signal"] = whale.get("signal", "NEUTRAL")
        parsed["eth_change_24h"] = prices.get("eth_change", 0.0)
        parsed["btc_change_24h"] = prices.get("btc_change", 0.0)
        parsed["top_yield_protocol"] = market.get("top_yield_protocol", "none")
        parsed["top_yield_apy"] = market.get("top_yield_apy", 0.0)
        return parsed

    def _fallback_decision(self, market: dict, whale: dict, current: dict) -> dict:
        prices = market.get("prices", {})
        eth_change = prices.get("eth_change", 0.0)
        btc_change = prices.get("btc_change", 0.0)
        whale_signal = whale.get("signal", "NEUTRAL")

        bull_signals = 0
        bear_signals = 0

        if eth_change > 3:
            bull_signals += 1
        elif eth_change < -3:
            bear_signals += 1

        if btc_change > 3:
            bull_signals += 1
        elif btc_change < -3:
            bear_signals += 1

        if whale_signal == "ACCUMULATING":
            bull_signals += 2
        elif whale_signal == "DISTRIBUTING":
            bear_signals += 2

        if bull_signals >= 2:
            regime = "BULL"
            confidence = min(90, 50 + bull_signals * 15)
            usdc_pct = 20.0
            usyc_pct = 30.0
            yield_pct = 50.0
            reasoning = f"Bull regime: ETH {eth_change:+.1f}%, BTC {btc_change:+.1f}%, whales {whale_signal}. Increasing yield exposure."
        elif bear_signals >= 2:
            regime = "BEAR"
            confidence = min(90, 50 + bear_signals * 15)
            usdc_pct = 20.0
            usyc_pct = 70.0
            yield_pct = 10.0
            reasoning = f"Bear regime: ETH {eth_change:+.1f}%, BTC {btc_change:+.1f}%, whales {whale_signal}. Rotating to USYC."
        else:
            regime = "SIDEWAYS"
            confidence = 55
            usdc_pct = 30.0
            usyc_pct = 45.0
            yield_pct = 25.0
            reasoning = f"Sideways: mixed signals ETH {eth_change:+.1f}%, whales {whale_signal}. Balanced allocation."

        return {
            "regime": regime,
            "confidence": confidence,
            "reasoning": reasoning,
            "recommended_usdc_pct": usdc_pct,
            "recommended_usyc_pct": usyc_pct,
            "recommended_yield_pct": yield_pct,
            "whale_signal": whale_signal,
            "eth_change_24h": eth_change,
            "btc_change_24h": btc_change,
            "top_yield_protocol": market.get("top_yield_protocol", "none"),
            "top_yield_apy": market.get("top_yield_apy", 0.0),
        }

    def _needs_rebalance(self, current: dict, decision: dict) -> bool:
        """Rebalance only if any allocation drifts > MIN_REBALANCE_THRESHOLD_PCT."""
        threshold = config.MIN_REBALANCE_THRESHOLD_PCT
        checks = [
            abs(current.get("usdc_pct", 100) - decision.get("recommended_usdc_pct", 100)),
            abs(current.get("usyc_pct", 0) - decision.get("recommended_usyc_pct", 0)),
            abs(current.get("yield_pct", 0) - decision.get("recommended_yield_pct", 0)),
        ]
        return any(c >= threshold for c in checks)
