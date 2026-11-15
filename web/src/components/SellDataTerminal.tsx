"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDraggable } from "@/hooks/useDraggable";

type Props = {
  subjectName: string;
  zIndex?: number;
  onActivate?: () => void;
  onClose?: () => void;
};

type SellMeme = { src: string; alt: string; width: number; height: number; caption: string };

const SELL_DATA_MEMES: SellMeme[] = [
  {
    src: "/reactions/76-100/suit-reveal.gif",
    alt: "A man in a suit making a confident entrance",
    width: 220,
    height: 293,
    caption: "CHA-CHING · SOLD",
  },
  {
    src: "/reactions/76-100/boat-aura-farming.gif",
    alt: "A man aura farming on a boat",
    width: 220,
    height: 194,
    caption: "BUYER: CCP ✓",
  },
  {
    src: "/reactions/76-100/goofy-baby.gif",
    alt: "A goofy baby",
    width: 360,
    height: 360,
    caption: "PRIVACY? NEVER HEARD OF HER",
  },
  {
    src: "/reactions/76-100/ishowspeed-award.gif",
    alt: "iShowSpeed holding an award",
    width: 498,
    height: 498,
    caption: "¥¥¥ SECURED",
  },
  {
    src: "/reactions/26-50/mr-bean.gif",
    alt: "Mr. Bean reacting",
    width: 350,
    height: 350,
    caption: "ETHICS.exe STOPPED",
  },
  {
    src: "/reactions/51-75/shrek.gif",
    alt: "Shrek in a dramatic scene",
    width: 220,
    height: 247,
    caption: "PAYLOAD DELIVERED",
  },
  {
    src: "/reactions/51-75/cat-clap.gif",
    alt: "A clapping cat",
    width: 165,
    height: 216,
    caption: "SHAREHOLDERS APPLAUD",
  },
];

function pickSellMeme(lastIndex: { current: number | null }): SellMeme {
  const indexes = SELL_DATA_MEMES.map((_, index) => index);
  const candidates = indexes.filter((index) => index !== lastIndex.current);
  const choices = candidates.length > 0 ? candidates : indexes;
  const nextIndex = choices[Math.floor(Math.random() * choices.length)]!;
  lastIndex.current = nextIndex;
  return SELL_DATA_MEMES[nextIndex]!;
}

const BOOT_LINES = [
  "> aura-exfil.exe --mode=greed --confirm=y",
  "> mounting encrypted packet bus…",
  "> stripping PII wrappers…",
  "> hashing face embedding → 0xDEADBEEF",
  "> negotiating TLS with mystery.buyer.cn …",
  "> handshake OK (definitely legitimate)",
  "> compressing LinkedIn aura blob…",
  "> uploading ████████████████ 100%",
  "> routing via 14 hops / 3 shell companies…",
  "> ACK received. invoice: ¥¥¥¥¥",
];

const ASCII_BANNER = `
 ███████╗███████╗███╗   ██╗████████╗
 ██╔════╝██╔════╝████╗  ██║╚══██╔══╝
 ███████╗█████╗  ██╔██╗ ██║   ██║
 ╚════██║██╔══╝  ██║╚██╗██║   ██║
 ███████║███████╗██║ ╚████║   ██║
 ╚══════╝╚══════╝╚═╝  ╚═══╝   ╚═╝

 ████████╗ ██████╗
 ╚══██╔══╝██╔═══██╗
    ██║   ██║   ██║
    ██║   ██║   ██║
    ██║   ╚██████╔╝
    ╚═╝    ╚═════╝

  ██████╗██╗  ██╗██╗███╗   ██╗ █████╗
 ██╔════╝██║  ██║██║████╗  ██║██╔══██╗
 ██║     ███████║██║██╔██╗ ██║███████║
 ██║     ██╔══██║██║██║╚██╗██║██╔══██║
 ╚██████╗██║  ██║██║██║ ╚████║██║  ██║
  ╚═════╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝
`.trim();

function randomHex(len = 8) {
  let s = "";
  for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

export default function SellDataTerminal({
  subjectName,
  zIndex = 20,
  onActivate,
  onClose,
}: Props) {
  const drag = useDraggable({ x: 0, y: 24 });
  const [lines, setLines] = useState<string[]>([]);
  const [showAscii, setShowAscii] = useState(false);
  const [done, setDone] = useState(false);
  const [glitch, setGlitch] = useState(false);
  const [sellMeme, setSellMeme] = useState<SellMeme | null>(null);
  const lastSellMemeIndex = useRef<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const rain = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        id: i,
        left: `${(i * 37) % 100}%`,
        delay: `${(i % 7) * 0.18}s`,
        duration: `${1.4 + (i % 5) * 0.35}s`,
        chars: Array.from({ length: 14 }, () => randomHex(1)).join("\n"),
      })),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    let i = 0;

    const kick = () => {
      if (cancelled) return;
      if (i < BOOT_LINES.length) {
        const step = i;
        const line = BOOT_LINES[step];
        const extra =
          step === 3
            ? `> subject="${subjectName}"  packet=${randomHex(12)}`
            : step === 5
              ? `> tunnel ${randomHex(4)}:${randomHex(4)} → cn-east-${1 + (step % 3)}`
              : null;
        i += 1;
        setLines((prev) => {
          const next = [...prev];
          if (line) next.push(line);
          if (extra) next.push(extra);
          return next;
        });
        setGlitch(step % 3 === 0);
        window.setTimeout(kick, 280 + Math.random() * 220);
        return;
      }
      setGlitch(true);
      window.setTimeout(() => {
        if (cancelled) return;
        setShowAscii(true);
        setDone(true);
        setGlitch(false);
        setSellMeme(pickSellMeme(lastSellMemeIndex));
      }, 450);
    };

    setLines([`C:\\AURA\\BIN> sell_data --target "${subjectName}"`]);
    const t = window.setTimeout(kick, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [subjectName]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, showAscii]);

  useEffect(() => {
    if (!sellMeme) return;
    const timeoutId = window.setTimeout(() => setSellMeme(null), 3500);
    return () => window.clearTimeout(timeoutId);
  }, [sellMeme]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return createPortal(
    <>
      <div
        className={`window nt-sell-window${glitch ? " nt-sell-window--glitch" : ""}`}
        role="dialog"
        aria-label="Sell Data Terminal"
        style={{ ...drag.style, zIndex }}
        onPointerDownCapture={onActivate}
      >
        <div className="title-bar nt-drag-bar" onPointerDown={drag.onPointerDown}>
          <div className="title-bar-text">C:\AURA\exfil.exe — UNAUTHORIZED</div>
          <div className="title-bar-controls">
            <button type="button" aria-label="Minimize" />
            <button type="button" aria-label="Maximize" />
            <button type="button" aria-label="Close" onClick={onClose} />
          </div>
        </div>

        <div className="window-body nt-sell-body">
          <div className="nt-sell-screen" ref={scroller}>
            <div className="nt-sell-rain" aria-hidden>
              {rain.map((col) => (
                <span
                  key={col.id}
                  className="nt-sell-rain__col"
                  style={{
                    left: col.left,
                    animationDelay: col.delay,
                    animationDuration: col.duration,
                  }}
                >
                  {col.chars}
                </span>
              ))}
            </div>

            <div className="nt-sell-scanline" aria-hidden />

            <pre className="nt-sell-log">
              {lines.map((line, idx) => (
                <div key={`${idx}-${(line ?? "").slice(0, 12)}`}>{line}</div>
              ))}
              {!done && <div className="nt-sell-cursor">█</div>}
            </pre>

            {showAscii && (
              <div className="nt-sell-ascii-wrap">
                <pre className="nt-sell-ascii">{ASCII_BANNER}</pre>
                <div className="nt-sell-ascii-sub">
                  payload delivered · buyer: CCP · refunds: false
                </div>
              </div>
            )}
          </div>

          <div className="nt-sell-footer">
            <button type="button" onClick={onClose}>
              {done ? "Close Terminal" : "Abort (too late)"}
            </button>
          </div>
        </div>
      </div>

      {sellMeme && (
        <div
          className="nt-meme-popup nt-meme-popup--sell"
          role="status"
          aria-label={`Sell data reaction: ${sellMeme.caption}`}
        >
          <div className="nt-meme-popup__card">
            <button
              type="button"
              className="nt-meme-popup__close"
              aria-label="Close reaction"
              onClick={() => setSellMeme(null)}
            >
              ×
            </button>
            <strong>{sellMeme.caption}</strong>
            <Image
              src={sellMeme.src}
              alt={sellMeme.alt}
              width={sellMeme.width}
              height={sellMeme.height}
              unoptimized
            />
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}
