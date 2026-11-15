"use client";

import { API_BASE, type ScanResponse } from "@/lib/api";
import { useDraggable } from "@/hooks/useDraggable";

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
        <span>{v}</span>
      </div>
      <div className="nt-metric__track">
        <div className="nt-metric__fill" style={{ width: `${v}%` }} />
      </div>
    </div>
  );
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
  if (!grade) return null;

  const name =
    person?.display_name && person.display_name !== "Unknown"
      ? person.display_name
      : "Unknown Subject";

  const photoSrc = person?.photoUrl
    ? person.photoUrl.startsWith("http")
      ? person.photoUrl
      : `${API_BASE}${person.photoUrl}`
    : captureUrl || null;

  const tags = grade.vibe_tags?.length ? grade.vibe_tags : grade.signals.slice(0, 4);
  const strengths = grade.strengths?.length ? grade.strengths : ["Still compiling…"];
  const flags = grade.red_flags?.length ? grade.red_flags : ["Insufficient intel"];
  const metrics = grade.metrics ?? {
    authenticity: 50,
    linkedin_density: 40,
    main_character: 50,
    corporate: 40,
  };

  return (
    <div
      className="window nt-report-window"
      role="dialog"
      aria-label="Aura Report"
      style={{ ...drag.style, zIndex }}
      onPointerDownCapture={onActivate}
    >
      <div className="title-bar nt-drag-bar" onPointerDown={drag.onPointerDown}>
        <div className="title-bar-text">Aura Report - [{grade.label}]</div>
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
              <img src={photoSrc} alt={name} />
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
            <div className="nt-report-score">
              {grade.label} · {grade.score}/100
            </div>
          </div>
        </div>

        <div className="nt-report-field">
          <div className="nt-report-label">Summary</div>
          <p>{grade.summary ?? grade.roast}</p>
        </div>

        <div className="nt-report-field">
          <div className="nt-report-label">One-liner</div>
          <p className="nt-report-oneliner">{grade.one_liner ?? grade.roast}</p>
        </div>

        <div className="nt-report-field">
          <div className="nt-report-label">Hard truth</div>
          <p>{grade.roast}</p>
        </div>

        <div className="nt-report-split">
          <div className="nt-report-field">
            <div className="nt-report-label">Strengths</div>
            <ul>
              {strengths.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
          <div className="nt-report-field">
            <div className="nt-report-label">Red flags</div>
            <ul>
              {flags.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="nt-report-field">
          <div className="nt-report-label">Career read</div>
          <p>{grade.career_read}</p>
        </div>

        <div className="nt-report-field">
          <div className="nt-report-label">Hackathon fit</div>
          <p>{grade.compatibility}</p>
        </div>

        <div className="nt-report-field">
          <div className="nt-report-label">Metrics</div>
          <MetricBar label="Authenticity" value={metrics.authenticity} />
          <MetricBar label="LinkedIn density" value={metrics.linkedin_density} />
          <MetricBar label="Main character" value={metrics.main_character} />
          <MetricBar label="Corporate" value={metrics.corporate} />
        </div>

        {tags.length > 0 && (
          <div className="nt-report-field">
            <div className="nt-report-label">Vibe tags</div>
            <div className="nt-report-tags">
              {tags.map((t) => (
                <span key={t} className="nt-report-tag">
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {person?.linkedin_url && (
          <a
            className="nt-report-link"
            href={person.linkedin_url}
            target="_blank"
            rel="noreferrer"
          >
            Open LinkedIn
          </a>
        )}
      </div>
    </div>
  );
}
