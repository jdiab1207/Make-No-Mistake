"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { auraPaletteForScore } from "@/lib/auraColors";

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

const CameraPreview = forwardRef<CameraPreviewHandle, Props>(function CameraPreview(
  { onStatus, auraScore = null },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const freezeRef = useRef<HTMLCanvasElement>(null);
  const auraRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const maskRef = useRef<CanvasImageSource | null>(null);
  const frozenRef = useRef(false);
  const lastFrameRef = useRef<HTMLCanvasElement | null>(null);
  const scoreRef = useRef<number | null>(auraScore);
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  scoreRef.current = auraScore ?? null;

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
      freeze.classList.add("is-visible");
      video?.classList.add("is-frozen");
    },

    unfreeze() {
      frozenRef.current = false;
      freezeRef.current?.classList.remove("is-visible");
      videoRef.current?.classList.remove("is-frozen");
    },
  }));

  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    let segmenter: {
      close: () => void;
      send: (s: { image: HTMLVideoElement | HTMLCanvasElement }) => Promise<void>;
    } | null = null;
    const video = videoRef.current;
    const auraCanvas = auraRef.current;
    if (!video || !auraCanvas) return;

    const personBuf = document.createElement("canvas");
    const bodyBuf = document.createElement("canvas");
    const dilateBuf = document.createElement("canvas");
    const glowBuf = document.createElement("canvas");
    const personCtx = personBuf.getContext("2d", { willReadFrequently: true });
    const bodyCtx = bodyBuf.getContext("2d", { willReadFrequently: true });
    const dilateCtx = dilateBuf.getContext("2d", { willReadFrequently: true });
    const glowCtx = glowBuf.getContext("2d");

    function syncCss(w: number, h: number) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const bw = Math.max(1, Math.round(w * dpr));
      const bh = Math.max(1, Math.round(h * dpr));
      if (auraCanvas!.width !== bw || auraCanvas!.height !== bh) {
        auraCanvas!.width = bw;
        auraCanvas!.height = bh;
        auraCanvas!.style.width = `${w}px`;
        auraCanvas!.style.height = `${h}px`;
      }
      if (personBuf.width !== bw || personBuf.height !== bh) {
        personBuf.width = bw;
        personBuf.height = bh;
        bodyBuf.width = bw;
        bodyBuf.height = bh;
        dilateBuf.width = bw;
        dilateBuf.height = bh;
        glowBuf.width = bw;
        glowBuf.height = bh;
      }
      return { bw, bh, dpr };
    }

    /** Soft luminance → alpha (keeps feathered edges, avoids chunky mask). */
    function luminanceToAlpha(ctx: CanvasRenderingContext2D, w: number, h: number) {
      const img = ctx.getImageData(0, 0, w, h);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = d[i] / 255;
        const a = v * v * (3 - 2 * v);
        d[i] = 255;
        d[i + 1] = 255;
        d[i + 2] = 255;
        d[i + 3] = Math.round(a * 255);
      }
      ctx.putImageData(img, 0, 0);
    }

    /** Solid cutout mask — any person pixel becomes fully opaque. */
    function hardenAlpha(ctx: CanvasRenderingContext2D, w: number, h: number, threshold = 24) {
      const img = ctx.getImageData(0, 0, w, h);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        d[i] = 255;
        d[i + 1] = 255;
        d[i + 2] = 255;
        d[i + 3] = d[i + 3] >= threshold ? 255 : 0;
      }
      ctx.putImageData(img, 0, 0);
    }

    function drawAura(t: number) {
      if (!personCtx || !bodyCtx || !dilateCtx || !glowCtx) return;
      const ctx = auraCanvas.getContext("2d");
      if (!ctx) return;

      const cssW = video.clientWidth || 640;
      const cssH = video.clientHeight || 480;
      const { bw, bh } = syncCss(cssW, cssH);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, bw, bh);

      const score = scoreRef.current;
      const mask = maskRef.current;
      if (score == null || !mask) return;

      const palette = auraPaletteForScore(score);
      const pulse = 1 + 0.018 * Math.sin(t / 420);
      const cx = bw * 0.5;
      const cy = bh * 0.28;

      // --- Full body mask (for cutout — keeps ALL color off the person) ---
      bodyCtx.setTransform(1, 0, 0, 1, 0, 0);
      bodyCtx.clearRect(0, 0, bw, bh);
      bodyCtx.save();
      if (!frozenRef.current) {
        bodyCtx.translate(bw, 0);
        bodyCtx.scale(-1, 1);
      }
      bodyCtx.imageSmoothingEnabled = true;
      bodyCtx.imageSmoothingQuality = "high";
      bodyCtx.drawImage(mask, 0, 0, bw, bh);
      bodyCtx.restore();
      luminanceToAlpha(bodyCtx, bw, bh);
      hardenAlpha(bodyCtx, bw, bh, 18);

      // --- Head-only mask (for generating the halo shape) ---
      personCtx.clearRect(0, 0, bw, bh);
      personCtx.drawImage(bodyBuf, 0, 0);
      const chestFade = personCtx.createLinearGradient(0, bh * 0.28, 0, bh * 0.5);
      chestFade.addColorStop(0, "rgba(0,0,0,0)");
      chestFade.addColorStop(0.45, "rgba(0,0,0,160)");
      chestFade.addColorStop(1, "rgba(0,0,0,255)");
      personCtx.globalCompositeOperation = "destination-out";
      personCtx.fillStyle = chestFade;
      personCtx.fillRect(0, 0, bw, bh);
      personCtx.globalCompositeOperation = "source-over";

      // --- Outer halo from head ---
      dilateCtx.clearRect(0, 0, bw, bh);
      dilateCtx.save();
      dilateCtx.translate(cx, cy);
      dilateCtx.scale(1.42 + 0.02 * pulse, 1.48 + 0.02 * pulse);
      dilateCtx.translate(-cx, -cy);
      dilateCtx.filter = "blur(18px)";
      dilateCtx.globalAlpha = 0.95;
      dilateCtx.drawImage(personBuf, 0, 0);
      dilateCtx.restore();
      dilateCtx.filter = "none";
      dilateCtx.globalAlpha = 1;

      glowCtx.clearRect(0, 0, bw, bh);
      glowCtx.drawImage(dilateBuf, 0, 0);
      glowCtx.globalCompositeOperation = "source-in";
      const grad = glowCtx.createRadialGradient(
        cx,
        cy,
        bw * 0.06,
        cx,
        cy,
        Math.max(bw, bh) * 0.58,
      );
      grad.addColorStop(0, palette.core);
      grad.addColorStop(0.3, palette.glow);
      grad.addColorStop(0.65, palette.rim);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      glowCtx.fillStyle = grad;
      glowCtx.fillRect(0, 0, bw, bh);
      glowCtx.globalCompositeOperation = "source-over";

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.save();
      ctx.filter = "blur(16px)";
      ctx.globalAlpha = 0.75;
      ctx.drawImage(glowBuf, 0, 0);
      ctx.filter = "blur(34px)";
      ctx.globalAlpha = 0.55;
      ctx.drawImage(glowBuf, 0, 0);
      ctx.filter = "blur(56px)";
      ctx.globalAlpha = 0.35;
      ctx.drawImage(glowBuf, 0, 0);
      ctx.restore();

      // Soft falloff band outside the outline
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.filter = "blur(22px)";
      ctx.translate(cx, cy);
      ctx.scale(1.12, 1.14);
      ctx.translate(-cx, -cy);
      ctx.drawImage(bodyBuf, 0, 0);
      ctx.restore();

      // HARD cut: zero glow on face / body / chest (solid silhouette, slightly oversized)
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.filter = "none";
      ctx.globalAlpha = 1;
      ctx.translate(cx, cy);
      ctx.scale(1.045, 1.05);
      ctx.translate(-cx, -cy);
      ctx.drawImage(bodyBuf, 0, 0);
      ctx.restore();

      // Extra safety pass — catch any soft bleed on the face
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.filter = "blur(3px)";
      ctx.translate(cx, cy);
      ctx.scale(1.02, 1.025);
      ctx.translate(-cx, -cy);
      ctx.drawImage(bodyBuf, 0, 0);
      ctx.restore();
    }

    function loop(now: number) {
      if (cancelled) return;
      drawAura(now);
      raf = requestAnimationFrame(loop);
    }

    async function boot() {
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
        video.srcObject = stream;
        await video.play();

        await loadScript(
          "https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747/selfie_segmentation.js",
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const SS = (window as any).SelfieSegmentation;
        if (!SS) throw new Error("SelfieSegmentation failed to load");

        const seg = new SS({
          locateFile: (file: string) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747/${file}`,
        });
        seg.setOptions({ modelSelection: 1 });
        seg.onResults((results: { segmentationMask?: CanvasImageSource }) => {
          maskRef.current = results.segmentationMask ?? null;
        });
        segmenter = seg;

        const tick = async () => {
          if (cancelled) return;
          const freezeEl = freezeRef.current;
          const source: HTMLVideoElement | HTMLCanvasElement | null = frozenRef.current
            ? freezeEl
            : video;
          if (source && ("readyState" in source ? source.readyState >= 2 : true)) {
            try {
              await seg.send({ image: source });
            } catch {
              /* ignore */
            }
          }
          if (!cancelled) window.setTimeout(() => void tick(), 50);
        };
        void tick();
        raf = requestAnimationFrame(loop);
        onStatusRef.current?.("ready");
      } catch (err) {
        const detail = err instanceof Error ? err.message : "camera failed";
        onStatusRef.current?.("error", detail);
        raf = requestAnimationFrame(loop);
      }
    }

    void boot();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      segmenter?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      video.srcObject = null;
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
      <canvas ref={freezeRef} className="nt-camera-freeze" aria-hidden />
      <canvas ref={auraRef} className="nt-aura-overlay" aria-hidden />
    </div>
  );
});

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

export default CameraPreview;
