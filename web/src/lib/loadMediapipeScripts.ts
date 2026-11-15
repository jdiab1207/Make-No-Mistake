const FACE_MESH_SRC =
  "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/face_mesh.js";
const CAMERA_UTILS_SRC =
  "https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3/camera_utils.js";

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "1") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Failed ${src}`)), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = "1";
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed ${src}`));
    document.head.appendChild(script);
  });
}

/** OpenMakeupSDK expects classic MediaPipe globals on `window`. */
export async function loadMediapipeScripts(): Promise<void> {
  await loadScript(CAMERA_UTILS_SRC);
  await loadScript(FACE_MESH_SRC);
}
