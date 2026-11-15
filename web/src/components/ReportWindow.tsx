"use client";

import { useState } from "react";
import { API_BASE, type ScanResponse } from "@/lib/api";
import { useDraggable } from "@/hooks/useDraggable";
import SellDataTerminal from "./SellDataTerminal";

type Props = {
  result: ScanResponse;
  captureUrl?: string | null;
  zIndex?: number;
  onActivate?: () => void;
  onClose?: () => void;
};

function MetricBar({ label, value }: { label: string; value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="nt-metric">
      <div className="nt-metric__row">
        <span>{label}</span>
        <span className="nt-metric__value">{v}</span>
      </div>
      <div className="nt-metric__track">
        <div className="nt-metric__fill" style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

function sourceLabel(source?: string) {
  switch (source) {
    case "judges_db":
    case "judges_db_soft":
      return "Gallery match";
    case "web_identity":
      return "Web identity";
    case "camera_only":
      return "Camera only";
    default:
      return source || "Unknown";
  }
}

export default function ReportWindow({
  result,
  captureUrl,
  zIndex = 4,
  onActivate,
  onClose,
}: Props) {
  const grade = result.grade;
  const person = result.person;
  const drag = useDraggable({ x: 0, y: 0 });
  const [sellOpen, setSellOpen] = useState(false);
  if (!grade) return null;

  const name =
    person?.display_name && person.display_name !== "Unknown"
      ? person.display_name
      : "Unknown Subject";

  const cameraOnly = result.matchSource === "camera_only";
  const photoSrc = person?.photoUrl
    ? person.photoUrl.startsWith("http")
      ? person.photoUrl
      : `${API_BASE}${person.photoUrl}`
    : cameraOnly
      ? captureUrl || null
      : null;

  const tags = grade.vibe_tags?.length ? grade.vibe_tags : grade.signals.slice(0, 4);
  const strengths = grade.strengths?.length ? grade.strengths : ["Still compiling…"];
  const flags = grade.red_flags?.length ? grade.red_flags : ["Insufficient intel"];
  const metrics = grade.metrics ?? {
    authenticity: 50,
    linkedin_density: 40,
    main_character: 50,
    corporate: 40,
  };
  const confidencePct = Math.round((grade.confidence ?? 0) * 100);

  return (
    <div
      className="window nt-report-window"
      role="dialog"
      aria-label="Aura Report"
      style={{ ...drag.style, zIndex }}
      onPointerDownCapture={onActivate}
    >
      <div className="title-bar nt-drag-bar" onPointerDown={drag.onPointerDown}>
        <div className="title-bar-text">Aura Report — {grade.label}</div>
        <div className="title-bar-controls">
          <button type="button" aria-label="Minimize" />
          <button type="button" aria-label="Maximize" />
          <button type="button" aria-label="Close" onClick={onClose} />
        </div>
      </div>

      <div className="window-body nt-report-body">
        <div className="nt-report-header">
          <div className="nt-report-avatar">
            {photoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoSrc} alt={name} referrerPolicy="no-referrer" />
            ) : (
              <div className="nt-report-avatar__empty">?</div>
            )}
          </div>
          <div className="nt-report-identity">
            <div className="nt-report-name">{name}</div>
            <div className="nt-report-archetype">{grade.archetype ?? "Undefined NPC"}</div>
            {person?.linkedin_headline && (
              <div className="nt-report-headline">{person.linkedin_headline}</div>
            )}
            <div className="nt-report-meta">
              <span>{sourceLabel(result.matchSource)}</span>
              <span>·</span>
              <span>{confidencePct}% conf.</span>
            </div>
          </div>
          <div className="nt-report-scorebox" title={`${grade.verdict} · ${grade.score}/100`}>
            <div className="nt-report-scorebox__num">{grade.score}</div>
            <div className="nt-report-scorebox__label">{grade.label}</div>
          </div>
        </div>

        {(grade.one_liner || grade.roast) && (
          <div className="nt-report-banner">{grade.one_liner ?? grade.roast}</div>
        )}

        <fieldset className="nt-report-section">
          <legend>Who</legend>
          <p>{grade.summary ?? "Subject scanned."}</p>
        </fieldset>

        <fieldset className="nt-report-section">
          <legend>Hard truth</legend>
          <p className="nt-report-roast">{grade.roast}</p>
        </fieldset>

        <div className="nt-report-split">
          <fieldset className="nt-report-section">
            <legend>Strengths</legend>
            <ul>
              {strengths.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </fieldset>
          <fieldset className="nt-report-section">
            <legend>Red flags</legend>
            <ul>
              {flags.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </fieldset>
        </div>

        <fieldset className="nt-report-section">
          <legend>Career read</legend>
          <p>{grade.career_read}</p>
        </fieldset>

        <fieldset className="nt-report-section">
          <legend>Metrics</legend>
          <MetricBar label="Authenticity" value={metrics.authenticity} />
          <MetricBar label="LinkedIn density" value={metrics.linkedin_density} />
          <MetricBar label="Main character" value={metrics.main_character} />
          <MetricBar label="Corporate" value={metrics.corporate} />
        </fieldset>

        {tags.length > 0 && (
          <fieldset className="nt-report-section">
            <legend>Vibe</legend>
            <div className="nt-report-tags">
              {tags.map((t) => (
                <span key={t} className="nt-report-tag">
                  {t}
                </span>
              ))}
            </div>
          </fieldset>
        )}

        {person?.linkedin_url && (
          <a
            className="nt-report-link"
            href={person.linkedin_url}
            target="_blank"
            rel="noreferrer"
          >
            Open LinkedIn profile →
          </a>
        )}
      </div>

      <div className="nt-report-footer">
        <button
          type="button"
          className="default nt-sell-btn"
          onClick={() => setSellOpen(true)}
        >
          Sell Data
        </button>
      </div>

      {sellOpen && (
        <SellDataTerminal
          subjectName={name}
          zIndex={(zIndex ?? 4) + 10}
          onActivate={onActivate}
          onClose={() => setSellOpen(false)}
        />
      )}
    </div>
  );
}
