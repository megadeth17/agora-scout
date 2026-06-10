"""
Unit tests for the real native-USDC capital-move planner (arc_transfer.plan_move).
Pure math — no network, no keys. Run: python -m pytest backend/test_arc_transfer.py
"""
from arc_transfer import ArcTransfer, USDC_DECIMALS

U = 10 ** USDC_DECIMALS  # 1 USDC in wei (native, 18 decimals)


def test_moves_treasury_to_vault_when_yield_increases():
    # 10 USDC treasury, 0 in vault, target 20% yield → move 2 USDC in.
    plan = ArcTransfer.plan_move(10 * U, 0, 20)
    assert plan["direction"] == "treasury->vault"
    assert plan["amount_wei"] == 2 * U
    assert plan["skipped"] is False


def test_moves_vault_to_treasury_when_yield_decreases():
    # 5 USDC treasury, 5 in vault (50%), target 10% → vault should drop to 1 USDC,
    # i.e. move 4 USDC back to treasury.
    plan = ArcTransfer.plan_move(5 * U, 5 * U, 10)
    assert plan["direction"] == "vault->treasury"
    assert plan["amount_wei"] == 4 * U


def test_skips_when_delta_is_dust():
    # Already at target → nothing to move.
    plan = ArcTransfer.plan_move(8 * U, 2 * U, 20)
    assert plan["skipped"] is True
    assert plan["amount_wei"] == 0
    assert plan["direction"] == ""


def test_yield_pct_is_clamped_to_valid_range():
    # 150% is clamped to 100 → everything goes to the vault.
    plan = ArcTransfer.plan_move(10 * U, 0, 150)
    assert plan["direction"] == "treasury->vault"
    assert plan["amount_wei"] == 10 * U
    # negative clamps to 0 → everything returns to treasury
    plan2 = ArcTransfer.plan_move(0, 10 * U, -5)
    assert plan2["direction"] == "vault->treasury"
    assert plan2["amount_wei"] == 10 * U


def test_total_wei_is_preserved():
    plan = ArcTransfer.plan_move(3 * U, 7 * U, 40)
    assert plan["total_wei"] == 10 * U
