# Aura Tracker — Web

Next.js Windows NT UI: camera → scan → aura report.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3001  

API base (default local):

```env
NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000
```

Full monorepo docs: [../README.md](../README.md).

---

## Stack

- Next.js (static export for Netlify) + React  
- [98.css](https://github.com/jdan/98.css) NT chrome  
- Live face warp / score filters (`FaceWarpLayer`, `scoreToFaceFilter`)  
- Aura halo colors (`auraColors`, `fireAura`)  
- Score-band reaction GIFs under `public/reactions/{0-25,26-50,51-75,76-100}/`  
- Joke **Sell Data** terminal (`SellDataTerminal`)  

---

## Scripts

| Command | What it does |
|---------|----------------|
| `npm run dev` | Dev server on **3001** |
| `npm run build` | Static export → `out/` |
| `npm start` | Serve production on **3001** |
| `npm run lint` | ESLint |

Asset helpers:

| Script | Purpose |
|--------|---------|
| `scripts/prepare-face-assets.mjs` | Prep face-warp assets |
| `scripts/check-face-warps.mjs` | Sanity-check warp assets |

---

## Netlify

`web/netlify.toml` / root `netlify.toml`:

- Base: `web`  
- Build: `npm run build`  
- Publish: `out`  
- `NETLIFY_NEXT_PLUGIN_SKIP=true` (static export)  

Set `NEXT_PUBLIC_API_BASE` in Netlify env to your public API/tunnel URL.

---

## Key UI pieces

| File | Role |
|------|------|
| `src/components/CameraWindow.tsx` | NT camera chrome + scan |
| `src/components/CameraPreview.tsx` | Live video + aura |
| `src/components/ReportWindow.tsx` | Score / roast / reactions |
| `src/components/FaceWarpLayer.tsx` | Mog / not-mog warp |
| `src/components/SellDataTerminal.tsx` | Fake data-sale terminal |
| `src/lib/api.ts` | API client |
| `src/lib/auraColors.ts` | Score → aura palette |
