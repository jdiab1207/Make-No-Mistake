"use client";

import { useEffect, useRef } from "react";
import type { OpenMakeup } from "open-makeup-sdk";
import {
  CHAD_MORPH,
  CHAD_MORPH_GAIN,
  MEDIAPIPE_FACE_MESH_BASE,
  OPEN_MAKEUP_ASSETS,
} from "@/lib/chadMorph";
import { loadMediapipeScripts } from "@/lib/loadMediapipeScripts";

type Props = {
  onStatus?: (status: "loading" | "ready" | "error", detail?: string) => void;
};

/**
 * Always-on live face reshape via open-makeup-sdk.
 * Warps the webcam face toward Chad proportions — not a photo overlay.
 */
export default function ChadMorphFilter({ onStatus }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const makeupRef = useRef<OpenMakeup | null>(null);
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

  useEffect(() => {
    let cancelled = false;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!video || !canvas) return;

    function sizeCanvas() {
      if (!canvas || !stage) return;
      const rect = stage.getBoundingClientRect();
      const w = Math.max(320, Math.floor(rect.width) || 640);
      const h = Math.max(240, Math.floor(rect.height) || 480);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    }

    async function boot() {
      onStatusRef.current?.("loading");
      try {
        sizeCanvas();
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

        sizeCanvas();
        mk.engine.morphGain = CHAD_MORPH_GAIN;
        mk.morph(CHAD_MORPH);
        mk.clearAll();
        mk.start();

        makeupRef.current = mk;
        onStatusRef.current?.("ready");
      } catch (err) {
        const detail = err instanceof Error ? err.message : "init failed";
        onStatusRef.current?.("error", detail);
      }
    }

    void boot();

    const onResize = () => sizeCanvas();
    window.addEventListener("resize", onResize);

    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      makeupRef.current?.dispose();
      makeupRef.current = null;
    };
  }, []);

  return (
    <div className="nt-morph-stage" ref={stageRef}>
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
