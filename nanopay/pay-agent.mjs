/**
 * Agora Scout — x402 paying agent (client side).
 *
 * Adapted from the reference agent.mts. It:
 *   1. Generates an ephemeral wallet and funds it from BUYER_PRIVATE_KEY
 *      (gas in native Arc USDC + ERC-20 USDC to spend).
 *   2. Deposits DEPOSIT_AMOUNT into the Circle Gateway via GatewayClient.
 *   3. Calls `gateway.pay(`${SIDECAR_URL}/paid/rebalance`, { method: "POST" })`
 *      COUNT times, logging each settled payment + tx.
 *   4. Auto-redeposits when the Gateway available balance drops low.
 *
 * Differences from the reference: the multi-endpoint 1-tx/sec demo loop is
 * replaced by a finite COUNT loop against a single endpoint, and the
 * interactive spending-limit prompt is removed. The funding, GatewayClient
 * construction, deposit, and redeposit logic are copied as-is.
 */

import { GatewayClient } from "@circle-fin/x402-batching/client";
import {
  createWalletClient,
  createPublicClient,
  http,
  erc20Abi,
  parseUnits,
  parseEther,
} from "viem";
import { arcTestnet } from "viem/chains";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import dotenv from "dotenv";

dotenv.config();

// ── Arc Testnet constants (verbatim from the reference) ───────────────────────
const ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000";
const ARC_TESTNET_RPC = "https://rpc.testnet.arc.network";

// ── Config (env) ──────────────────────────────────────────────────────────────
const funderKey = process.env.BUYER_PRIVATE_KEY;
if (!funderKey) {
  console.error("[pay] Missing BUYER_PRIVATE_KEY — set it in nanopay/.env");
  process.exit(1);
}

const SIDECAR_URL = process.env.SIDECAR_URL ?? "http://localhost:3402";
const DEPOSIT_AMOUNT = process.env.DEPOSIT_AMOUNT ?? "1";
const COUNT = Number(process.env.COUNT ?? 1);
// Native USDC for gas (Arc testnet gas = USDC with 18 decimals).
const GAS_FUND_AMOUNT = parseEther("0.01");
// Auto-redeposit when Gateway available balance drops below 0.5 USDC (atomic).
const REDEPOSIT_THRESHOLD = 500_000n;

const payEndpoint = `${SIDECAR_URL}/paid/rebalance`;

// ── Generate ephemeral wallet ─────────────────────────────────────────────────
const ephemeralKey = generatePrivateKey();
const ephemeralAccount = privateKeyToAccount(ephemeralKey);
console.log(`[pay] Ephemeral agent wallet: ${ephemeralAccount.address}`);

// ── Funder wallet (the one you funded via the Circle faucet) ──────────────────
const funderAccount = privateKeyToAccount(funderKey);
const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(ARC_TESTNET_RPC),
});
const funderWallet = createWalletClient({
  account: funderAccount,
  chain: arcTestnet,
  transport: http(ARC_TESTNET_RPC),
});

const usdcAmount = parseUnits(DEPOSIT_AMOUNT, 6);

// Retry helper for nonce collisions (copied from the reference).
async function withNonceRetry(fn, label) {
  const MAX_RETRIES = 5;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err?.message ?? "";
      const isNonceError =
        msg.includes("replacement transaction underpriced") ||
        msg.includes("nonce too low") ||
        msg.includes("already known");
      if (!isNonceError || attempt === MAX_RETRIES - 1) throw err;
      const delay = 1000 + Math.random() * 2000;
      console.log(`  ${label}: nonce collision, retrying in ${Math.round(delay)}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("unreachable");
}

// ── Fund the ephemeral wallet (gas, then ERC-20 USDC) ─────────────────────────
console.log(`[pay] Funding ephemeral wallet from funder ${funderAccount.address}...`);

const gasTxHash = await withNonceRetry(
  () => funderWallet.sendTransaction({ to: ephemeralAccount.address, value: GAS_FUND_AMOUNT }),
  "Gas tx",
);
await publicClient.waitForTransactionReceipt({ hash: gasTxHash });
console.log(`  Gas funded (${gasTxHash.slice(0, 10)}...)`);

const usdcTxHash = await withNonceRetry(
  () =>
    funderWallet.writeContract({
      address: ARC_TESTNET_USDC,
      abi: erc20Abi,
      functionName: "transfer",
      args: [ephemeralAccount.address, usdcAmount],
    }),
  "USDC tx",
);
await publicClient.waitForTransactionReceipt({ hash: usdcTxHash });
console.log(`  USDC transferred (${usdcTxHash.slice(0, 10)}...)`);

// ── GatewayClient with the ephemeral wallet ───────────────────────────────────
const gateway = new GatewayClient({
  chain: "arcTestnet",
  privateKey: ephemeralKey,
});

async function depositToGateway() {
  console.log(`[pay] Depositing ${DEPOSIT_AMOUNT} USDC into Gateway Wallet...`);
  const result = await gateway.deposit(DEPOSIT_AMOUNT);
  console.log(`[pay] Deposit complete! TX: ${result.depositTxHash}`);
  const updated = await gateway.getBalances();
  console.log(`[pay] Gateway available balance: ${updated.gateway.formattedAvailable}`);
}

async function refundAndRedeposit() {
  // Pull more USDC from the funder into the ephemeral wallet, then deposit.
  const txHash = await withNonceRetry(
    () =>
      funderWallet.writeContract({
        address: ARC_TESTNET_USDC,
        abi: erc20Abi,
        functionName: "transfer",
        args: [ephemeralAccount.address, usdcAmount],
      }),
    "Redeposit tx",
  );
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  await depositToGateway();
}

async function ensureFunded() {
  const balances = await gateway.getBalances();
  if (balances.gateway.available >= REDEPOSIT_THRESHOLD) return;
  console.log(
    `[pay] Gateway balance low (${balances.gateway.formattedAvailable}), redepositing...`,
  );
  if (balances.wallet.balance > 0n) {
    await depositToGateway();
  } else {
    await refundAndRedeposit();
  }
}

// ── Initial deposit ───────────────────────────────────────────────────────────
await depositToGateway();

// ── Payment loop: COUNT calls to the sidecar's paid rebalance ─────────────────
console.log(`\n[pay] Paying for ${COUNT} rebalance call(s) at ${payEndpoint}\n`);

let spent = 0;
for (let i = 1; i <= COUNT; i++) {
  await ensureFunded();

  const start = Date.now();
  try {
    const result = await gateway.pay(payEndpoint, { method: "POST" });
    const ms = Date.now() - start;
    const amount = parseFloat(result.formattedAmount);
    spent += amount;
    console.log(
      `#${i}/${COUNT} POST /paid/rebalance -> ${result.formattedAmount} USDC (${ms}ms)`,
    );
    // gateway.pay returns the settled response; surface the rebalance payload + tx.
    if (result.data !== undefined) {
      console.log(`        rebalance: ${JSON.stringify(result.data)}`);
    }
    if (result.transaction) {
      console.log(`        settle tx: ${result.transaction}`);
    }
  } catch (err) {
    const ms = Date.now() - start;
    console.error(`#${i}/${COUNT} FAILED (${ms}ms): ${err.message}`);
  }
}

console.log(`\n[pay] Done. Total spent: ${spent.toFixed(6)} USDC across ${COUNT} call(s).`);
