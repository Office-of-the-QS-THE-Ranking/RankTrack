"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

/* Deterministic pseudo-random so server and client draw the same diagram. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const ROWS = [
  { label: "THE WUR", n: 7 },
  { label: "THE Impact", n: 12 },
  { label: "THE by Subject", n: 5 },
  { label: "QS WUR", n: 9 },
  { label: "QS Sustainability", n: 11 },
  { label: "QS by Subject", n: 4 },
  { label: "UI GreenMetric", n: 10 },
  { label: "WURI", n: 8 },
];

type Sq = { x: number; y: number; tone: "pale" | "ink" | "gold"; i: number };

function layout(vertical: boolean) {
  const r = rng(vertical ? 415 : 1611);
  const S = vertical ? 10 : 12;
  const squares: Sq[] = [];
  const labels: { x: number; y: number; t: string }[] = [];
  let i = 0;
  if (!vertical) {
    for (let k = 0; k < 64; k++) squares.push({ x: Math.round(8 + r() * 380), y: Math.round(10 + r() * 270), tone: "pale", i: i++ });
    for (let c = 0; c < 22; c++) for (let row = 0; row < 3; row++) squares.push({ x: 450 + c * (S + 6), y: 128 + row * (S + 6), tone: "ink", i: i++ });
    ROWS.forEach((row, k) => {
      const y = 14 + k * 35;
      for (let c = 0; c < row.n; c++) squares.push({ x: 880 + c * (S + 6), y, tone: "gold", i: i++ });
      labels.push({ x: 880 + row.n * (S + 6) + 8, y: y + 11, t: row.label });
    });
  } else {
    for (let k = 0; k < 44; k++) squares.push({ x: Math.round(6 + r() * 290), y: Math.round(6 + r() * 150), tone: "pale", i: i++ });
    for (let rr = 0; rr < 12; rr++) for (let c = 0; c < 3; c++) squares.push({ x: 128 + c * (S + 5), y: 180 + rr * (S + 5), tone: "ink", i: i++ });
    ROWS.forEach((row, k) => {
      const y = 380 + k * 22;
      for (let c = 0; c < row.n; c++) squares.push({ x: 6 + c * (S + 4), y, tone: "gold", i: i++ });
      labels.push({ x: 6 + row.n * (S + 4) + 6, y: y + 9, t: row.label });
    });
  }
  return { squares, labels, S };
}

const H = layout(false);
const V = layout(true);
const FILL = { pale: "var(--n-200)", ink: "var(--ink)", gold: "var(--gold-500)" } as const;

/** Evidence from many units forms one validated record, then counts in every ranking that asks for it. */
export function EvidenceFlow() {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -15% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const svg = (L: typeof H, vertical: boolean) => (
    <svg
      className={`flowart flowart--${vertical ? "v" : "h"}`}
      viewBox={vertical ? "0 0 300 560" : "0 0 1330 300"}
      role="img"
      aria-label="Loose squares stand for evidence arriving from many units; they form one tight validated band, then fan out into eight rows, one for each ranking that reuses the evidence."
    >
      {L.squares.map((s) => (
        <rect
          key={s.i}
          className={`flowart__sq flowart__sq--${s.tone}`}
          x={s.x}
          y={s.y}
          width={L.S}
          height={L.S}
          rx={2}
          fill={FILL[s.tone]}
          style={{ ["--d" as string]: `${s.tone === "pale" ? (s.i % 20) * 18 : s.tone === "ink" ? 380 + (s.i % 30) * 10 : 700 + (s.i % 40) * 9}ms` } as CSSProperties}
        />
      ))}
      {L.labels.map((l) => (
        <text key={l.t} className="flowart__label" x={l.x} y={l.y}>
          {l.t}
        </text>
      ))}
    </svg>
  );

  return (
    <div ref={ref} className={`flowwrap${inView ? " is-in" : ""}`}>
      {svg(H, false)}
      {svg(V, true)}
    </div>
  );
}
