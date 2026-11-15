"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CameraPreview, { type CameraPreviewHandle } from "./CameraPreview";
import ReportWindow from "./ReportWindow";
import { useDraggable } from "@/hooks/useDraggable";
import { scanAuraPhoto, type ScanResponse } from "@/lib/api";

export default function CameraWindow() {
  const cameraRef = useRef<CameraPreviewHandle>(null);
  const captureUrlRef = useRef<string | null>(null);
  const drag = useDraggable({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [captureUrl, setCaptureUrl] = useState<string | null>(null);
  const [zCamera, setZCamera] = useState(2);
  const [zReport, setZReport] = useState(4);

  useEffect(() => {
    if (!busy) return;
    setProgress(8);
    const id = window.setInterval(() => {
      setProgress((p) => (p >= 92 ? p : p + Math.max(1, Math.round((92 - p) * 0.08))));
    }, 180);
    return () => window.clearInterval(id);
  }, [busy]);

  useEffect(() => {
    return () => {
      if (captureUrlRef.current) URL.revokeObjectURL(captureUrlRef.current);
    };
  }, []);

  const onStatus = useCallback((status: "loading" | "ready" | "error", detail?: string) => {
    if (status === "error") console.error("[aura] camera", detail);
    else console.log("[aura] camera", status, detail ?? "");
  }, []);

  const scanAura = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setResult(null);
    console.log("[aura] scan: capturing frame");

    try {
      const blob = await cameraRef.current?.captureJpeg();
      if (!blob) {
        throw new Error(
          "No camera frame (black/locked). Close other tabs using the webcam, then retry.",
        );
      }

      if (captureUrlRef.current) URL.revokeObjectURL(captureUrlRef.current);
      const url = URL.createObjectURL(blob);
      captureUrlRef.current = url;
      setCaptureUrl(url);

      cameraRef.current?.freeze();
      console.log("[aura] frame frozen; scanning…", { bytes: blob.size });

      const data = await scanAuraPhoto(blob);
      console.log("[aura] scan result", data);
      setProgress(100);
      setResult(data);
      setZReport(5);
      setZCamera(2);
    } catch (err) {
      console.error("[aura] scan failed", err);
      setResult({
        matched: false,
        matchSource: "none",
        message: err instanceof Error ? err.message : "Scan failed",
      });
    } finally {
      cameraRef.current?.unfreeze();
      setBusy(false);
    }
  }, [busy]);

  return (
    <div className="nt-workspace">
      <div
        className="window nt-camera-window"
        role="dialog"
        aria-label="Aura Scanner"
        style={{ ...drag.style, zIndex: zCamera }}
        onPointerDownCapture={() => {
          setZCamera(5);
          setZReport(3);
        }}
      >
        <div className="title-bar nt-drag-bar" onPointerDown={drag.onPointerDown}>
          <div className="title-bar-text">Aura Scanner - [Live Camera]</div>
          <div className="title-bar-controls">
            <button type="button" aria-label="Minimize" />
            <button type="button" aria-label="Maximize" />
            <button type="button" aria-label="Close" />
          </div>
        </div>

        <div className="window-body">
          <div className="sunken-panel nt-camera-well">
            <CameraPreview
              ref={cameraRef}
              onStatus={onStatus}
              auraScore={result?.grade?.score ?? null}
            />
            {busy && (
              <div className="nt-pixel-scan" aria-hidden>
                <div className="nt-pixel-scan__grid" />
                <div className="nt-pixel-scan__beam" />
                <div className="nt-pixel-scan__noise" />
                <div className="nt-pixel-scan__label">SCANNING…</div>
              </div>
            )}
          </div>

          <div className="nt-toolbar">
            <button
              type="button"
              className="default nt-scan-btn"
              disabled={busy}
              onClick={() => void scanAura()}
            >
              {busy ? "Scanning…" : "Scan Aura"}
            </button>
          </div>

          {busy && (
            <div className="nt-scan-progress" aria-hidden>
              <div className="progress-indicator segmented">
                <span
                  className="progress-indicator-bar"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {result && !result.grade && result.message && (
            <div className="nt-scan-result">
              <strong>Scan failed</strong>
              <p>{result.message}</p>
            </div>
          )}
        </div>
      </div>

      {result?.grade && (
        <ReportWindow
          result={result}
          captureUrl={captureUrl}
          zIndex={zReport}
          onActivate={() => {
            setZReport(5);
            setZCamera(2);
          }}
          onClose={() => setResult(null)}
        />
      )}
    </div>
  );
}
