/**
 * Agora Scout — x402 payment sidecar (server side).
 *
 * An Express server that gates the `/paid/rebalance` endpoint behind a Circle
 * Gateway x402 micropayment on the Arc testnet. A paying agent (see
 * pay-agent.mjs) must attach a signed payment; the sidecar verifies + settles
 * it on-chain via @circle-fin/x402-batching's BatchFacilitatorClient, then —
 * and only then — triggers the internal Agora rebalance by POSTing to the
 * FastAPI backend.
 *
 * The withGateway() middleware below is lifted directly from the reference
 * lib/x402.ts (Next.js) and adapted to Express/plain ESM. The Arc constants,
 * the payment-requirements shape (with the GatewayWalletBatched `extra` field),
 * and the verify()/settle() handshake are copied verbatim — only the
 * request/response plumbing (NextRequest/NextResponse -> Express req/res) and
 * the Supabase logging (dropped) differ.
 */

import express from "express";
import dotenv from "dotenv";
import { BatchFacilitatorClient } from "@circle-fin/x402-batching/server";

dotenv.config();

// ── Arc Testnet constants (from @circle-fin/x402-batching SDK) ────────────────
// Copied verbatim from the reference lib/x402.ts / agent.mts.
const ARC_TESTNET_NETWORK = "eip155:5042002";
const ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000";
const ARC_TESTNET_GATEWAY_WALLET = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";
const ARC_TESTNET_RPC = "https://rpc.testnet.arc.network";

// ── Config (env) ──────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT ?? 3402);
const SELLER_ADDRESS = process.env.SELLER_ADDRESS;
const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://localhost:8001";
const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? "";

if (!SELLER_ADDRESS) {
  console.error("[sidecar] Missing SELLER_ADDRESS — set it in nanopay/.env");
  process.exit(1);
}
// Note: SELLER_PRIVATE_KEY is read from env by the BatchFacilitatorClient/SDK
// for settlement signing; it is intentionally NOT referenced directly here so
// it never lands in a log line.

// One facilitator client for the whole process. It reads SELLER_PRIVATE_KEY /
// network config from the environment, exactly as the reference does.
const facilitator = new BatchFacilitatorClient();

/**
 * Build the x402 payment requirements for a given dollar price.
 * Verbatim port of buildPaymentRequirements() from the reference.
 * @param {string} price e.g. "$0.01"
 */
function buildPaymentRequirements(price) {
  // Parse dollar amount to USDC atomic units (6 decimals).
  const amount = Math.round(parseFloat(price.replace("$", "")) * 1_000_000);

  return {
    scheme: "exact",
    network: ARC_TESTNET_NETWORK,
    asset: ARC_TESTNET_USDC,
    amount: amount.toString(),
    payTo: SELLER_ADDRESS,
    maxTimeoutSeconds: 345600,
    extra: {
      name: "GatewayWalletBatched",
      version: "1",
      verifyingContract: ARC_TESTNET_GATEWAY_WALLET,
    },
  };
}

/**
 * Express middleware factory that gates `handler` behind a Gateway x402 payment.
 *
 * Adapted from the reference withGateway() (Next.js). Behaviour preserved:
 *   - No `payment-signature` header  -> 402 + base64 `PAYMENT-REQUIRED` header.
 *   - Header present                 -> verify(), then settle(), then handler.
 *   - On settle success              -> base64 `PAYMENT-RESPONSE` header with tx.
 *
 * @param {(req: import('express').Request) => Promise<{status:number, body:any}>} handler
 * @param {string} price    e.g. "$0.01"
 * @param {string} endpoint logical path label, e.g. "/paid/rebalance"
 */
function withGateway(handler, price, endpoint) {
  const requirements = buildPaymentRequirements(price);

  return async (req, res) => {
    const paymentSignature = req.headers["payment-signature"];

    // ── No payment: return 402 with Gateway batching payment requirements ─────
    if (!paymentSignature) {
      console.log(`[x402] 402 Payment Required: ${endpoint}`);

      const paymentRequired = {
        x402Version: 2,
        resource: {
          url: endpoint,
          description: `Paid resource (${price} USDC)`,
          mimeType: "application/json",
        },
        accepts: [requirements],
      };

      res
        .status(402)
        .set({
          "Content-Type": "application/json",
          "PAYMENT-REQUIRED": Buffer.from(
            JSON.stringify(paymentRequired),
          ).toString("base64"),
        })
        .json({});
      return;
    }

    // ── Payment present: verify and settle via Circle Gateway ─────────────────
    try {
      const paymentPayload = JSON.parse(
        Buffer.from(paymentSignature, "base64").toString("utf-8"),
      );

      // The client signs validBefore = now + maxTimeoutSeconds, but a few seconds
      // elapse before this verify runs, so validBefore - now drops just under
      // maxTimeoutSeconds and the facilitator rejects it as
      // "authorization_validity_too_short". We advertise the full window in the
      // 402 (so the client signs a generous authorization) but verify+settle
      // against a relaxed window to absorb that elapsed-time gap.
      const verifyReq = {
        ...requirements,
        maxTimeoutSeconds: Math.max(60, requirements.maxTimeoutSeconds - 300),
      };

      const verifyResult = await facilitator.verify(paymentPayload, verifyReq);

      if (!verifyResult.isValid) {
        console.error(
          `[x402] Verify FAILED for ${endpoint}: reason=${verifyResult.invalidReason} payer=${verifyResult.payer ?? "?"}`,
        );
        res.status(402).json({
          error: "Payment verification failed",
          reason: verifyResult.invalidReason,
        });
        return;
      }

      const settleResult = await facilitator.settle(paymentPayload, verifyReq);

      if (!settleResult.success) {
        console.error(
          `[x402] Settlement failed for ${endpoint}: ${settleResult.errorReason}`,
        );
        res.status(402).json({
          error: "Payment settlement failed",
          reason: settleResult.errorReason,
        });
        return;
      }

      const amountUsdc = (Number(requirements.amount) / 1e6).toString();
      const payer = settleResult.payer ?? verifyResult.payer ?? "unknown";
      const txHash = settleResult.transaction ?? null;

      console.log(
        `[x402] Payment settled: ${endpoint} — ${amountUsdc} USDC from ${payer}` +
          (txHash ? ` (tx ${txHash})` : ""),
      );

      // Run the actual business handler (triggers the Agora rebalance), passing
      // the settled payment so the backend records it as flowing volume.
      const result = await handler(req, { amountUsdc, payer, txHash, resource: endpoint });

      // Attach the settlement tx to the response body so the caller can show it.
      const body =
        result.body && typeof result.body === "object"
          ? {
              ...result.body,
              payment: {
                settled: true,
                amountUsdc,
                network: requirements.network,
                payer,
                tx: txHash,
                arcscan: txHash
                  ? `https://testnet.arcscan.app/tx/${txHash}`
                  : null,
              },
            }
          : result.body;

      // Forward settlement info to the client via header (mirrors the reference).
      const settleResponseHeader = Buffer.from(
        JSON.stringify({
          success: true,
          transaction: txHash,
          network: requirements.network,
          payer,
        }),
      ).toString("base64");

      res.status(result.status).set("PAYMENT-RESPONSE", settleResponseHeader).json(body);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[x402] Payment processing error:", message);
      res.status(500).json({ error: "Payment processing error", message });
    }
  };
}

// ── Business handler: trigger the internal Agora rebalance ────────────────────
// Does NO business logic itself — it forwards to the FastAPI backend, which owns
// the agent cycle + on-chain rebalance. The sidecar is purely the paywall.
/**
 * @param {import('express').Request} _req
 * @returns {Promise<{status:number, body:any}>}
 */
async function triggerRebalance(_req, payment = {}) {
  const url = `${FASTAPI_URL}/api/internal/rebalance`;
  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": INTERNAL_SECRET,
      },
      body: JSON.stringify({
        amount_usdc: payment.amountUsdc != null ? Number(payment.amountUsdc) : null,
        payer: payment.payer ?? "",
        tx_hash: payment.txHash ?? "",
        resource: payment.resource ?? "/paid/rebalance",
      }),
    });

    const text = await upstream.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!upstream.ok) {
      console.error(`[sidecar] FastAPI trigger failed (${upstream.status})`);
      return {
        status: 502,
        body: {
          error: "Upstream rebalance trigger failed",
          upstreamStatus: upstream.status,
          upstream: data,
        },
      };
    }

    return { status: 200, body: data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[sidecar] FastAPI unreachable:", message);
    return {
      status: 502,
      body: { error: "Upstream rebalance trigger unreachable", message },
    };
  }
}

// ── Wire up Express ───────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// Paid endpoint: $0.01 USDC per call, gated by Gateway x402.
app.post("/paid/rebalance", withGateway(triggerRebalance, "$0.01", "/paid/rebalance"));

// Health probe — unpaid.
app.get("/health", (_req, res) => {
  res.json({ status: "ok", seller: SELLER_ADDRESS });
});

app.listen(PORT, () => {
  console.log(`[sidecar] x402 rebalance paywall listening on :${PORT}`);
  console.log(`[sidecar]   seller:   ${SELLER_ADDRESS}`);
  console.log(`[sidecar]   network:  ${ARC_TESTNET_NETWORK} (Arc testnet)`);
  console.log(`[sidecar]   fastapi:  ${FASTAPI_URL}`);
  console.log(`[sidecar]   rpc:      ${ARC_TESTNET_RPC}`);
});
