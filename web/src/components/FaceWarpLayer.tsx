"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { buildFaceWarps, createFaceWarpRenderer, type FacePreset, type Point } from "@/lib/faceWarp";

type Props = {
  videoRef: RefObject<HTMLVideoElement | null>;
  active: boolean;
  preset: FacePreset;
  strength: number;
  onTracking: (message: string) => void;
};

export default function FaceWarpLayer({ videoRef, active, preset, strength, onTracking }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settings = useRef({ preset, strength });
  const [visible, setVisible] = useState(false);
  const enabled = active && preset !== "original";

  useEffect(() => { settings.current = { preset, strength }; }, [preset, strength]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!enabled || !canvas) return;
    let cancelled = false;
    let tracker: FaceLandmarker | undefined;
    let renderer: ReturnType<typeof createFaceWarpRenderer> | undefined;
    let animation = 0;
    let smooth: Point[] | undefined;
    let lastDetection = -Infinity;
    let lastVideoTime = -1;
    let lastMessage = "";

    function report(message: string) {
      if (!cancelled && message !== lastMessage) {
        lastMessage = message;
        onTracking(message);
      }
    }
    function dispose() {
      cancelAnimationFrame(animation);
      tracker?.close();
      tracker = undefined;
      renderer?.dispose();
      renderer = undefined;
    }
    function fallback() {
      dispose();
      if (!cancelled) {
        setVisible(false);
        report("Face filter unavailable — original camera is still live. Switch to Original and back to retry.");
      }
    }

    async function boot() {
      report("Loading face tracking…");
      try {
        const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
        if (cancelled) return;
        const files = await FilesetResolver.forVisionTasks("/face-assets/wasm");
        if (cancelled) return;
        tracker = await FaceLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: "/face-assets/face_landmarker.task", delegate: "CPU" },
          runningMode: "VIDEO",
          numFaces: 1,
          minFaceDetectionConfidence: 0.6,
          minTrackingConfidence: 0.6,
        });
        if (cancelled) return dispose();
        renderer = createFaceWarpRenderer(canvas!);

        const render = (time: number) => {
          if (cancelled) return;
          try {
            const video = videoRef.current;
            if (video && video.readyState >= 2 && video.videoWidth > 0) {
              if (video.currentTime !== lastVideoTime) {
                lastVideoTime = video.currentTime;
                // ponytail: synchronous tracking capped at 20 fps; move to a worker if it stalls slower devices.
                if (time - lastDetection >= 50) {
                  const points = tracker!.detectForVideo(video, time).faceLandmarks[0];
                  const alpha = Math.min(1, 1 - Math.exp(-(time - lastDetection) / 65));
                  smooth = points?.map((point, i) => ({
                    x: smooth ? smooth[i].x + (point.x - smooth[i].x) * alpha : point.x,
                    y: smooth ? smooth[i].y + (point.y - smooth[i].y) * alpha : point.y,
                  }));
                  lastDetection = time;
                  report(smooth ? "Face tracked · Local filter active" : "No face detected — showing original camera");
                }
                const { preset, strength } = settings.current;
                renderer!.draw(video, smooth ? buildFaceWarps(smooth, preset) : [], strength);
                setVisible(true);
              }
            }
            animation = requestAnimationFrame(render);
          } catch {
            fallback();
          }
        };
        animation = requestAnimationFrame(render);
      } catch {
        fallback();
      }
    }
    void boot();
    return () => {
      cancelled = true;
      dispose();
    };
  }, [enabled, videoRef, onTracking]);

  return <canvas ref={canvasRef} className="nt-face-warp" hidden={!enabled || !visible} aria-label="Live face distortion preview" />;
}
