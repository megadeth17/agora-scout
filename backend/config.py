"""
Agora Scout — configuration.
All secrets via .env — never hardcode.
"""
import os
from dotenv import load_dotenv

load_dotenv()

# Arc
ARC_RPC_URL = os.getenv("ARC_RPC", "")

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
