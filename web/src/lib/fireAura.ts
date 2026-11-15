import type { Point } from "./faceWarp";

export type AuraMode = "off" | "fire" | "clouds";
export type PersonMask = { data: Uint8Array; width: number; height: number };

export function cloudHeadBounds(points: Point[]): [number, number, number, number] | undefined {
  if (points.length < 455) return;
  const top = points[10], chin = points[152], left = points[234], right = points[454];
  const width = Math.hypot(right.x - left.x, right.y - left.y);
  const height = Math.hypot(chin.x - top.x, chin.y - top.y);
  if (!Number.isFinite(width + height + top.x + top.y + chin.x + chin.y) || width < 0.01 || height < 0.01) return;
  return [(top.x + chin.x) / 2, (top.y + chin.y) / 2 - height * 0.12, width * 0.72, height * 0.68];
}

export function personMaskFromConfidence(confidence: Float32Array, width: number, height: number): PersonMask {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || confidence.length !== width * height) {
    throw new RangeError("Invalid person mask dimensions");
  }
  const data = Uint8Array.from(confidence, value => Number.isFinite(value) ? Math.round(Math.max(0, Math.min(1, value)) * 255) : 0);
  return { data, width, height };
}

export function auraColorRgb(hex: string): [number, number, number] {
  const value = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : "ff6500";
  return [0, 2, 4].map(offset => parseInt(value.slice(offset, offset + 2), 16) / 255) as [number, number, number];
}
