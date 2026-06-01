"""
Unit tests for commit-then-act verification primitives.
Pure logic — no web3 / no network. Run from backend/: `python -m pytest test_verify.py -q`
"""
from chain import ArcAnchor


def test_canonical_payload_is_key_order_independent():
    a = {"b": 2, "a": 1, "nested": {"y": 1, "x": 2}}
    b = {"a": 1, "nested": {"x": 2, "y": 1}, "b": 2}
    assert ArcAnchor.canonical_payload(a) == ArcAnchor.canonical_payload(b)


def test_hash_decision_matches_hash_of_canonical():
    payload = {
        "regime": "BULL",
        "confidence": 80,
        "reasoning": "whales accumulating",
        "from": {"usdc_pct": 100, "usyc_pct": 0, "yield_pct": 0},
        "to": {"usdc_pct": 50, "usyc_pct": 30, "yield_pct": 20},
        "decided_at": "2026-05-30T00:00:00+00:00",
    }
    canonical = ArcAnchor.canonical_payload(payload)
    # The verifier recomputes from the stored canonical string — must match
    # the hash produced at anchoring time from the dict.
    assert ArcAnchor.hash_decision(payload) == ArcAnchor.hash_canonical(canonical)


def test_hash_format_is_32_byte_hex():
    h = ArcAnchor.hash_decision({"x": 1})
    assert h.startswith("0x")
    assert len(h) == 66  # 0x + 64 hex chars = 32 bytes


def test_tamper_changes_hash():
    base = {"regime": "BULL", "confidence": 80}
    tampered = {"regime": "BEAR", "confidence": 80}
    assert ArcAnchor.hash_decision(base) != ArcAnchor.hash_decision(tampered)
