import type { FacePreset } from "./faceWarp";
import type { AuraMode } from "./fireAura";

export type FaceFilterState = {
  score: number;
  preset: FacePreset;
  /** 0–1 intensity scaled by distance from the midpoint (50). */
  strength: number;
  aura: AuraMode;
};

/**
 * Score → local face warp + aura.
 * - Over 50 → mog + fire (strength scales 0→1 toward 100)
 * - Under 50 → not-mog + clouds (strength scales 0→1 toward 0)
 * - Exactly 50 → original / aura off
 */
export function scoreToFaceFilter(score: number): FaceFilterState {
  if (!Number.isFinite(score)) {
    return { score: 50, preset: "original", strength: 0, aura: "off" };
  }
  const bounded = Math.max(0, Math.min(100, score));
  if (bounded > 50) {
    return {
      score: bounded,
      preset: "mog",
      strength: Math.min(1, (bounded - 50) / 50),
      aura: "fire",
    };
  }
  if (bounded < 50) {
    return {
      score: bounded,
      preset: "not-mog",
      strength: Math.min(1, (50 - bounded) / 50),
      aura: "clouds",
    };
  }
  return { score: 50, preset: "original", strength: 0, aura: "off" };
}
