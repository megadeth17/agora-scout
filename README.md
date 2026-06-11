# Agora Scout — Agentic Treasury Manager on Arc

> Autonomous AI agent that detects market regime from Hyperliquid whale behavior and rebalances a real USDC treasury between a safe bucket (cash / T-bills) and a yield bucket — **moving real native USDC on Arc on every decision**, with each decision cryptographically committed on-chain *before* capital moves.

Built for the [Agora Agents Hackathon](https://agora.thecanteenapp.com/) by Canteen + Circle. Now extended for the [Circle Developer Grant](https://www.circle.com/grant) as agentic treasury management.

## What it does

1. **Whale Signal** — Samples top 20 Hyperliquid traders. Positive PnL ratio → ACCUMULATING (bull). Negative → DISTRIBUTING (bear).
2. **Regime Detection** — Kimi K2 AI combines whale signal + ETH/BTC 24h change → BULL / BEAR / SIDEWAYS.
3. **Allocation Decision** — AI determines a target split between a safe bucket (cash + T-bill yield) and an at-risk DeFi-yield bucket.
4. **Commit-then-act execution** — when allocation drift exceeds 5%, the agent (a) anchors `sha256(decision)` in an Arc transaction's calldata, then (b) **moves real native USDC** between the treasury and vault wallets to match the target. Two on-chain steps: the commit proves the decision existed *before* any capital moved.
5. **Public verifier** — anyone can recompute the hash and check it against the on-chain calldata via `/api/verify/{id}`. Capital is read-only auditable end to end: `payload → sha256 → on-chain`.
6. **Live Dashboard** — Public React UI shows every decision, the real USDC transfer, and the proof, in real-time.

> On Arc, USDC is the native gas/value token (18-decimal). "Moving capital" is therefore a native value transfer between the agent's wallets — verifiable on [Arcscan](https://testnet.arcscan.app). Set `EXECUTION_MODE=live` to enable real transfers (default `simulate`).

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
ssh root@<your-vps-ip>
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
| Execution | Real native-USDC transfers on Arc (web3.py) + Circle Wallets API |
| Backend | FastAPI + aiosqlite |
| Frontend | React + Vite (static build, nginx) + Recharts |
| Chain | Arc (chain ID 5042002, USDC-native) |
| Hosting | Hetzner (Docker) |

## Circle / Arc integrations used

- **USDC (native on Arc)** — the agent moves real native USDC between its treasury and vault wallets on every rebalance. This is the core flow of value.
- **Arc L1** — settlement layer for both the decision commit (anchor tx) and the capital move (value transfer). Each is a real Arc transaction.
- **Circle Wallets API** — wallet provisioning and balance reads.
- **USDC-native gas** — Arc uses USDC for gas, so no separate paymaster or volatile gas token is needed.
- **Safe bucket** — the risk-off allocation (USDC cash + intended USYC T-bills). On testnet it is held as native USDC in the treasury; USYC is the intended mainnet instrument.

> Honesty note for reviewers: the safe/yield split is enforced by real native-USDC transfers between two agent-controlled wallets on Arc testnet. There is no live USYC token contract on testnet, so the T-bill bucket is modeled within the safe allocation rather than swapped into a USYC token.

## Verifiable on-chain (testnet)

- Decision commit (anchor): zero-value tx carrying `sha256(decision)` in calldata.
- Capital move (transfer): real native-USDC value transfer between treasury and vault.
- Public verification: `GET /api/verify/{rebalance_id}` recomputes the hash and checks it against the on-chain calldata.
