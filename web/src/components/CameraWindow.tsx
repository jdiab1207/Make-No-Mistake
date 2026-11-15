"use client";

import { useCallback, useState } from "react";
import ChadMorphFilter from "./ChadMorphFilter";

type FilterStatus = "idle" | "loading" | "ready" | "error";
type ScanPhase = "idle" | "scanning" | "done";

export default function CameraWindow() {
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("idle");
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [scanPhase, setScanPhase] = useState<ScanPhase>("idle");
  const [scanLabel, setScanLabel] = useState("Ready to scan");

  const onStatus = useCallback((status: "loading" | "ready" | "error", detail?: string) => {
    setFilterStatus(status);
    setErrorDetail(detail ?? null);
  }, []);

  const scanAura = useCallback(() => {
    if (filterStatus !== "ready" || scanPhase === "scanning") return;

    setScanPhase("scanning");
    const steps = [
      "Locking face mesh…",
      "Checking LinkedIn vibes…",
      "Reading captions…",
      "Measuring jaw mog…",
      "Computing aura…",
    ];

    let i = 0;
    setScanLabel(steps[0]);
    const id = window.setInterval(() => {
      i += 1;
      if (i < steps.length) {
        setScanLabel(steps[i]);
        return;
      }
      window.clearInterval(id);
      setScanLabel("Aura locked — Max Aura adjacent");
      setScanPhase("done");
    }, 700);
  }, [filterStatus, scanPhase]);

  return (
    <div className="window nt-camera-window" role="dialog" aria-label="Aura Scanner">
      <div className="title-bar">
        <div className="title-bar-text">Aura Scanner - [Live Camera]</div>
        <div className="title-bar-controls">
          <button type="button" aria-label="Minimize" />
          <button type="button" aria-label="Maximize" />
          <button type="button" aria-label="Close" />
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
          <ChadMorphFilter onStatus={onStatus} />
          {filterStatus === "loading" && (
            <div className="nt-camera-well__badge">Starting camera + morph…</div>
          )}
          {filterStatus === "error" && (
            <div className="nt-camera-well__badge">
              Filter error{errorDetail ? `: ${errorDetail}` : ""}
            </div>
          )}
          {filterStatus === "ready" && scanPhase === "idle" && (
            <div className="nt-camera-well__badge">Live preview — hit Scan Aura</div>
          )}
          {scanPhase === "scanning" && (
            <div className="nt-camera-well__badge">{scanLabel}</div>
          )}
          {scanPhase === "done" && (
            <div className="nt-camera-well__badge">{scanLabel}</div>
          )}
        </div>

        <div className="nt-toolbar">
          <button
            type="button"
            className="default nt-scan-btn"
            disabled={filterStatus !== "ready" || scanPhase === "scanning"}
            onClick={scanAura}
          >
            {scanPhase === "scanning" ? "Scanning…" : "Scan Aura"}
          </button>
        </div>
      </div>

      <div className="status-bar">
        <p className="status-bar-field">
          {filterStatus === "ready"
            ? scanPhase === "scanning"
              ? scanLabel
              : "Camera live · OpenMakeupSDK Chad morph"
            : filterStatus === "loading"
              ? "Initializing…"
              : filterStatus === "error"
                ? "Error"
                : "Booting…"}
        </p>
        <p className="status-bar-field" style={{ flexGrow: 0, width: 110, textAlign: "center" }}>
          {filterStatus === "ready" ? "CAM ON" : "—"}
        </p>
      </div>
    </div>
  );
}
