"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { FaceLandmarker, ImageSegmenter } from "@mediapipe/tasks-vision";
import { buildFaceWarps, createFaceWarpRenderer, type FacePreset, type Point } from "@/lib/faceWarp";
import { personMaskFromConfidence, type PersonMask, type AuraMode } from "@/lib/fireAura";

type Props = {
  videoRef: RefObject<HTMLVideoElement | null>;
  active: boolean;
  preset: FacePreset;
  strength: number;
  auraMode: AuraMode;
  auraColor: string;
  auraSize: number;
  onTracking: (message: string) => void;
};

export default function FaceWarpLayer({
  videoRef,
  active,
  preset,
  strength,
  auraMode,
  auraColor,
  auraSize,
  onTracking,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settings = useRef({ preset, strength, auraMode, auraColor, auraSize });
  const [visible, setVisible] = useState(false);
  const enabled = active && (preset !== "original" || auraMode !== "off");

  useEffect(() => {
    settings.current = { preset, strength, auraMode, auraColor, auraSize };
  }, [preset, strength, auraMode, auraColor, auraSize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!enabled || !canvas) return;
    let cancelled = false;
    let renderFailed = false;
    let tracker: FaceLandmarker | undefined;
    let segmenter: ImageSegmenter | undefined;
    let bodyMask: PersonMask | undefined;
    let loadingSegmenter = false;
    let segmenterFailed = false;
    let lastSegmentation = -Infinity;
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
      segmenter?.close();
      segmenter = undefined;
      bodyMask = undefined;
      renderer?.dispose();
      renderer = undefined;
    }
    function fallback() {
      renderFailed = true;
      dispose();
      if (!cancelled) {
        setVisible(false);
        report("Face filter unavailable — original camera is still live. Switch to Original and back to retry.");
      }
    }

    async function boot() {
      report("Loading face tracking…");
      try {
        const { FaceLandmarker, FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
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

        async function loadBodyTracker() {
          loadingSegmenter = true;
          try {
            const created = await ImageSegmenter.createFromOptions(files, {
              baseOptions: { modelAssetPath: "/face-assets/selfie_segmenter.tflite", delegate: "CPU" },
              runningMode: "VIDEO",
              outputConfidenceMasks: true,
              outputCategoryMask: false,
            });
            if (cancelled || renderFailed) {
              created.close();
              return;
            }
            segmenter = created;
          } catch {
            segmenterFailed = true;
          } finally {
            loadingSegmenter = false;
          }
        }

        const render = (time: number) => {
          if (cancelled || renderFailed) return;
          try {
            const video = videoRef.current;
            if (video && video.readyState >= 2 && video.videoWidth > 0) {
              if (video.currentTime !== lastVideoTime) {
                lastVideoTime = video.currentTime;
                const { preset, strength, auraMode, auraColor, auraSize } = settings.current;
                // ponytail: synchronous tracking capped at 20 fps; move to a worker if it stalls slower devices.
                if ((preset !== "original" || auraMode === "clouds") && time - lastDetection >= 50) {
                  const points = tracker!.detectForVideo(video, time).faceLandmarks[0];
                  const alpha = Math.min(1, 1 - Math.exp(-(time - lastDetection) / 65));
                  smooth = points?.map((point, i) => ({
                    x: smooth ? smooth[i].x + (point.x - smooth[i].x) * alpha : point.x,
                    y: smooth ? smooth[i].y + (point.y - smooth[i].y) * alpha : point.y,
                  }));
                  lastDetection = time;
                }
                if (auraMode !== "off") {
                  if (!segmenter && !loadingSegmenter && !segmenterFailed) void loadBodyTracker();
                  // ponytail: CPU segmentation capped near 12 fps; use a worker if slower devices stutter.
                  if (segmenter && time - lastSegmentation >= 80) {
                    try {
                      segmenter.segmentForVideo(video, time, (result) => {
                        const mask = result.confidenceMasks?.[0];
                        bodyMask = mask
                          ? personMaskFromConfidence(mask.getAsFloat32Array(), mask.width, mask.height)
                          : undefined;
                      });
                      lastSegmentation = time;
                    } catch {
                      bodyMask = undefined;
                      segmenter.close();
                      segmenter = undefined;
                      segmenterFailed = true;
                    }
                  }
                } else {
                  bodyMask = undefined;
                  segmenterFailed = false;
                }
                report(
                  auraMode !== "off"
                    ? segmenterFailed
                      ? "Aura unavailable — camera stays live"
                      : bodyMask
                        ? auraMode === "fire"
                          ? "Body silhouette tracked · Fire aura active"
                          : smooth
                            ? "Head tracked · Cloud aura active"
                            : "No face detected — clouds paused"
                        : "Loading body silhouette…"
                    : smooth
                      ? "Face tracked · Local filter active"
                      : "No face detected — showing original camera",
                );
                renderer!.draw(
                  video,
                  smooth ? buildFaceWarps(smooth, preset) : [],
                  strength,
                  auraMode !== "off" && bodyMask
                    ? {
                        mode: auraMode,
                        points: smooth ?? [],
                        mask: bodyMask,
                        color: auraColor,
                        time,
                        size: auraSize,
                      }
                    : undefined,
                );
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

  return (
    <canvas
      ref={canvasRef}
      className="nt-face-warp"
      hidden={!enabled || !visible}
      aria-label="Live face effects preview"
    />
  );
}
