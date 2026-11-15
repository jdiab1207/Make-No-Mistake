# Aura Scanner (web)

Next.js front end for the Windows NT–style Aura Scanner.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3001

Full install / run docs: see the [repo root README](../README.md).

## Stack

- Next.js 16 + React 19
- [98.css](https://github.com/jdan/98.css)
- [open-makeup-sdk](https://github.com/ehsanwwe/OpenMakeupSDK) — live face reshape (Chad morph)
- MediaPipe FaceMesh + Three.js (peers of the SDK)

## Scripts

| Command | What it does |
|---------|----------------|
| `npm run dev` | Dev server on port **3001** |
| `npm run build` | Production build |
| `npm start` | Serve production build on **3001** |
| `npm run lint` | ESLint |
