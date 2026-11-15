# Aura Scanner — Backend

Face recognition (InsightFace / ArcFace) → match enrolled people → pull LinkedIn signals → **DeepSeek** hard-truth grade (larper / try-hard / aura).

## Setup

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
# source .venv/bin/activate

pip install -r requirements.txt
copy .env.example .env   # Windows
# cp .env.example .env   # macOS / Linux
```

Put your DeepSeek key in `.env`:

```env
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_MODEL=deepseek-chat
```

## Seed + test (run this first)

```bash
cd backend
python scripts/seed_and_test.py
```

This downloads a sample face, enrolls a fake LinkedIn “thought leader”, matches the face with InsightFace, then calls DeepSeek for a roast/score.

## Run API

```bash
cd backend
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- Health: http://127.0.0.1:8000/health  
- Docs: http://127.0.0.1:8000/docs  

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Status + judge count |
| GET | `/judges` | List enrolled people |
| POST | `/enroll` | multipart: photo + name + LinkedIn fields |
| POST | `/scan` | multipart: photo → match → DeepSeek grade |

## Flow

1. **Enroll** judges (or attendees) with a face photo + LinkedIn headline/about text (and URL).
2. **Scan** a webcam still → InsightFace embedding → nearest neighbor in SQLite gallery.
3. On hit, DeepSeek grades LinkedIn copy for larper / try-hard / aura and returns score + roast.

LinkedIn HTML scraping is intentionally **not** required for v1 — store public headline/about at enroll time (or paste). That keeps demos reliable and ToS-safer.
