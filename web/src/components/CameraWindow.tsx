"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import CameraPreview, { type CameraPreviewHandle } from "./CameraPreview";
import ReportWindow from "./ReportWindow";
import { useDraggable } from "@/hooks/useDraggable";
import { scanAuraPhoto, type ScanResponse } from "@/lib/api";

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

function memeForScore(
  score: number,
  lastLow: { current: number | null },
  lastMid: { current: number | null },
  lastMidHigh: { current: number | null },
  lastHigh: { current: number | null },
): ReactionMeme {
  if (score >= 76) return pickDifferentMeme(HIGH_AURA_MEMES, lastHigh);
  if (score >= 51) return pickDifferentMeme(MID_HIGH_AURA_MEMES, lastMidHigh);
  if (score >= 26) return pickDifferentMeme(MID_AURA_MEMES, lastMid);
  return pickDifferentMeme(LOW_AURA_MEMES, lastLow);
}

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
  const [popupMeme, setPopupMeme] = useState<ReactionMeme | null>(null);
  const [popupScore, setPopupScore] = useState<number | null>(null);
  const lastLowPopupIndex = useRef<number | null>(null);
  const lastMidPopupIndex = useRef<number | null>(null);
  const lastMidHighPopupIndex = useRef<number | null>(null);
  const lastHighPopupIndex = useRef<number | null>(null);

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

  useEffect(() => {
    if (!popupMeme) return;
    const timeoutId = window.setTimeout(() => {
      setPopupMeme(null);
      setPopupScore(null);
    }, 3000);
    return () => window.clearTimeout(timeoutId);
  }, [popupMeme]);

  const clearPopup = useCallback(() => {
    setPopupMeme(null);
    setPopupScore(null);
  }, []);

  const onStatus = useCallback((status: "loading" | "ready" | "error", detail?: string) => {
    if (status === "error") console.error("[aura] camera", detail);
    else console.log("[aura] camera", status, detail ?? "");
  }, []);

  const scanAura = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setResult(null);
    clearPopup();
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

      const score = data.grade?.score;
      if (typeof score === "number") {
        setPopupScore(score);
        setPopupMeme(
          memeForScore(
            score,
            lastLowPopupIndex,
            lastMidPopupIndex,
            lastMidHighPopupIndex,
            lastHighPopupIndex,
          ),
        );
      }
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
  }, [busy, clearPopup]);

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

      {popupMeme && popupScore !== null && (
        <div
          className="nt-meme-popup"
          role="status"
          aria-label={`Aura score ${popupScore} reaction`}
        >
          <div className="nt-meme-popup__card">
            <button
              type="button"
              className="nt-meme-popup__close"
              aria-label="Close reaction"
              onClick={clearPopup}
            >
              ×
            </button>
            <strong>{popupScore}</strong>
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
    </div>
  );
}
