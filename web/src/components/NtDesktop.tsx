"use client";

import { useEffect, useState } from "react";
import CameraWindow from "./CameraWindow";

function formatTrayTime(date: Date) {
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function NtDesktop() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="nt-desktop">
      <div className="nt-desktop-icons" aria-hidden="true">
        <div className="nt-icon" aria-selected="true">
          <div className="nt-icon__glyph">A</div>
          <span className="nt-icon__label">Aura Scanner</span>
        </div>
        <div className="nt-icon">
          <div className="nt-icon__glyph">N</div>
          <span className="nt-icon__label">Network Neighborhood</span>
        </div>
        <div className="nt-icon">
          <div className="nt-icon__glyph">R</div>
          <span className="nt-icon__label">Recycle Bin</span>
        </div>
      </div>

      <div className="nt-desktop__stage">
        <CameraWindow />
      </div>

      <footer className="nt-taskbar">
        <button type="button" className="nt-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="nt-start__logo"
            src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Crect width='7' height='7' fill='%23F60'/%3E%3Crect x='8' width='7' height='7' fill='%239C0'/%3E%3Crect y='8' width='7' height='7' fill='%2309F'/%3E%3Crect x='8' y='8' width='7' height='7' fill='%23FC0'/%3E%3C/svg%3E"
            alt=""
            width={16}
            height={16}
          />
          Start
        </button>
        <div className="nt-taskbar__divider" />
        <button type="button" className="nt-taskbar__window-btn">
          Aura Scanner - [Chad Morph Filter]
        </button>
        <div className="nt-taskbar__tray" title={now ? now.toLocaleString() : undefined}>
          {now ? formatTrayTime(now) : "--:--"}
        </div>
      </footer>
    </div>
  );
}
