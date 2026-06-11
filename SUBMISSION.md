# Agora Agents Hackathon — Submission Form

## Project Name
Agora Scout

## Tagline (one sentence)
AI agent that detects market regime shifts by tracking Hyperliquid whale behavior and autonomously rebalances a USDC portfolio between DeFi yields and USYC safety.

## Problem Statement
Managing a stablecoin portfolio across market cycles is tedious and emotionally biased. Retail holders either sit idle in low-yield positions during bull markets or panic-sell during downturns. The signals that matter — whale positioning, yield spreads, regime shifts — are scattered across chains and APIs. No single tool watches them all, decides, and acts.

## Project Description
Agora Scout is an autonomous AI portfolio manager built on Arc. It runs a continuous loop:

1. **Data ingestion** — pulls real-time prices (CoinGecko), top USDC yields (DeFiLlama), and whale positioning from Hyperliquid's public leaderboard API.

2. **Regime detection** — analyzes top 20 HL traders by PnL. If 70%+ are profitable with avg PnL > $10K, the regime is ACCUMULATING (risk-on). If <40% profitable or avg PnL negative, it's DISTRIBUTING (risk-off). Mixed signals = NEUTRAL.

3. **AI decision engine** — Kimi K2 (Moonshot AI) receives the full market context and outputs a regime classification (BULL/BEAR/SIDEWAYS), confidence score, and target allocation between DeFi yield positions and USYC (Circle's tokenized money market fund) as safe harbor.

4. **Autonomous execution** — rebalances USDC allocations based on the AI's decision. Risk-on → more DeFi yield exposure. Risk-off → rotate to USYC for capital preservation with yield.

5. **Public dashboard** — React frontend showing live portfolio state, regime indicator, decision feed with reasoning, and yield rankings. Anyone can watch the agent think and act in real-time.

The agent cycles every 10 minutes autonomously, with a manual trigger button for on-demand analysis.

## Circle Tools Used
- **USDC (native on Arc)** — the treasury itself; moved as real native-USDC value transfers on every rebalance
- **Arc L1** — settlement for the decision commit (anchor tx) and the capital move (transfer tx)
- **Wallets API** — wallet provisioning and balance reads
- **USDC-native gas** — Arc pays gas in USDC; no separate paymaster/gas token
- **USYC** — intended mainnet T-bill instrument for the safe bucket (no testnet contract; modeled within the safe allocation on testnet)

## Tech Stack
- **Backend:** Python, FastAPI, aiohttp, aiosqlite
- **AI:** Kimi K2 (Moonshot AI) via OpenAI-compatible API
- **Frontend:** React, Vite, Recharts, TailwindCSS
- **Data Sources:** Hyperliquid API, DeFiLlama, CoinGecko
- **Infra:** Docker on Hetzner VPS (ARM64), Cloudflare Tunnel

## Traction
- Live deployed dashboard accessible publicly
- Discord post in #agora-hackers channel (May 24)
- Agent running autonomously making regime decisions every 10 minutes
- Full decision history with AI reasoning visible to any visitor

## GitHub Repository
https://github.com/megadeth17/agora-scout

## Live Demo URL
https://rehab-attached-lincoln-arch.trycloudflare.com

## Video Demo URL
*(pending — 3 min Loom walkthrough)*

## Team
Solo builder — @mega2608

## Contact
@mega2608 (see GitHub profile for contact)
