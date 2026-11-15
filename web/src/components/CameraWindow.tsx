"use client";

import { useCallback, useState } from "react";
import ChadMorphFilter from "./ChadMorphFilter";

type FilterStatus = "idle" | "loading" | "ready" | "error";

export default function CameraWindow() {
  const [running, setRunning] = useState(true);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("idle");
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  const onStatus = useCallback((status: "loading" | "ready" | "error", detail?: string) => {
    setFilterStatus(status);
    setErrorDetail(detail ?? null);
  }, []);

  return (
    <div className="window nt-camera-window" role="dialog" aria-label="Aura Scanner">
      <div className="title-bar">
        <div className="title-bar-text">Aura Scanner - [Chad Morph Filter]</div>
        <div className="title-bar-controls">
          <button type="button" aria-label="Minimize" />
          <button type="button" aria-label="Maximize" />
          <button type="button" aria-label="Close" onClick={() => setRunning(false)} />
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
          {running ? (
            <ChadMorphFilter active={running} onStatus={onStatus} />
          ) : (
            <div className="nt-camera-well__placeholder">
              <p>Camera stopped.</p>
            </div>
          )}
          {running && filterStatus === "loading" && (
            <div className="nt-camera-well__badge">Loading OpenMakeup morph…</div>
          )}
          {running && filterStatus === "error" && (
            <div className="nt-camera-well__badge">
              Filter error{errorDetail ? `: ${errorDetail}` : ""}
            </div>
          )}
          {running && filterStatus === "ready" && (
            <div className="nt-camera-well__badge">Live Chad morph (your face)</div>
          )}
        </div>

        <div className="nt-toolbar">
          {running ? (
            <button type="button" onClick={() => setRunning(false)}>
              Stop
            </button>
          ) : (
            <button
              type="button"
              className="default"
              onClick={() => {
                setFilterStatus("idle");
                setRunning(true);
              }}
            >
              Start Camera
            </button>
          )}
        </div>
      </div>

      <div className="status-bar">
        <p className="status-bar-field">
          {running
            ? filterStatus === "ready"
              ? "OpenMakeupSDK reshape · MediaPipe FaceMesh"
              : filterStatus === "loading"
                ? "Initializing morph engine…"
                : filterStatus === "error"
                  ? "Error"
                  : "Starting…"
            : "Ready"}
        </p>
        <p className="status-bar-field" style={{ flexGrow: 0, width: 120, textAlign: "center" }}>
          {running && filterStatus === "ready" ? "Mog ON" : "—"}
        </p>
      </div>
    </div>
  );
}
