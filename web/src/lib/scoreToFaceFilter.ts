import type { FacePreset } from "./faceWarp";

export function scoreToFaceFilter(score: number): {
  score: number;
  preset: Exclude<FacePreset, "original">;
  strength: number;
} {
  if (!Number.isFinite(score)) throw new RangeError("Aura score must be a finite number");
  const bounded = Math.max(0, Math.min(100, score));
  return bounded >= 60
    ? { score: bounded, preset: "mog", strength: Math.min(1, 0.8 + (bounded - 60) / 100) }
    : { score: bounded, preset: "not-mog", strength: Math.min(1, 0.5 + Math.max(0, 59 - bounded) / 98) };
}
