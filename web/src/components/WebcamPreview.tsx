"use client";

import { useEffect, useRef } from "react";
import FaceWarpLayer from "./FaceWarpLayer";
import type { FacePreset } from "@/lib/faceWarp";
import type { AuraMode } from "@/lib/fireAura";

type Props = {
  active: boolean;
  filter: FacePreset;
  strength: number;
  auraMode: AuraMode;
  auraColor: string;
  auraSize: number;
  onTracking: (message: string) => void;
  onStatus: (status: "loading" | "ready" | "error", detail?: string) => void;
};

export default function WebcamPreview({ active, filter, strength, auraMode, auraColor, auraSize, onStatus, onTracking }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!active || !video) return;

    let cancelled = false;
    let stream: MediaStream | undefined;

    function release() {
      stream?.getTracks().forEach((track) => track.stop());
      if (video && video.srcObject === stream) video.srcObject = null;
    }

    async function start() {
      if (!video) return;
      onStatus("loading", "Opening camera — allow access if prompted…");
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera access requires HTTPS or localhost and a supported browser.");
        }
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: "user",
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
        });
        if (cancelled) return release();
        video.srcObject = stream;
        await video.play();
        if (cancelled) return release();
        stream.getVideoTracks()[0]?.addEventListener("ended", () => {
          release();
          if (!cancelled) onStatus("error", "Camera disconnected. Reconnect it and retry.");
        }, { once: true });
        onStatus("ready");
      } catch (error) {
        release();
        if (cancelled) return;
        const name = error instanceof DOMException ? error.name : "";
        const message = name === "NotAllowedError"
          ? "Camera permission denied. Allow camera access for this site, then retry."
          : name === "NotFoundError"
            ? "No camera found. Connect a webcam and retry."
            : name === "NotReadableError"
              ? "Camera is unavailable. Close other apps using it, then retry."
              : error instanceof Error ? error.message : "Could not open the camera. Please retry.";
        onStatus("error", message);
      }
    }

    void start();
    return () => {
      cancelled = true;
      release();
    };
  }, [active, onStatus]);

  return (
    <div className="nt-webcam-stage">
      <video ref={videoRef} className="nt-webcam-video" playsInline muted autoPlay aria-label="Live webcam preview" />
      <FaceWarpLayer key={active && (filter !== "original" || auraMode !== "off") ? "on" : "off"} videoRef={videoRef} active={active} preset={filter} strength={strength} auraMode={auraMode} auraColor={auraColor} auraSize={auraSize} onTracking={onTracking} />
    </div>
  );
}
