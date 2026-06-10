# Agora Scout — Circle Developer Grant Application (draft)

> Status: draft for the Circle Developer Grant ([circle.com/grant](https://www.circle.com/grant)). Application window currently closed — prep now, submit on reopen.

## One-liner
An autonomous agent that manages a USDC treasury on Arc — reading market regime from on-chain whale behavior and moving real native USDC between a safe bucket and a yield bucket, with every decision cryptographically committed on-chain *before* capital moves.

## Category fit
Circle prioritizes **payments, treasuries, FX, and agentic economies**. Agora Scout sits squarely at the intersection of **treasuries + agentic economies**: an AI agent that holds and rebalances a real on-chain USDC treasury, autonomously, 24/7.

## Why Arc is core to the flow of value
- The treasury is **native USDC on Arc**. Every rebalance is a **real native-USDC value transfer** between the agent's treasury and vault wallets — not a simulation, not an off-chain ledger entry.
- Each decision is anchored in an **Arc transaction** (sha256 in calldata) before the capital moves. Arc is the settlement and audit layer for both the commit and the act.
- Arc's USDC-native gas means the agent pays for its own transactions in USDC — no separate gas token, no paymaster.

## Circle products used
| Product | How it's used | Status |
|---|---|---|
| USDC (native on Arc) | The treasury itself; moved on every rebalance | **Live (testnet)** |
| Arc L1 | Settlement for commit tx + transfer tx | **Live (testnet)** |
| Circle Wallets API | Wallet provisioning + balance reads | Integrated |
| USYC | Intended mainnet T-bill instrument for the safe bucket | Roadmap (no testnet contract) |

## What's already shipped (verifiable)
- **Autonomous loop** running 24/7: data → Kimi K2 regime decision → commit → real USDC transfer. 2,200+ decisions, 460+ rebalances, 400+ on-chain anchors recorded.
- **Real native-USDC transfers on Arc testnet.** The live agent moves capital on its own on regime shifts — verifiable on Arcscan.
- **Commit-then-act accountability primitive** with a public verifier endpoint (`/api/verify/{id}`): recompute `payload → sha256` and match it to on-chain calldata. This is a reusable trust layer for *any* agent that moves money.
- **Public live dashboard** (no login) showing each decision, its real USDC transfer, and one-click verification.

## Traction & validation (honest)
- Live public dashboard with real visitors and a continuously growing on-chain decision history.
- Current: ~40+ unique visitors, 8,700+ views. This is demo-stage interest, **not** product validation yet.
- **Plan to earn real usage** (what the grant wants to see): see Roadmap.

## Revenue model (path to sustainability)
1. **Managed treasury SaaS** — DAOs, on-chain funds, and crypto-native businesses point an idle-USDC treasury at the agent. Fee: a small **bps management fee on assets under management** (e.g. 10–25 bps/yr), charged in USDC on Arc.
2. **Performance-linked tier** — optional performance fee on yield captured vs. an idle-USDC benchmark.
3. **Verification-as-a-service** — the commit-then-act verifier is a standalone accountability layer other agent builders can embed (per-verification or subscription). Differentiator: provable "decided before it moved" for any money-moving agent.

The wedge is treasuries that today sit idle in USDC because active management is operationally expensive and hard to trust. Agora Scout makes management autonomous *and* auditable.

## Roadmap (grant milestones)
- **M1 — Real pilots:** onboard 3–5 real treasuries (testnet→mainnet) with their own wallets; report AUM and rebalances. Turns "visitors" into "usage/pilots."
- **M2 — USYC on mainnet:** swap the safe bucket into real USYC for on-chain T-bill yield (true tokenized-RWA integration).
- **M3 — Multi-wallet / Wallets API custody:** move treasury+vault custody fully onto Circle Wallets API with policy controls.
- **M4 — Verifier SDK:** package the commit-then-act verifier as a drop-in library + hosted endpoint for other Arc agents.

## The ask
Tiered USDC grant to fund M1–M4, plus Circle technical guidance on Wallets API custody and a mainnet USYC integration path, and co-marketing of the commit-then-act accountability primitive.

## Links
- Live: https://agora-scout.tail127286.ts.net/
- Repo: https://github.com/megadeth17/agora-scout
- On-chain proof: any rebalance's `arcscan_url` (commit) + `transfer_arcscan_url` (capital move) on [testnet.arcscan.app](https://testnet.arcscan.app)
