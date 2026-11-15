"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { scoreToFaceFilter } from "@/lib/scoreToFaceFilter";
import FaceWarpLayer from "./FaceWarpLayer";

export type CameraPreviewHandle = {
  captureJpeg: () => Promise<Blob | null>;
  /** Lock the preview to the last good frame so the user can walk away while scanning. */
  freeze: () => void;
  unfreeze: () => void;
};

type Props = {
  onStatus?: (status: "loading" | "ready" | "error", detail?: string) => void;
  auraScore?: number | null;
};

const FIRE_COLOR = "#ff6500";
const CLOUD_COLOR = "#8ca64a";

const CameraPreview = forwardRef<CameraPreviewHandle, Props>(function CameraPreview(
  { onStatus, auraScore = null },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const freezeRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frozenRef = useRef(false);
  const lastFrameRef = useRef<HTMLCanvasElement | null>(null);
  const onStatusRef = useRef(onStatus);
  const [frozen, setFrozen] = useState(false);
  onStatusRef.current = onStatus;

  const faceFilter = useMemo(
    () =>
      auraScore == null
        ? { preset: "original" as const, strength: 0, aura: "off" as const }
        : scoreToFaceFilter(auraScore),
    [auraScore],
  );
  const effectsActive =
    !frozen &&
    (faceFilter.preset !== "original" || faceFilter.aura !== "off") &&
    faceFilter.strength > 0;
  const auraColor = faceFilter.aura === "clouds" ? CLOUD_COLOR : FIRE_COLOR;
  // Map 0–1 strength onto aura size: 0 → 10%, 1 → 250%.
  const auraSize = 0.1 + faceFilter.strength * 2.4;

  const onTracking = useCallback((message: string) => {
    console.log("[aura] face filter", message);
  }, []);

  useImperativeHandle(ref, () => ({
    async captureJpeg() {
      const video = videoRef.current;
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

      const grab = async (): Promise<{ blob: Blob; frame: HTMLCanvasElement } | null> => {
        if (!video || video.readyState < 2 || video.videoWidth < 2) return null;
        const w = video.videoWidth;
        const h = video.videoHeight;
        const off = document.createElement("canvas");
        off.width = w;
        off.height = h;
        const ctx = off.getContext("2d", { willReadFrequently: true });
        if (!ctx) return null;
        ctx.drawImage(video, 0, 0, w, h);
        const sample = ctx.getImageData(0, 0, Math.min(64, w), Math.min(64, h)).data;
        let sum = 0;
        for (let i = 0; i < sample.length; i += 4) {
          sum += sample[i] + sample[i + 1] + sample[i + 2];
        }
        const mean = sum / ((sample.length / 4) * 3);
        if (mean < 8) return null;
        const blob = await new Promise<Blob | null>((resolve) => {
          off.toBlob((b) => resolve(b), "image/jpeg", 0.92);
        });
        if (!blob) return null;
        return { blob, frame: off };
      };

      for (let attempt = 0; attempt < 6; attempt++) {
        const hit = await grab();
        if (hit) {
          lastFrameRef.current = hit.frame;
          return hit.blob;
        }
        await sleep(120);
      }
      return null;
    },

    freeze() {
      const freeze = freezeRef.current;
      const frame = lastFrameRef.current;
      const video = videoRef.current;
      if (!freeze) return;
      const ctx = freeze.getContext("2d");
      if (!ctx) return;

      const src = frame || video;
      if (!src) return;

      const w =
        frame?.width ||
        video?.videoWidth ||
        freeze.clientWidth ||
        640;
      const h =
        frame?.height ||
        video?.videoHeight ||
        freeze.clientHeight ||
        480;
      freeze.width = w;
      freeze.height = h;
      // Draw mirrored to match live preview CSS
      ctx.save();
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      if (frame) ctx.drawImage(frame, 0, 0, w, h);
      else if (video) ctx.drawImage(video, 0, 0, w, h);
      ctx.restore();

      frozenRef.current = true;
      setFrozen(true);
      freeze.classList.add("is-visible");
      video?.classList.add("is-frozen");
    },

    unfreeze() {
      frozenRef.current = false;
      setFrozen(false);
      freezeRef.current?.classList.remove("is-visible");
      videoRef.current?.classList.remove("is-frozen");
    },
  }));

  useEffect(() => {
    let cancelled = false;
    if (!videoRef.current) return;

    async function boot() {
      const videoEl = videoRef.current;
      if (!videoEl) return;
      onStatusRef.current?.("loading");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = stream;
        videoEl.srcObject = stream;
        await videoEl.play();
        onStatusRef.current?.("ready");
      } catch (err) {
        const detail = err instanceof Error ? err.message : "camera failed";
        onStatusRef.current?.("error", detail);
      }
    }

    void boot();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, []);

  return (
    <div className="nt-camera-stage">
      <video
        ref={videoRef}
        className="nt-camera-video"
        playsInline
        muted
        autoPlay
      />
      <FaceWarpLayer
        key={effectsActive ? `${faceFilter.preset}-${faceFilter.aura}` : "off"}
        videoRef={videoRef}
        active={effectsActive}
        preset={faceFilter.preset}
        strength={faceFilter.strength}
        auraMode={faceFilter.aura}
        auraColor={auraColor}
        auraSize={auraSize}
        onTracking={onTracking}
      />
      <canvas ref={freezeRef} className="nt-camera-freeze" aria-hidden />
    </div>
  );
});

export default CameraPreview;
