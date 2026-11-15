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
- Browser `getUserMedia` for a mirrored live webcam preview
- MediaPipe Tasks Vision landmarks + a local WebGL image warp
- Original, Mog and Not Mog presets with adjustable strength
- Fire around the body silhouette or fart clouds around the head, with colour and size controls
- The earlier OpenMakeupSDK integration is not mounted or loaded by the camera view.

## Camera and local filters

Open http://localhost:3001 and allow camera access. No API tokens or external
filter services are needed. Stop Camera (or the window's Close button) releases
the webcam; Start Camera / Retry Camera opens it again. Changing presets and
strength keeps the existing stream running. Camera frames are not uploaded.

Mog exaggerates raised cheekbones, a broader jaw and deeper chin, a slightly
smaller nose, and raised outer eye corners (positive canthal tilt). Not Mog
exaggerates the forehead and nose with a narrower lower face and lowered outer
eye corners (negative canthal tilt). Eye tilt follows head roll and fades out
before the inner eye corners. The strength slider controls all changes together.
Mog also projects the chin forward as the nose turns away from the face centre;
the effect ramps smoothly toward either side and follows head roll. This uses
the tracked nose-to-bridge offset as a 2D pose estimate, not a 3D face reconstruction.
These are visual comedy presets, not appearance measurements. Strength 0 is
undistorted. Face landmarks are smoothed and tracking runs at up to 20 fps.
When no face is detected, the preview is undistorted. If the tracker or WebGL
fails, the original camera stays live; choose Original and then a preset to retry.
Scan Aura is a timed demo using the editable Demo score field. On completion,
the score selects the face preset and its strength:

| Score | Preset | Strength |
|-------|--------|----------|
| 60 | Mog | 80% |
| 70 | Mog | 90% |
| 80 and above | Mog | 100% |
| 59 | Not Mog | 50% |
| 35 | Not Mog | about 74.5% |
| 10 and below | Not Mog | 100% |

The negative range interpolates linearly between scores 59 and 10. Scores are
clamped to 0–100. `src/lib/scoreToFaceFilter.ts` contains this mapping. The demo
does not call the remote branch's face recognition or social discovery backend.

`npm install` prepares local model and WASM files in `public/face-assets/`.
The model downloads once from Google's MediaPipe model storage; later loads
are served by this app. To repair missing assets, run `npm run prepare:face`.
Asset files are generated and ignored by Git. Deployment must run the install
script (or `npm run prepare:face`) before building and include `public/`.
Run `node scripts/check-face-warps.mjs` for preset geometry and score checks.

Camera errors distinguish denied permission, missing hardware and an unavailable
device. For an unavailable device, close other apps or tabs using the webcam.

Choose **Aura → Fire** to add large flames around your hair, head, shoulders and
visible body silhouette. Choose **Aura colour** to recolour the flames immediately
and **Aura size** to change their spread (default 160%). It works with Original,
Mog and Not Mog. Demo scores of 60+ select Mog + Fire; scores below 60 select
Not Mog + Fart clouds. You can manually override either the face preset or aura.
The effect uses a local MediaPipe person-segmentation mask and procedural animated
noise in the existing WebGL renderer. The person interior stays unobscured.
Body tracking runs independently of visible face landmarks, so the aura still
works in profile or when you turn away. Segmentation runs at up to 12 fps and
includes visible clothing; other prominent people may also enter the mask.
If silhouette tracking fails, the camera and face presets remain usable.

Choose **Aura → Fart clouds** for drifting olive-green puffs around the head.
This negative aura uses the tracked head position and the person mask to keep
the face and hair clear. Clouds pause if the face is lost. **Aura colour** and
**Aura size** also control clouds, and each aura remembers its own colour.
Choose **Off** to remove the aura while retaining any face distortion.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Development server on port 3001 |
| `npm run build` | Production build with TypeScript checks |
| `npm start` | Production server on port 3001 |
| `npm run lint` | Project ESLint checks |
| `npm run prepare:face` | Prepare the local model and WASM assets |
| `node scripts/check-face-warps.mjs` | Check preset geometry and score mapping |
