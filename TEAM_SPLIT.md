# Aura Tracker — Team Task Split

Three-person split. Keep ownership clear; sync at integration points below.

---

## Member A — Frontend, camera, aura visuals, share

**Owns:** UI, MediaPipe face filter, bad GIF overlays, share cards

- Scaffold Next.js app + routing (`/`, `/scan`, `/confirm`, `/result`)
- Landing page + consent / age gate
- Webcam capture (`getUserMedia`) + mirrored preview
- MediaPipe Face Landmarker live tracking
- Bad green-key GIF aura compositor (gifuct-js + canvas)
- Aura asset packs per score band (at least 4 for MVP)
- “Scanning…” theater UI
- Result reveal screen (score, label, roast)
- Share card PNG export + Web Share / download
- Wire UI to match + score APIs from B and C

**Hand off to others:** face still frame for recognition; confirmed match id for scoring

---

## Member B — Face recognition, judges DB, match API

**Owns:** identity path, embeddings, Postgres/pgvector, admin enroll

- Stand up Postgres + pgvector
- Judges schema (name, role, socials, consent, embeddings)
- InsightFace / DeepFace or CompreFace worker
- Enroll endpoint: photo(s) → embedding → store
- `/match` endpoint: still → top-3 cosine matches + confidence
- Seed judges roster (photos + LinkedIn / IG / X / GitHub URLs)
- `/admin/judges` enroll UI (or API + simple form)
- Match threshold tuning + “no match” fallback signal
- Privacy basics: consent flags, delete/opt-out for a judge

**Hand off to others:** match result payload (`judgeId`, socials, confidence, `matchSource`)

---

## Member C — Scoring, roasts, enrichment, glue

**Owns:** aura engine, copy, web fallback, end-to-end flow

- Aura taxonomy + score bands (0–100 labels)
- Rule-based scorer from social signals / cached snippets
- Roast templates + LLM structured JSON (Zod)
- Pull signals from judge social links (light fetch / OG)
- Web enrichment fallback when DB misses (search API)
- Camera-only fallback score path
- Confirm-step API contract (“this is me” → final score)
- Public share page `/r/[id]` + OG tags
- README / demo script / integration checklist
- End-to-end demo dry-run (A + B + C)

**Hand off to others:** score JSON (`score`, `label`, `roast`, `auraPack`, `matchSource`)

---

## Shared integration points

- Agree API shapes early: `POST /match`, `POST /score`, share slug
- Same face-still format (JPEG/PNG) from A → B
- Same `auraPack` names between C’s bands and A’s GIF folders
- Daily sync: camera → match → confirm → score → share works on main

---

## MVP checklist by member

**A**
- [ ] Camera + MediaPipe on `/scan`
- [ ] One ugly green-key aura GIF working
- [ ] Reveal + share PNG

**B**
- [ ] 3+ seeded judges with embeddings + socials
- [ ] `/match` returns correct top hit in good lighting
- [ ] Admin can add a judge

**C**
- [ ] Score + roast from judge socials
- [ ] DB miss → web or camera-only path
- [ ] Full walkthrough demo ready