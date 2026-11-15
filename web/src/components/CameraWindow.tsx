"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import WebcamPreview from "./WebcamPreview";
import type { FacePreset } from "@/lib/faceWarp";
import type { AuraMode } from "@/lib/fireAura";
import { scoreToFaceFilter } from "@/lib/scoreToFaceFilter";

type FilterStatus = "idle" | "loading" | "ready" | "error";
type ScanPhase = "idle" | "scanning" | "done";
type ReactionMeme = { src: string; alt: string; width: number; height: number };

const LOW_AURA_MEMES: ReactionMeme[] = [
  { src: "/reactions/0-25/disgusted-cat.png", alt: "A disgusted cat", width: 300, height: 300 },
  { src: "/reactions/0-25/giphy.gif", alt: "A man reacting emotionally", width: 320, height: 222 },
  { src: "/reactions/0-25/ishowspeed-meme.gif", alt: "A shocked reaction", width: 360, height: 275 },
  { src: "/reactions/0-25/koloboks-yellow-emojis.gif", alt: "Two surprised yellow emoji characters", width: 200, height: 142 },
  { src: "/reactions/0-25/vigilanteskass.gif", alt: "A serious-looking man", width: 320, height: 320 },
];

const MID_AURA_MEMES: ReactionMeme[] = [
  { src: "/reactions/26-50/bearded-reaction.gif", alt: "A bearded man looking upward", width: 220, height: 208 },
  { src: "/reactions/26-50/surprised-dog.gif", alt: "A surprised-looking dog", width: 640, height: 544 },
  { src: "/reactions/26-50/cat-reaction.gif", alt: "A cat reaction", width: 220, height: 220 },
  { src: "/reactions/26-50/giphy.gif", alt: "A man reacting emotionally", width: 320, height: 222 },
  { src: "/reactions/26-50/mr-bean.gif", alt: "Mr. Bean reacting", width: 350, height: 350 },
];

const MID_HIGH_AURA_MEMES: ReactionMeme[] = [
  { src: "/reactions/51-75/cat-dance.gif", alt: "A dancing cat", width: 220, height: 211 },
  { src: "/reactions/51-75/cat-clap.gif", alt: "A clapping cat", width: 165, height: 216 },
  { src: "/reactions/51-75/head-point.gif", alt: "A person pointing", width: 640, height: 538 },
  { src: "/reactions/51-75/shoulder-dance.gif", alt: "A person dancing with their shoulders", width: 354, height: 324 },
  { src: "/reactions/51-75/shrek.gif", alt: "Shrek in a dramatic scene", width: 220, height: 247 },
];

const HIGH_AURA_MEMES: ReactionMeme[] = [
  { src: "/reactions/76-100/pixel-character-dance.gif", alt: "A pixel-art character dancing", width: 500, height: 500 },
  { src: "/reactions/76-100/boat-aura-farming.gif", alt: "A man aura farming on a boat", width: 220, height: 194 },
  { src: "/reactions/76-100/goofy-baby.gif", alt: "A goofy baby", width: 360, height: 360 },
  { src: "/reactions/76-100/ishowspeed-award.gif", alt: "iShowSpeed holding an award", width: 498, height: 498 },
  { src: "/reactions/76-100/sonic-meme.gif", alt: "Sonic the Hedgehog", width: 320, height: 320 },
  { src: "/reactions/76-100/suit-reveal.gif", alt: "A man in a suit making a confident entrance", width: 220, height: 293 },
];

function pickDifferentMeme(
  memes: readonly ReactionMeme[],
  lastIndex: { current: number | null },
): ReactionMeme {
  const indexes = memes.map((_, index) => index);
  if (indexes.length === 0) throw new Error("Reaction meme pools must not be empty.");
  const candidates = indexes.filter((index) => index !== lastIndex.current);
  const choices = candidates.length > 0 ? candidates : indexes;
  const nextIndex = choices[Math.floor(Math.random() * choices.length)];
  if (nextIndex === undefined) throw new Error("Could not select a reaction meme.");
  lastIndex.current = nextIndex;
  return memes[nextIndex];
}

export default function CameraWindow() {
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("idle");
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [scanPhase, setScanPhase] = useState<ScanPhase>("idle");
  const [scanLabel, setScanLabel] = useState("Ready to scan");
  const [previewKey, setPreviewKey] = useState(0);
  const [cameraOn, setCameraOn] = useState(true);
  const [filter, setFilter] = useState<FacePreset>("original");
  const [strength, setStrength] = useState(0.75);
  const [demoScore, setDemoScore] = useState(60);
  const [auraMode, setAuraMode] = useState<AuraMode>("off");
  const [auraColors, setAuraColors] = useState({ fire: "#ff6500", clouds: "#8ca64a" });
  const auraColor = auraColors[auraMode === "clouds" ? "clouds" : "fire"];
  const [auraSize, setAuraSize] = useState(1.6);
  const [trackingMessage, setTrackingMessage] = useState("Loading face tracking…");
  const [popupMeme, setPopupMeme] = useState<ReactionMeme | null>(null);
  const [popupScore, setPopupScore] = useState<number | null>(null);
  const onTracking = useCallback((message: string) => setTrackingMessage(message), []);
  const scanTimer = useRef<number | null>(null);
  const lastLowPopupIndex = useRef<number | null>(null);
  const lastMidPopupIndex = useRef<number | null>(null);
  const lastMidHighPopupIndex = useRef<number | null>(null);
  const lastHighPopupIndex = useRef<number | null>(null);

  useEffect(() => () => {
    if (scanTimer.current) clearInterval(scanTimer.current);
  }, []);

  useEffect(() => {
    if (!popupMeme) return;
    const timeoutId = window.setTimeout(() => {
      setPopupMeme(null);
      setPopupScore(null);
    }, 3000);
    return () => window.clearTimeout(timeoutId);
  }, [popupMeme]);

  const stopCamera = useCallback(() => {
    if (scanTimer.current) clearInterval(scanTimer.current);
    setCameraOn(false);
    setFilterStatus("idle");
    setErrorDetail(null);
    setScanPhase("idle");
  }, []);

  const onStatus = useCallback((status: "loading" | "ready" | "error", detail?: string) => {
    setFilterStatus(status);
    setErrorDetail(detail ?? null);
  }, []);

  const scanAura = useCallback(() => {
    if (filterStatus !== "ready" || scanPhase === "scanning") return;

    setPopupMeme(null);
    setPopupScore(null);
    setScanPhase("scanning");
    const steps = [
      "Starting demo scan…",
      "Calibrating aura…",
      "Adding dramatic suspense…",
      "Preparing demo result…",
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
      const output = scoreToFaceFilter(demoScore);
      setFilter(output.preset);
      setStrength(output.strength);
      setAuraMode(output.aura);
      if (filter === "original" && auraMode === "off") setTrackingMessage("Loading face tracking…");
      setScanLabel(`Demo score ${output.score}/100 · ${output.preset === "mog" ? "Mog + Fire" : "Not Mog + Fart clouds"} ${Math.round(output.strength * 100)}%`);
      setPopupScore(output.score);
      if (output.score >= 76) {
        setPopupMeme(pickDifferentMeme(HIGH_AURA_MEMES, lastHighPopupIndex));
      } else if (output.score >= 51) {
        setPopupMeme(pickDifferentMeme(MID_HIGH_AURA_MEMES, lastMidHighPopupIndex));
      } else if (output.score >= 26) {
        setPopupMeme(pickDifferentMeme(MID_AURA_MEMES, lastMidPopupIndex));
      } else {
        setPopupMeme(pickDifferentMeme(LOW_AURA_MEMES, lastLowPopupIndex));
      }
      setScanPhase("done");
    }, 700);
    scanTimer.current = id;
  }, [filterStatus, scanPhase, demoScore, filter, auraMode]);

  return (
    <div className="window nt-camera-window" role="dialog" aria-label="Aura Scanner">
      <div className="title-bar">
        <div className="title-bar-text">Aura Scanner - [Live Camera]</div>
        <div className="title-bar-controls">
          <button type="button" aria-label="Minimize" />
          <button type="button" aria-label="Maximize" />
          <button type="button" aria-label="Close" onClick={stopCamera} />
        </div>
      </div>

      {popupMeme && popupScore !== null && (
        <div className="nt-meme-popup" role="dialog" aria-label={`Demo aura score ${popupScore}% reaction`}>
          <div className="nt-meme-popup__card">
            <button
              type="button"
              className="nt-meme-popup__close"
              aria-label="Close reaction"
              onClick={() => {
                setPopupMeme(null);
                setPopupScore(null);
              }}
            >
              ×
            </button>
            <strong>AURA SCORE: {popupScore}% · DEMO</strong>
            <Image
              src={popupMeme.src}
              alt={popupMeme.alt}
              width={popupMeme.width}
              height={popupMeme.height}
              className={popupMeme.src.endsWith(".png") ? "nt-meme-popup__static" : undefined}
              unoptimized
            />
          </div>
        </div>
      )}

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
          <WebcamPreview key={previewKey} active={cameraOn} filter={filter} strength={strength} auraMode={auraMode} auraColor={auraColor} auraSize={auraSize} onStatus={onStatus} onTracking={onTracking} />
          {filterStatus === "idle" && !cameraOn && (
            <div className="nt-camera-well__placeholder">Camera stopped.</div>
          )}
          {filterStatus === "loading" && (
            <div className="nt-camera-well__badge" role="status">{errorDetail ?? "Opening camera…"}</div>
          )}
          {filterStatus === "error" && (
            <div className="nt-camera-well__badge" role="alert">
              {errorDetail ?? "Could not open the camera."}
            </div>
          )}
          {filterStatus === "ready" && scanPhase === "idle" && (
            <div className="nt-camera-well__badge" role="status">{filter === "original" && auraMode === "off" ? "Original camera · Choose a preset below" : trackingMessage}</div>
          )}
          {scanPhase === "scanning" && (
            <div className="nt-camera-well__badge">{scanLabel}</div>
          )}
          {scanPhase === "done" && (
            <div className="nt-camera-well__badge">{scanLabel}</div>
          )}
        </div>

        <div className="nt-toolbar">
          {cameraOn && filterStatus !== "error" ? (
            <button type="button" onClick={stopCamera}>Stop Camera</button>
          ) : (
            <button type="button" onClick={() => {
              setFilterStatus("loading");
              setErrorDetail(null);
              setCameraOn(true);
              setScanPhase("idle");
              setPreviewKey((key) => key + 1);
            }}>
              {filterStatus === "error" ? "Retry Camera" : "Start Camera"}
            </button>
          )}
          <label className="nt-filter-control">
            Filter
            <select aria-label="Camera filter" value={filter} onChange={(event) => {
              setFilter(event.target.value as FacePreset);
              if (filter === "original" && auraMode === "off") setTrackingMessage("Loading face tracking…");
            }}>
              <option value="original">Original</option>
              <option value="mog">Mog</option>
              <option value="not-mog">Not Mog</option>
            </select>
          </label>
          <label className="nt-filter-control">
            Aura
            <select aria-label="Aura effect" value={auraMode} onChange={(event) => {
              setAuraMode(event.target.value as AuraMode);
              if (auraMode === "off" && filter === "original") setTrackingMessage("Loading tracking…");
            }}>
              <option value="off">Off</option>
              <option value="fire">Fire</option>
              <option value="clouds">Fart clouds</option>
            </select>
          </label>
          <label className="nt-filter-control">
            Aura colour
            <input type="color" aria-label="Aura colour" value={auraColor} disabled={auraMode === "off"} onChange={(event) => setAuraColors(previous => ({ ...previous, [auraMode === "clouds" ? "clouds" : "fire"]: event.target.value }))} />
          </label>
          <label className="nt-filter-control">
            Aura size
            <input type="range" aria-label="Aura size" min="50" max="250" value={Math.round(auraSize * 100)} disabled={auraMode === "off"} onChange={(event) => setAuraSize(Number(event.target.value) / 100)} />
            <output>{Math.round(auraSize * 100)}%</output>
          </label>
          <label className="nt-filter-control">
            Strength
            <input type="range" aria-label="Filter strength" min="0" max="100" value={Math.round(strength * 100)} disabled={filter === "original"} onChange={(event) => setStrength(Number(event.target.value) / 100)} />
            <output>{Math.round(strength * 100)}%</output>
          </label>
          <button
            type="button"
            className="default nt-scan-btn"
            disabled={filterStatus !== "ready" || scanPhase === "scanning"}
            onClick={scanAura}
          >
            {scanPhase === "scanning" ? "Scanning…" : "Scan Aura"}
          </button>
          <label className="nt-filter-control">
            Demo score
            <input type="number" aria-label="Demo aura score" min="0" max="100" step="1" value={demoScore} disabled={scanPhase === "scanning"} style={{ width: 55 }} onChange={(event) => {
              const value = event.target.valueAsNumber;
              if (Number.isFinite(value)) setDemoScore(Math.max(0, Math.min(100, value)));
            }} />
          </label>
        </div>
      </div>

      <div className="status-bar">
        <p className="status-bar-field">
          {filterStatus === "ready"
            ? scanPhase === "scanning"
              ? scanLabel
              : "Camera live · Local preview"
            : filterStatus === "loading"
              ? errorDetail ?? "Initializing…"
              : filterStatus === "error"
                ? "Error"
                : cameraOn ? "Opening camera…" : "Camera off"}
        </p>
        <p className="status-bar-field" style={{ flexGrow: 0, width: 110, textAlign: "center" }}>
          {filterStatus === "ready" ? "CAM ON" : "—"}
        </p>
      </div>
    </div>
  );
}
