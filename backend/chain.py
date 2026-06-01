"""
Agora Scout — on-chain decision anchoring on Arc.

Commit-then-act: before the agent moves capital, it commits a cryptographic
hash of its decision on-chain via a real Arc transaction. The hash lives in
the transaction calldata, making each decision tamper-proof and verifiable
on Arcscan. USDC is Arc's native gas token, so no ETH is needed.

Fully fault-tolerant: if no key is configured or the RPC is unreachable,
anchoring returns None and the agent loop continues uninterrupted.
"""
import asyncio
import hashlib
import json
import logging

import config

logger = logging.getLogger(__name__)


class ArcAnchor:
    def __init__(self):
        self._w3 = None
        self._account = None
        self._enabled = bool(config.ARC_PRIVATE_KEY)
        if not self._enabled:
            logger.warning("ARC_PRIVATE_KEY not set — on-chain anchoring disabled")

    @property
    def enabled(self) -> bool:
        return self._enabled

    def _connect(self):
        """Lazily build the web3 client + account (sync, runs in a thread)."""
        if self._w3 is None:
            from web3 import Web3
            from eth_account import Account

            self._w3 = Web3(Web3.HTTPProvider(
                config.ARC_RPC_URL, request_kwargs={"timeout": 15}
            ))
            self._account = Account.from_key(config.ARC_PRIVATE_KEY)
            logger.info("Arc anchor wallet: %s", self._account.address)
        return self._w3

    @staticmethod
    def canonical_payload(payload: dict) -> str:
        """Deterministic canonical JSON serialization — the exact bytes that get hashed."""
        return json.dumps(payload, sort_keys=True, separators=(",", ":"))

    @staticmethod
    def hash_canonical(canonical: str) -> str:
        """sha256 of an already-canonical string → 0x-prefixed 32-byte hex."""
        return "0x" + hashlib.sha256(canonical.encode()).hexdigest()

    @staticmethod
    def hash_decision(payload: dict) -> str:
        """Deterministic sha256 of the decision payload → 0x-prefixed 32-byte hex."""
        return ArcAnchor.hash_canonical(ArcAnchor.canonical_payload(payload))

    @staticmethod
    def _read_w3():
        """Key-free read-only web3 client (verification needs no signing account)."""
        from web3 import Web3
        return Web3(Web3.HTTPProvider(
            config.ARC_RPC_URL, request_kwargs={"timeout": 15}
        ))

    def _fetch_calldata_sync(self, tx_hash: str) -> str | None:
        w3 = self._read_w3()
        if not w3.is_connected():
            logger.error("Arc RPC not reachable at %s", config.ARC_RPC_URL)
            return None
        tx = w3.eth.get_transaction(tx_hash)
        data = tx.get("input")
        if data is None:
            return None
        if isinstance(data, (bytes, bytearray)):
            return "0x" + data.hex()
        s = str(data)
        return s if s.startswith("0x") else "0x" + s

    async def fetch_onchain_calldata(self, tx_hash: str) -> str | None:
        """Read-only: fetch the calldata (input) of an anchored tx from Arc. No signing."""
        try:
            return await asyncio.to_thread(self._fetch_calldata_sync, tx_hash)
        except Exception as exc:
            logger.error("Arc calldata fetch failed: %s", exc)
            return None

    def _anchor_sync(self, decision_hash: str) -> str | None:
        w3 = self._connect()
        if not w3.is_connected():
            logger.error("Arc RPC not reachable at %s", config.ARC_RPC_URL)
            return None

        addr = self._account.address
        nonce = w3.eth.get_transaction_count(addr)

        # Zero-value self-transfer; decision hash carried in calldata = proof.
        tx = {
            "chainId": config.ARC_CHAIN_ID,
            "from": addr,
            "to": addr,
            "value": 0,
            "nonce": nonce,
            "data": decision_hash,  # 0x + 64 hex chars = 32 bytes
            "gas": 50000,
            "gasPrice": w3.eth.gas_price,
        }

        signed = w3.eth.account.sign_transaction(tx, config.ARC_PRIVATE_KEY)
        raw = getattr(signed, "raw_transaction", None) or getattr(signed, "rawTransaction")
        tx_hash = w3.eth.send_raw_transaction(raw)
        return tx_hash.hex()

    async def anchor(self, payload: dict) -> dict | None:
        """
        Commit a decision hash on-chain. Returns
        {decision_hash, tx_hash, arcscan_url} or None on any failure.
        """
        if not self._enabled:
            return None

        decision_hash = self.hash_decision(payload)
        try:
            tx_hash = await asyncio.to_thread(self._anchor_sync, decision_hash)
            if not tx_hash:
                return None
            if not tx_hash.startswith("0x"):
                tx_hash = "0x" + tx_hash
            arcscan_url = f"{config.ARCSCAN_TX_BASE}/{tx_hash}"
            logger.info("Decision anchored on Arc: %s", arcscan_url)
            return {
                "decision_hash": decision_hash,
                "tx_hash": tx_hash,
                "arcscan_url": arcscan_url,
            }
        except Exception as exc:
            logger.error("Arc anchor failed: %s", exc)
            return None
