"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type CameraState = "idle" | "starting" | "live" | "error";

export default function CameraWindow() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>("idle");
  const [error, setError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setState("idle");
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    setState("starting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setState("live");
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Camera permission denied."
          : "Could not open camera.";
      setError(message);
      setState("error");
    }
  }, []);

  useEffect(() => {
    void startCamera();
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [startCamera]);

  return (
    <div className="window nt-camera-window" role="dialog" aria-label="Aura Scanner">
      <div className="title-bar">
        <div className="title-bar-text">Aura Scanner - [Camera]</div>
        <div className="title-bar-controls">
          <button type="button" aria-label="Minimize" />
          <button type="button" aria-label="Maximize" />
          <button type="button" aria-label="Close" onClick={stopCamera} />
        </div>
      </div>

      <div className="nt-menubar" role="menubar">
        <button type="button" role="menuitem">
          <u>F</u>ile
        </button>
        <button type="button" role="menuitem">
          <u>E</u>dit
        </button>
        <button type="button" role="menuitem">
          <u>V</u>iew
        </button>
        <button type="button" role="menuitem">
          <u>H</u>elp
        </button>
      </div>

      <div className="window-body">
        <div className="sunken-panel nt-camera-well">
          <video ref={videoRef} playsInline muted autoPlay />
          {state !== "live" && (
            <div className="nt-camera-well__placeholder">
              {state === "starting" && <p>Starting Capture Driver...</p>}
              {state === "idle" && <p>Camera stopped.</p>}
              {state === "error" && (
                <>
                  <p>{error}</p>
                  <button type="button" onClick={() => void startCamera()}>
                    Retry
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="nt-toolbar">
          {state === "live" ? (
            <button type="button" onClick={stopCamera}>
              Stop
            </button>
          ) : (
            <button type="button" className="default" onClick={() => void startCamera()}>
              Start Camera
            </button>
          )}
        </div>
      </div>

      <div className="status-bar">
        <p className="status-bar-field">
          {state === "live"
            ? "Video Source: WDM Camera"
            : state === "starting"
              ? "Initializing..."
              : state === "error"
                ? "Error"
                : "Ready"}
        </p>
        <p className="status-bar-field" style={{ flexGrow: 0, width: 90, textAlign: "center" }}>
          {state === "live" ? "640 x 480" : "—"}
        </p>
      </div>
    </div>
  );
}
