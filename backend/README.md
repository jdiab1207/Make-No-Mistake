# Aura Tracker — Backend

FastAPI service: **face match (InsightFace)** → enrolled gallery (SQLite) → **DeepSeek** LinkedIn roast/score.

Local face images and the SQLite DB live under `data/` and are **gitignored**.

---

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

`.env` essentials:

```env
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_MODEL=deepseek-chat
# Optional: allow Netlify / other frontends
CORS_ORIGINS=https://make-no-mistake-aura.netlify.app
FACE_MATCH_THRESHOLD=0.40
```

---

## Run

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

| URL | Purpose |
|-----|---------|
| http://127.0.0.1:8000/health | Status + enrolled count |
| http://127.0.0.1:8000/docs | OpenAPI |

Smoke test:

```bash
python scripts/seed_and_test.py
```

---

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Config flags + judge count |
| GET | `/judges` | List enrolled people |
| GET | `/judges/{id}/photo` | Face image |
| GET | `/photo/remote?url=` | Proxy LinkedIn CDN images |
| POST | `/enroll` | multipart photo + profile fields |
| POST | `/scan` | multipart photo → match → grade |

### `POST /enroll` fields

- `photo` (file, required) — face must be detectable  
- `display_name`, `role` (`judge` / `participant`)  
- `linkedin_url`, `linkedin_headline`, `linkedin_about`, `linkedin_experience`  

LinkedIn OG scrape is best-effort (profiles are often authwalled). Paste headline/about when OG is empty.

---

## Bulk participant import

For hackathon participant lists:

1. Put confident LinkedIn URLs in `data/participants_linkedin_map.json`:

```json
{
  "Rieley Hunt": {
    "linkedin_url": "https://www.linkedin.com/in/rieleyhunt/",
    "confidence": "high",
    "note": "Carleton CS"
  }
}
```

2. Optional name list: `scripts/participants_bulk.txt`

3. Enroll (requires fetchable **real** headshot — unavatar LinkedIn JPEG preferred):

```bash
python scripts/enroll_from_map.py
```

| Script | Role |
|--------|------|
| `scripts/enroll_from_map.py` | Enroll from the JSON map + photo fetch |
| `scripts/bulk_enroll_participants.py` | Name → search → enroll (search engines often blocked) |
| `scripts/participants_bulk.txt` | Parsed participant names |

**Safety:** Do not use generic web image search as a face source. Wrong-person enrollments break the demo and the roast.

Public photo sources that have worked intermittently:

- `https://unavatar.io/linkedin/{slug}` when it returns a real JPEG (not SVG placeholder)  
- Manual Devpost / LinkedIn screenshots  

---

## Modules

| Module | Role |
|--------|------|
| `app/main.py` | Routes, CORS, scan/enroll waterfall |
| `app/face_match.py` | InsightFace + fallbacks |
| `app/db.py` | SQLite gallery + embeddings |
| `app/grader.py` | DeepSeek prompts / scoring |
| `app/linkedin_lookup.py` | OG tags + CDN photo download |
| `app/web_identity.py` | Best-effort reverse image / name search |
| `app/config.py` | Env + paths |

---

## Data directory

```
data/
  aura.db          # gitignored
  judges/          # enrolled face files (gitignored)
  participants_linkedin_map.json   # optional URL map (safe to commit)
  bulk_tmp/        # gitignored download cache
```
