/** Score → continuous aura color: red (bad) → orange (mid) → green (good). */

export type AuraPalette = {
  core: string;
  glow: string;
  rim: string;
  label: string;
};

type RGB = [number, number, number];

const BAD: RGB = [255, 36, 36]; // red
const MID: RGB = [255, 140, 24]; // orange
const GOOD: RGB = [24, 220, 96]; // green

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function mix(a: RGB, b: RGB, t: number): RGB {
  const u = Math.max(0, Math.min(1, t));
  return [
    Math.round(lerp(a[0], b[0], u)),
    Math.round(lerp(a[1], b[1], u)),
    Math.round(lerp(a[2], b[2], u)),
  ];
}

/** Map 0–100 → RGB along red → orange → green. */
export function auraRgbForScore(score: number): RGB {
  const s = Math.max(0, Math.min(100, score));
  if (s <= 50) {
    return mix(BAD, MID, s / 50);
  }
  return mix(MID, GOOD, (s - 50) / 50);
}

function lighten(rgb: RGB, amount: number): RGB {
  return mix(rgb, [255, 255, 255], amount);
}

function rgba(rgb: RGB, alpha: number) {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

function hex(rgb: RGB) {
  return `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function labelForScore(s: number): string {
  if (s <= 15) return "Cooked";
  if (s <= 30) return "NPC";
  if (s <= 45) return "Glazer";
  if (s <= 55) return "Mid";
  if (s <= 70) return "Aura Farming";
  if (s <= 85) return "Aura";
  if (s <= 95) return "Max Aura";
  return "Mythic";
}

export function auraPaletteForScore(score: number): AuraPalette {
  const s = Math.max(0, Math.min(100, score));
  const base = auraRgbForScore(s);
  const bright = lighten(base, 0.28);
  const soft = lighten(base, 0.55);
  return {
    core: hex(bright),
    glow: rgba(base, 0.96),
    rim: hex(soft),
    label: labelForScore(s),
  };
}
