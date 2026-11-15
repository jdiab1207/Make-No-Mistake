/**
 * Chad "mog" reshape preset for OpenMakeupSDK.
 * Morphs YOUR live face (not a photo overlay) via blend-shape style warp.
 * @see https://github.com/ehsanwwe/OpenMakeupSDK
 */
export const CHAD_MORPH: Record<string, number> = {
  // Wide + angled jaw (GigaChad lower-third)
  jawWide: 1.15,
  jawAngle: 1.05,
  // Slight cheek / midface support so the jaw reads stronger
  cheeks: 0.35,
  // Cleaner mid features
  noseSlim: 0.2,
  noseBridge: 0.15,
  browLift: 0.12,
  lipPlump: 0.08,
};

/** Extra global reshape strength (OpenMakeup MakeupEngine.morphGain). */
export const CHAD_MORPH_GAIN = 1.25;

export const OPEN_MAKEUP_ASSETS =
  "https://cdn.jsdelivr.net/npm/open-makeup-sdk@0.1.0/assets";
export const MEDIAPIPE_FACE_MESH_BASE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619";
