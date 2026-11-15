# Aura Tracker — Full Product & Tech Plan

> Working title: **Aura Scanner** / **Hard Truth Aura**  
> One-liner: Turn on your camera — we recognize your face, pull your socials (or match you against the judges DB), then roast your aura.

---

## 1. Product Vision

Aura Tracker is a web app that:

1. Turns on your **webcam** (name is optional, not required).
2. **Recognizes your face** with open-source face recognition.
3. **Finds your socials** online — or, as a reliable fallback, matches you to a curated **judges database** (face embeddings + LinkedIn / Instagram / X / etc.).
4. Scores your **aura** on a hard-truth scale (glazer → mid → max aura → cooked).
5. Overlays **intentionally bad** green-keyed GIF auras around your face.
6. Lets you **share** a stamped result card (face + aura ring + score + roast) to socials.

Tone: Gen-Z meme energy, not a serious OSINT tool. The “research” fuels comedy and shareability; privacy and consent are first-class.

**Identity strategy:** Face-first. Web search is best-effort. The **judges DB** is the dependable path for demos, judging day, and anyone we pre-enroll.

---

## 2. Core User Flow

```
Landing → Consent → Camera warmup → Face capture / recognize
  → Match path: Judges DB hit OR web enrichment OR camera-only
  → “Is this you?” confirm → Live face + bad aura filter
  → Reveal score + roast → Share card / download / retry
```

### Step-by-step UX

| Step | What the user does | What the app does |
|------|--------------------|-------------------|
| 1. Landing | Sees big brand + CTA | Hero: camera preview placeholder, absurd aura GIFs looping badly |
| 2. Consent | Accepts camera + face match + public lookup | Blocks flow until consent is on; age gate 18+ |
| 3. Camera | Allows webcam | MediaPipe locks face for aura filter; InsightFace-style embedding extracted from a still |
| 4. Identify | Waits / optionally types name as hint | **Primary:** match embedding vs judges DB. **Else:** reverse/search enrichment. **Else:** camera-only score |
| 5. Confirm | Picks “This is me” on matched profile(s) | Shows judge record and/or web candidates with confidence % |
| 6. Scan theater | Watches progress UI | Pulls social signals from DB links and/or live enrichment |
| 7. Reveal | Sees score + label + roast | Dramatic drop: aura color changes, stamped card generated |
| 8. Share | Share / download / copy link | Web Share API + static PNG/WebM export |

Keep the first viewport simple: brand, one headline, one short line, one CTA, dominant camera/GIF plane. No dashboard clutter.

---

## 3. Aura Taxonomy (Hard-Truth Scale)

Scores are **0–100**. Labels are meme-native and shareable.

| Score | Label | Vibe | Visual |
|------:|-------|------|--------|
| 0–15 | **Cooked** | No hope. Delete LinkedIn. | Grey static, sad frog GIF |
| 16–30 | **NPC** | Background character energy | Flat grey ring, Windows XP crash GIF |
| 31–45 | **Glazer** | Too much compliment energy online | Pink sparkles, kissing GIF badly keyed |
| 46–55 | **Mid** | Painfully average | Beige, shrug GIF |
| 56–70 | **Aura Farming** | Trying a little too hard | Green glow, stacking money GIF |
| 71–85 | **Aura** | Respectable presence | Clean gold ring, chill GIF |
| 86–95 | **Max Aura** | Main character | Gold + particles, lion roar GIF |
| 96–100 | **Mythic / Unfair** | Illegal levels of aura | Chromatic mess, “FREE FIREWORKS” GIF |

Each reveal also gets a **one-line roast** generated from signals (e.g. “LinkedIn says ‘thought leader,’ Instagram says vacation dump. Mid with a side of glazer.”).

---

## 4. Feature Breakdown

### 4.1 Identity — face-first
- **Required:** webcam + consent
- **Primary match:** face embedding vs **judges database**
- **Optional hint:** name / handle (improves web search if DB miss)
- **Fallbacks (in order):**
  1. Judges DB match ≥ threshold → use stored socials
  2. Web enrichment (search / pasted URLs / reverse image if available)
  3. Camera-only aura (expression / presentation heuristics + random theater)

### 4.2 Judges database (fallback + demo backbone)
Curated roster of judges (and optionally hackers / VIPs) with:
- Display name, role (judge / mentor / etc.)
- Reference face photo(s) → precomputed embedding vector(s)
- Social links: LinkedIn, Instagram, X, GitHub, personal site
- Optional cached profile snippets for offline scoring on event day
- Consent flag + enrolled_at (only people who opted in)

Admin seed flow: upload photo(s) + paste social URLs → embed → store.

### 4.3 Face tracker + aura filter
- Real-time face detection + landmarks (MediaPipe)
- Separate recognition embedding (InsightFace / DeepFace stack)
- Stabilize a “head ellipse” and attach layered GIF overlays
- Intentionally **bad chroma key**: leftover green fringes, wrong aspect, jitter, slight lag
- Multiple aura “skins” mapped to score bands

### 4.4 Internet presence finder
- Used when judges DB misses (or to refresh stale socials)
- Search / OG fetch by name hint or confirmed identity
- Rank candidates; always require “This is me” before final roast

### 4.5 Hard-truth scorer
- Weighted features from DB-linked socials and/or live public signals + camera heuristics
- Output: score, label, roast copy, confidence, match source (`judges_db` | `web` | `camera_only`)

### 4.6 Share pipeline
- Compose result card: webcam frame + aura + score stamp + QR/link
- Share to X, Instagram Stories (save + manual), TikTok (download), native Web Share
- Optional short WebM clip of the reveal for higher virality

---

## 5. System Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌────────────────────┐
│  Next.js Web    │────▶│  API / Edge      │────▶│  Enrichment Worker │
│  Camera + UI    │     │  match + score   │     │  (web search only  │
└────────┬────────┘     └────────┬─────────┘     │   on DB miss)      │
         │                       │               └─────────┬──────────┘
         │                       │                         │
         │ MediaPipe (live)      │                         │ Search APIs
         │ + face still          ▼                         ▼
         │               ┌───────────────┐          Public web
         │               │ Judges DB     │
         │               │ faces +       │
         │               │ socials +     │
         │               │ embeddings    │
         │               └───────┬───────┘
         │                       │
         │               Face match (InsightFace)
         │                       │
         └───────────┬───────────┘
                     ▼
              Score engine + share card
```

### Identity resolution order

```
webcam still → embedding
    → cosine similarity vs judges embeddings
        → HIT (≥ threshold) → load socials from DB → score
        → MISS → optional name hint / web enrichment → confirm → score
        → FAIL → camera-only score
```

### Suggested stack

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | **Next.js 15 + React + TypeScript** | Fast UX, API routes, easy deploy |
| Styling | **Tailwind + custom CSS vars** | Quick meme UI without design-system bloat |
| Face tracking (aura) | **MediaPipe Face Landmarker** (`@mediapipe/tasks-vision`) | On-device landmarks for GIF rig |
| Face recognition (ID) | **InsightFace** (ArcFace) via **DeepFace** or **CompreFace** | Strong open-source 1:N match vs judges gallery |
| Camera | Browser `getUserMedia` | No native app needed |
| Overlay compositing | **Canvas 2D** (+ optional **PixiJS**) | GIF layers, chroma key, stamps |
| GIF decode | **gifuct-js** or **omggif** | Frame-by-frame draw for chroma key |
| Chroma key | Custom shader / pixel loop | Embrace imperfect keying |
| Backend | Next.js Route Handlers + **BullMQ** / Inngest | Match + enrichment off the hot path |
| DB | **Postgres (Neon)** + Prisma + `pgvector` | Judges, embeddings, socials, sessions |
| Cache | **Redis** | Rate limits, short-lived match results |
| Search | **SerpAPI** / **Brave Search API** | Fallback when not in judges DB |
| Profile fetch | Official APIs / Cheerio on public pages | Prefer links already stored on judge rows |
| Scoring / roast | **OpenAI / Claude API** + Zod JSON schema | Hard-truth copy |
| Share export | Canvas → PNG; **FFmpeg.wasm** for clips | Client-side when possible |
| Hosting | Vercel (web) + recognition worker on Railway/Fly | Keep heavy models off the browser |

---

## 6. Open Source Projects to Use

### Face recognition (identity)

| Project | Role |
|---------|------|
| [InsightFace](https://github.com/deepinsight/insightface) | **Primary choice** — ArcFace embeddings for 1:N match against judges |
| [DeepFace](https://github.com/serengil/deepface) | Python wrapper; swap backends (InsightFace/ArcFace/Facenet) fast |
| [CompreFace](https://github.com/exadel-inc/CompreFace) | Self-hosted face recognition REST API (good if we want Docker, not raw Python) |
| [face_recognition](https://github.com/ageitgey/face_recognition) (dlib) | Lighter hackathon alternative; lower accuracy than InsightFace |
| [pgvector](https://github.com/pgvector/pgvector) | Store / query judge embeddings in Postgres |

**Decision for this plan:** use **InsightFace embeddings** (via DeepFace *or* CompreFace service) + **pgvector** for the judges gallery. MediaPipe stays for the live aura filter only — do not use it for identity.

### Face tracking & AR filters

| Project | Role |
|---------|------|
| [MediaPipe Tasks Vision — Face Landmarker](https://github.com/google-ai-edge/mediapipe) | Live mesh for aura attachment |
| [@mediapipe/tasks-vision](https://www.npmjs.com/package/@mediapipe/tasks-vision) | Official JS package |
| [TensorFlow.js face-landmarks-detection](https://github.com/tensorflow/tfjs-models/tree/master/face-landmarks-detection) | Fallback landmarker |
| [face-api.js](https://github.com/justadudewhohacks/face-api.js) | Optional browser-side expressions / crude local match spike |
| [PixiJS](https://github.com/pixijs/pixijs) | Aura layer compositing |
| [Three.js](https://github.com/mrdoob/three.js) | Optional 3D aura ring (v2) |

### Bad GIFs / green screen

| Project | Role |
|---------|------|
| [gifuct-js](https://github.com/matt-way/gifuct-js) | Decode GIF frames in browser |
| [omggif](https://github.com/deanm/omggif) | Alternative GIF encoder/decoder |
| Custom chroma-key util | Hard-edge green removal on purpose |
| MediaRecorder / [FFmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) | Share clips |

### Web presence / enrichment (DB miss only)

| Project / service | Role |
|-------------------|------|
| [SerpAPI](https://serpapi.com/) / [Brave Search API](https://brave.com/search/api/) | Name/hint → candidate URLs |
| [Cheerio](https://github.com/cheeriojs/cheerio) | Parse public HTML |
| [Octokit](https://github.com/octokit/octokit.js) | GitHub public signals |
| [open-graph-scraper](https://github.com/jshemas/openGraphScraper) | OG tags from public pages |

### Scoring, copy, share

| Project | Role |
|---------|------|
| Zod | Validate score / match payloads |
| Vercel AI SDK | Structured roast generation |
| [html-to-image](https://github.com/bubkoo/html-to-image) | Share card PNG |
| Web Share API | Native share sheet |

---

## 7. Face Tracker + Filter Pipeline (Detail)

### 7.1 Capture
1. `getUserMedia({ video: { facingMode: "user", width: 1280, height: 720 } })`
2. Mirror preview for selfie feel
3. Draw video → offscreen canvas each frame
4. On “Scan,” grab a well-lit still (or best of 5 frames) for recognition

### 7.2 Live detect (aura rig)
1. Run MediaPipe Face Landmarker @ ~30fps
2. Read bounding box + landmarks
3. Smooth with EMA, then add intentional 2–4px wobble

### 7.3 Aura attachment
1. Ellipse around face (slightly larger than bbox)
2. Pick GIF pack by score band
3. Decode GIF → chroma-key green hard-edged → draw around head
4. Optional landmark hull cutout so aura sits behind the head

### 7.4 “Badly green keyed” aesthetic
- 3–8px green fringe, desynced FPS, nearest-neighbor upscale, Movie Maker shadow energy
- Assets in `/public/auras/{band}/` on pure `#00FF00`

---

## 8. Face Recognition + Judges DB Pipeline

**Principle:** Consent + confirmation. Judges are pre-enrolled. Never silently roast a DB near-miss.

### 8.1 Judges schema (Postgres)

```text
judges
  id, display_name, role, bio_blurb
  linkedin_url, instagram_url, x_url, github_url, website_url
  photo_urls[]          -- reference images
  consent_at, active

judge_embeddings
  judge_id, model_name, embedding vector(512|512+), created_at

profile_cache (optional)
  judge_id, platform, snapshot_json, fetched_at
```

Use **pgvector** cosine distance. Typical InsightFace embedding size: 512.

### 8.2 Enrollment (admin / ops)
1. Judge opts in (form or CSV seed for the event).
2. Upload 1–3 clear face photos.
3. Worker runs InsightFace → store embedding(s).
4. Paste social URLs; optionally prefetch public snippets into `profile_cache`.

### 8.3 Match at scan time
1. Client sends face still (or embedding if we later run ONNX in-browser).
2. Server embeds with same model/version as enrollment.
3. `ORDER BY embedding <=> $query LIMIT 3` via pgvector.
4. If top distance ≤ threshold (tune on real photos; start ~0.3–0.4 cosine distance depending on metric):
   - Return top matches with confidence
   - User confirms
   - Load socials from judge row (+ cache)
5. If miss → Section 9 web finder (optional name hint) → confirm
6. If still nothing → `camera_only` path

### 8.4 Why judges DB is the fallback (and demo hero)
- Event Wi-Fi / LinkedIn blocks won’t kill the demo
- Recognition is fast and deterministic for known faces
- Social links are already curated — richer roasts, fewer wrong people
- Web search remains available for non-enrolled visitors

### 8.5 Legal / safety
- Only enroll people who consented to face + social storage for this app
- Embeddings are biometric-adjacent data — encrypt at rest, short retention post-event unless they opt in longer
- Match UI always shows “Matched from judges roster” vs “Found on the web”
- Rate-limit still uploads; no bulk “find anyone” API

---

## 9. Internet Finder Pipeline (Detail) — when DB misses

**Principle:** Best-effort secondary path.

### 9.1 Inputs
- Optional name / handle hint
- Optional pasted profile URLs
- Face still for verifying candidate profile photos (same InsightFace model)

### 9.2 Discovery
1. Search API queries from hint (if provided)
2. Fetch OG images / public avatars
3. Face-verify candidates against the webcam still
4. Show top cards → “This is me” / “None”

### 9.3 Signal extraction

| Source | Signals (public only) |
|--------|------------------------|
| LinkedIn | Buzzwords, emoji density, open-to-work vibe |
| Instagram | Bio / emoji / highlight energy |
| X | Bio, pinned tone, reply-guy heuristics |
| GitHub | README flex, empty contrib graph |
| Judges DB cache | Pre-fetched snippets for offline scoring |

### 9.4 Camera-side comedy signals (on-device)
- Pitch / smile / ring-light vibes → nudge ±5 only

### 9.5 Platform reality
- Prefer stored judge URLs and paste/OAuth over scraping
- Fail open to camera-only aura

---

## 10. Scoring Engine

### 10.1 Feature → points (illustrative)

| Feature | Effect |
|---------|--------|
| “Thought leader” / “visionary” in headline | −12 (glazer pull) |
| Clean headline + real project links | +10 |
| Reply-guy patterns | −15 |
| Consistent brand across DB-linked socials | +8 |
| Empty GitHub + cosplay credentials | −10 |
| Source = `judges_db` with user confirm | full score unlocked |
| Source = `camera_only` | cap band richness; template roasts |

### 10.2 Final assembly
```
base = weighted_sum(features)
band = map_to_label(base)
roast = LLM({ band, features, matchSource, tone: "hard truth, short, shareable" })
visualPack = AURA_ASSETS[band]
```

Return JSON:
```json
{
  "score": 42,
  "label": "Glazer",
  "confidence": 0.91,
  "matchSource": "judges_db",
  "matchedJudgeId": "clx...",
  "roast": "Your LinkedIn congratulates strangers weekly. Aura leased, not owned.",
  "signals": ["buzzword_density:high", "comment_glaze:detected"],
  "auraPack": "glazer_pink_kiss"
}
```

---

## 11. Share Card Spec

**Static card (1080×1920 Stories + 1200×675 timeline)**
- Freeze last camera frame + aura + score + roast
- Small chip: `JUDGE MATCH` or `WEB FIND` or `CAMERA ONLY`
- Watermark + `auratracker.app/r/{id}`

**Motion share (3–5s):** scan glitch → score slam → hold.

---

## 12. App Screens (IA)

1. `/` — Landing / start
2. `/scan` — Consent + camera (no name required)
3. `/scan/confirm` — Face match results (judges + optional web)
4. `/result/[id]` — Reveal + share
5. `/r/[id]` — Public share landing (OG tags)
6. `/admin/judges` — Enroll judges, photos, socials (protected)
7. `/privacy` — Face data + retention policy

---

## 13. Data, Privacy, Safety

- Webcam live stream stays in-browser for the filter
- Recognition stills hit the match API only after consent
- Store: embeddings, judge socials, session score payloads, share slugs
- Judges: explicit enrollment consent; deletion endpoint for opt-out
- Session TTL 7–30 days; revisit biometric retention for post-hackathon wipe
- Age gate 18+
- v1 is self-scan / enrolled-roster only — no “upload a stranger” mode

---

## 14. Milestones

### Phase 0 — Spike (3–5 days)
- [ ] MediaPipe face mesh + one bad green-key GIF
- [ ] InsightFace/CompreFace embed + cosine match on 5 sample faces
- [ ] Seed 3 fake judges with social URLs in Postgres + pgvector
- [ ] Dummy reveal + PNG share card

### Phase 1 — MVP (2–3 weeks)
- [ ] Consent + camera → face match → confirm flow
- [ ] Judges admin enrollment (photo + socials)
- [ ] DB-hit scoring from stored links (+ light fetch)
- [ ] Web/camera-only fallbacks
- [ ] Aura packs for 4 bands + share

### Phase 2 — Viral polish
- [ ] Full 8-band taxonomy
- [ ] WebM reveal export + OG pages
- [ ] Tune match threshold on real event lighting
- [ ] Prefetch `profile_cache` for all judges before showtime

### Phase 3 — Growth
- [ ] Optional name hint + richer web enrichment
- [ ] OAuth LinkedIn/GitHub
- [ ] Opt-in leaderboard / embed widget

---

## 15. Repo Layout (proposed)

```
SIH/
  apps/web/                 # Next.js app
  apps/recog-worker/        # InsightFace / CompreFace embedding service
  packages/aura-engine/     # scoring + label maps
  packages/chroma-gif/      # GIF decode + bad keying
  packages/face-rig/        # MediaPipe wrappers + smoothing
  packages/face-match/      # client helpers + API types for match
  public/auras/             # green-screen GIF packs by band
  prisma/                   # judges, embeddings (pgvector), sessions
  seeds/judges/             # photos + socials CSV/JSON for the event
  workers/enrichment/       # web search jobs (DB miss)
  AURA_TRACKER_PLAN.md
  README.md
```

---

## 16. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Face mismatch / lookalikes | Top-3 + human confirm; conservative threshold |
| Bad event lighting | Enroll multi-photo; grab best-of-N frames at scan |
| Recognition latency | Preload model on worker; cache nothing sensitive client-side |
| Platform ToS / scraping | Prefer judges’ stored URLs; web path is secondary |
| Biometric sensitivity | Consent, encryption, post-event wipe option |
| Demo network failure | Judges DB + profile_cache = fully offline-capable scoring |
| LLM roast too mean | Style guide + safety filter + templates |

---

## 17. Success Metrics

- Face match precision @ confirm (judges path)
- DB hit rate vs web vs camera-only
- Scan → reveal completion
- Share rate
- Admin enrollment time per judge

---

## 18. Open Decisions

1. **DeepFace wrapper vs CompreFace Docker** for the recog worker?
2. **Browser ONNX** for embeddings later, or always server-side?
3. **Monorepo vs single Next app** for hackathon speed?
4. **Brand name:** Aura Tracker vs Hard Truth Aura vs Make-No-Mistake Aura?

---

## 19. Immediate Next Build Steps

1. Scaffold Next.js app with consent + camera page.
2. Stand up Postgres + pgvector; seed a few judges with photos + social URLs.
3. Run InsightFace (or CompreFace) worker: enroll + `/match` endpoint.
4. Wire MediaPipe aura GIF overlay on the live preview.
5. On match confirm, score from judge socials (templates first, LLM second).
6. Export share PNG; add `/admin/judges` for roster uploads.

Demo punchline: walk up, look at the camera, get recognized as a judge, get publicly roasted — no typing required.