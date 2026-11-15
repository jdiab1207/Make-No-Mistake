import { cp, mkdir, stat, writeFile, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const assets = new URL("public/face-assets/", root);
await mkdir(assets, { recursive: true });
await cp(new URL("node_modules/@mediapipe/tasks-vision/wasm/", root), new URL("wasm/", assets), { recursive: true });
const model = new URL("face_landmarker.task", assets);
if (!(await stat(model).catch(() => null))?.size) {
  const response = await fetch("https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task", { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Face model download failed: ${response.status}`);
  const pending = new URL("face_landmarker.task.tmp", assets);
  await writeFile(pending, new Uint8Array(await response.arrayBuffer()));
  await rename(pending, model);
}
console.log(`Face filter assets ready: ${fileURLToPath(assets)}`);
