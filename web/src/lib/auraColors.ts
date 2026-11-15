/** Score → aura color (matches AURA_TRACKER_PLAN taxonomy). */

export type AuraPalette = {
  core: string;
  glow: string;
  rim: string;
  label: string;
};

export function auraPaletteForScore(score: number): AuraPalette {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  if (s <= 15) {
    return { core: "#9a9a9a", glow: "rgba(140,140,140,0.95)", rim: "#d0d0d0", label: "Cooked" };
  }
  if (s <= 30) {
    return { core: "#b0b0b0", glow: "rgba(170,170,170,0.95)", rim: "#ececec", label: "NPC" };
  }
  if (s <= 45) {
    return { core: "#ff2d95", glow: "rgba(255,80,180,0.95)", rim: "#ffb0de", label: "Glazer" };
  }
  if (s <= 55) {
    return { core: "#e0b060", glow: "rgba(230,180,90,0.95)", rim: "#ffe0a8", label: "Mid" };
  }
  if (s <= 70) {
    return { core: "#00ff7a", glow: "rgba(0,255,130,0.95)", rim: "#9affc8", label: "Aura Farming" };
  }
  if (s <= 85) {
    return { core: "#ffd000", glow: "rgba(255,210,40,0.95)", rim: "#fff3a0", label: "Aura" };
  }
  if (s <= 95) {
    return { core: "#ffbf00", glow: "rgba(255,200,0,0.98)", rim: "#fff6c0", label: "Max Aura" };
  }
  return { core: "#d070ff", glow: "rgba(220,100,255,0.98)", rim: "#ff7ad9", label: "Mythic" };
}
