# Agora Scout — AI Portfolio Manager on Arc

> Autonomous AI agent that tracks Hyperliquid whale migration, detects market regimes, and rebalances a USDC portfolio between cash, USYC (tokenized T-bills), and DeFi yields on Arc.

Built for the [Agora Agents Hackathon](https://agora.thecanteenapp.com/) by Canteen + Circle.

## What it does

1. **Whale Signal** — Samples top 20 Hyperliquid traders. Positive PnL ratio → ACCUMULATING (bull). Negative → DISTRIBUTING (bear).
2. **Regime Detection** — Kimi K2 AI combines whale signal + ETH/BTC 24h change → BULL / BEAR / SIDEWAYS.
3. **Allocation Decision** — AI determines target split: USDC (cash) / USYC (T-bill yield) / DeFi USDC yield.
4. **Rebalance Execution** — Circle Wallets API moves funds when drift exceeds 5%.
5. **Live Dashboard** — Public React UI shows every decision in real-time via WebSocket.

## Quick start (local)

```bash
# Backend
cd backend
pip install -r requirements.txt
cp ../.env .env   # set CIRCLE_API_KEY, KIMI_API_KEY
python main.py

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

Open http://localhost:3003

## Deploy to VPS

```bash
ssh root@178.104.36.180
git clone https://github.com/YOUR_USER/agora-scout.git
cd agora-scout
cp .env.example .env   # fill secrets
docker compose up -d
```

## Stack

| Layer | Tech |
|-------|------|
| AI Agent | Kimi K2 (moonshot-v1-8k, OpenAI-compatible) |
| Data | Hyperliquid API + DeFiLlama + CoinGecko |
| Execution | Circle Wallets API + USYC |
| Backend | FastAPI + aiosqlite |
| Frontend | React + Vite + Recharts |
| Chain | Arc (chain ID 5042002, USDC-native) |
| Hosting | Hetzner CAX11 + Docker |

## Circle integrations used

- **USDC** — base settlement currency
- **USYC** — risk-off allocation (tokenized T-bill fund)
- **Circle Wallets API** — embedded wallet management
- **Paymaster** — USDC gas fees (no volatile token needed)

## Judging criteria coverage

| Criterion | Implementation |
|-----------|---------------|
| Agentic Sophistication (30%) | Full autonomy loop: data → AI decision → execution |
| Traction (30%) | Public dashboard, no login required |
| Circle Tool Usage (20%) | USDC + USYC + Wallets API |
| Innovation (20%) | HL whale migration index as regime signal |
