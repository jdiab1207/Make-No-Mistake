from pathlib import Path

from dotenv import load_dotenv
import os

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")

HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "8000"))
# Comma-separated extra browser origins allowed to call the API
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "")

# InsightFace cosine distance: lower = more similar. ~0.3–0.4 is typical.
FACE_MATCH_THRESHOLD = float(os.getenv("FACE_MATCH_THRESHOLD", "0.40"))

DATA_DIR = ROOT / "data"
JUDGES_DIR = DATA_DIR / "judges"
DB_PATH = DATA_DIR / "aura.db"
