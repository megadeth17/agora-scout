"""
Agora Scout — configuration.
All secrets via .env — never hardcode.
"""
import os
from dotenv import load_dotenv

load_dotenv()

# Arc
ARC_RPC_URL = os.getenv("ARC_RPC", "") or "https://rpc.testnet.arc.network"
ARC_CHAIN_ID = int(os.getenv("ARC_CHAIN_ID", "5042002"))
ARC_PRIVATE_KEY = os.getenv("ARC_PRIVATE_KEY", "")
ARCSCAN_TX_BASE = "https://testnet.arcscan.app/tx"

# Execution mode: "simulate" (state-only rebalance) or "live" (real native-USDC
# transfers on Arc between the treasury and vault wallets). Default simulate.
EXECUTION_MODE = os.getenv("EXECUTION_MODE", "simulate").strip().lower()
ARC_VAULT_PRIVATE_KEY = os.getenv("ARC_VAULT_PRIVATE_KEY", "")
ARC_VAULT_ADDRESS = os.getenv("ARC_VAULT_ADDRESS", "")

# Circle
CIRCLE_API_KEY = os.getenv("CIRCLE_API_KEY", "")
CIRCLE_KIT_KEY = os.getenv("CIRCLE_KIT_KEY", "")
CIRCLE_BASE_URL = "https://api.circle.com/v1/w3s"

# Kimi K2 (OpenAI-compatible — base_url must be .ai not .cn)
KIMI_API_KEY = os.getenv("MOONSHOT_API_KEY", "") or os.getenv("KIMI_API_KEY", "")
KIMI_BASE_URL = "https://api.moonshot.ai/v1"
KIMI_MODEL = "kimi-k2.6"

# Storage
DATABASE_PATH = os.getenv("DATABASE_PATH", "agora_scout.db")

# Agent loop
AGENT_INTERVAL_SECONDS = int(os.getenv("AGENT_INTERVAL_SECONDS", "600"))  # 10 min

# Risk params
MIN_REBALANCE_THRESHOLD_PCT = float(os.getenv("MIN_REBALANCE_THRESHOLD_PCT", "5.0"))
DEFAULT_USDC_AMOUNT = float(os.getenv("DEFAULT_USDC_AMOUNT", "100.0"))  # testnet USDC
