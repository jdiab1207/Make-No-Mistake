"use client";

import { useEffect, useRef, useState } from "react";
import type { OpenMakeup } from "open-makeup-sdk";
import {
  CHAD_MORPH,
  CHAD_MORPH_GAIN,
  MEDIAPIPE_FACE_MESH_BASE,
  OPEN_MAKEUP_ASSETS,
} from "@/lib/chadMorph";
import { loadMediapipeScripts } from "@/lib/loadMediapipeScripts";

type Props = {
  active: boolean;
  onStatus?: (status: "loading" | "ready" | "error", detail?: string) => void;
};

/**
 * Live face reshape via open-makeup-sdk (MediaPipe FaceMesh + WebGL morph).
 * Warps the webcam face toward Chad proportions — not an image overlay.
 */
export default function ChadMorphFilter({ active, onStatus }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const makeupRef = useRef<OpenMakeup | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    async function boot() {
      onStatus?.("loading");
      try {
        await loadMediapipeScripts();
        if (cancelled || !video || !canvas) return;

        const { OpenMakeup } = await import("open-makeup-sdk");
        const mk = new OpenMakeup({
          video,
          renderCanvas: canvas,
          assetsBaseUrl: OPEN_MAKEUP_ASSETS,
          mediapipeBaseUrl: MEDIAPIPE_FACE_MESH_BASE,
        });

        await mk.init();
        if (cancelled) {
          mk.dispose();
          return;
        }

        mk.engine.morphGain = CHAD_MORPH_GAIN;
        mk.morph(CHAD_MORPH);
        mk.clearAll();

        makeupRef.current = mk;
        setReady(true);
        onStatus?.("ready");
      } catch (err) {
        const detail = err instanceof Error ? err.message : "init failed";
        onStatus?.("error", detail);
      }
    }

    void boot();

    return () => {
      cancelled = true;
      makeupRef.current?.dispose();
      makeupRef.current = null;
      setReady(false);
    };
  }, [active, onStatus]);

  useEffect(() => {
    const mk = makeupRef.current;
    if (!mk || !ready) return;
    if (active) mk.start();
    else mk.stop();
  }, [active, ready]);

  return (
    <div className="nt-morph-stage">
      <video
        ref={videoRef}
        className="nt-camera-well__source"
        playsInline
        muted
        autoPlay
      />
      <canvas ref={canvasRef} className="nt-aura-canvas nt-morph-canvas" />
      <div className="nt-morph-glow" aria-hidden />
    </div>
  );
}
