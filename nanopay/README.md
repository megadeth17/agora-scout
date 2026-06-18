# Agora Scout — nanopay (x402 sidecar)

A tiny Node.js payment sidecar that puts Agora Scout's rebalance trigger behind a
**$0.01 USDC micropayment** on the **Arc testnet**, using Circle Gateway x402
batching (`@circle-fin/x402-batching`).

It's a paywall, nothing more: when a paid call settles on-chain, the sidecar
POSTs to the internal Agora FastAPI backend (`/api/trigger`) to run a real
rebalance cycle. The agent's business logic stays in FastAPI.

## Flow

```
pay-agent.mjs                 server.mjs (sidecar)              FastAPI backend
─────────────                 ────────────────────              ───────────────
fund ephemeral wallet
deposit 1 USDC -> Gateway
gateway.pay(POST /paid/rebalance)
        │ 1. GET endpoint, no payment -> 402 + PAYMENT-REQUIRED
        │ 2. retry with signed payment
        ├──────────────────────────────► verify()  (BatchFacilitatorClient)
        │                                 settle()  -> on-chain tx on Arc
        │                                 POST /api/trigger ───────────► run_cycle()
        │                                   (X-Internal-Secret header)    + rebalance
        ◄────────────── 200 { decision, rebalance, payment:{ tx, arcscan } }
```

Buyer pays $0.01 USDC per call via Gateway x402 → sidecar verifies + settles on
Arc → triggers the Agora rebalance and returns the FastAPI JSON plus the
settlement tx hash.

## Run

```bash
cd nanopay
npm install

# Configure
cp .env.example .env
#   - SELLER_ADDRESS / SELLER_PRIVATE_KEY : receives payments + signs settlement
#   - BUYER_ADDRESS / BUYER_PRIVATE_KEY   : fund via the Circle Arc testnet faucet
#   - FASTAPI_URL                         : the running Agora backend (default :8001)
#   - INTERNAL_SECRET                     : shared secret for /api/trigger

# Start the sidecar (paywall) — make sure the FastAPI backend is also running
npm start

# In another shell, run the paying agent (1 paid rebalance by default)
npm run pay
#   COUNT=5 npm run pay   # pay for 5 rebalances
```

Health check: `GET http://localhost:3402/health` → `{ "status": "ok", "seller": "0x..." }`

## Arc testnet constants

| | |
|---|---|
| Network | `eip155:5042002` |
| USDC | `0x3600000000000000000000000000000000000000` |
| Gateway Wallet | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` |
| RPC | `https://rpc.testnet.arc.network` |

## Notes

- Real keys live in `nanopay/.env` (gitignored). `.env.example` holds placeholders only.
- The sidecar sends `X-Internal-Secret` to `/api/trigger`. To actually lock the
  trigger to the sidecar, enforce that header in `backend/main.py` (it currently
  rate-limits by IP and does not yet check the header).
