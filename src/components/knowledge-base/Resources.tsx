"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import type { Story } from "@/lib/data";
import { Tile } from "@/components/dashboard/Tile";
import { Icon, type IconName } from "@/components/ui/Icon";
import { POLICIES, TEMPLATES, TRAINING, type TrainingKind } from "./content";

const KIND_ICON: Record<TrainingKind, IconName> = { Recorded: "play", Workshop: "users", Guide: "reports" };

function downloadTemplate(file: string, cols: string[]) {
  const url = URL.createObjectURL(new Blob([cols.map((c) => `"${c}"`).join(",") + "\n"], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = file;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A spreadsheet page with a folded corner: its header row, a few rows, and a CSV tag. */
function Sheet({ cols }: { cols: number }) {
  const n = Math.min(cols, 4);
  return (
    <svg viewBox="0 0 64 76" className="kb-sheet" aria-hidden="true">
      <path d="M10 2h34l14 14v54a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4z" className="kb-sheet__page" />
      <path d="M44 2v10a4 4 0 0 0 4 4h10" className="kb-sheet__fold" />
      <rect x="13" y="22" width="38" height="8" rx="2" className="kb-sheet__head" />
      {[34, 41, 48, 55].map((y) => (
        <line key={y} x1="13" x2="51" y1={y} y2={y} className="kb-sheet__rule" />
      ))}
      {Array.from({ length: n - 1 }, (_, k) => (
        <line key={k} x1={13 + ((k + 1) * 38) / n} x2={13 + ((k + 1) * 38) / n} y1="22" y2="58" className="kb-sheet__rule" />
      ))}
      <rect x="2" y="54" width="28" height="14" rx="4" className="kb-sheet__tag" />
      <text x="16" y="64" textAnchor="middle" className="kb-sheet__ext">
        CSV
      </text>
    </svg>
  );
}

/** Templates to fill in, training to ask for, the policies behind the evidence and practices worth copying. */
export function Resources({
  templates,
  training,
  policies,
  practices,
  email,
  storyHref,
}: {
  templates: typeof TEMPLATES;
  training: typeof TRAINING;
  policies: typeof POLICIES;
  practices: Story[] | null;
  email: string;
  storyHref: (slug: string) => string;
}) {
  const ask = (subject: string) => `mailto:${email}?subject=${encodeURIComponent(subject)}`;
  return (
    <div className="kb-res">
      {templates.length > 0 && (
        <Tile id="templates" title="Templates" className="kb-tpl-tile">
          <ul className="kb-tpls">
            {templates.map((t, i) => (
              <li key={t.file} style={{ ["--i" as string]: i } as CSSProperties}>
                <button type="button" className="kb-tpl" onClick={() => downloadTemplate(t.file, t.cols)} title={t.cols.join(" · ")}>
                  <Sheet cols={t.cols.length} />
                  <span className="kb-tpl__text">
                    <b>{t.name}</b>
                    <span>{t.cols.length} fields</span>
                  </span>
                  <span className="kb-tpl__go" aria-hidden="true">
                    <Icon name="download" size={16} />
                  </span>
                  <span className="sr-only">Download {t.file}</span>
                </button>
              </li>
            ))}
          </ul>
        </Tile>
      )}

      {training.length > 0 && (
        <Tile id="training" title="Training" className="kb-train-tile">
          <ul className="kb-media-list">
            {training.map((t) => (
              <li key={t.title}>
                <a className="kb-media" href={ask(`Access: ${t.title}`)}>
                  <span className={`kb-media__thumb is-${t.kind.toLowerCase()}`} aria-hidden="true">
                    <span className="kb-media__icon">
                      <Icon name={KIND_ICON[t.kind]} size={15} strokeWidth={2} />
                    </span>
                    <em>{t.length}</em>
                  </span>
                  <span className="kb-media__text">
                    <b>{t.title}</b>
                    <span>{t.kind}</span>
                  </span>
                  <span className="kb-media__ask">
                    <Icon name="lock" size={13} />
                    Request
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </Tile>
      )}

      {policies.length > 0 && (
        <Tile id="policies" title="Policies and frameworks" className="kb-pol-tile">
          <ul className="kb-docs">
            {policies.map(([name, text]) => (
              <li key={name} className="kb-doc">
                <span className="kb-doc__icon" aria-hidden="true">
                  <Icon name="scroll" size={17} />
                </span>
                <span className="kb-doc__text">
                  <b>{name}</b>
                  <span>{text}</span>
                </span>
                <a className="kb-icon-btn" href={ask(`Copy requested: ${name}`)} aria-label={`Request a copy of ${name}`} title="Request a copy">
                  <Icon name="mail" size={16} />
                </a>
              </li>
            ))}
          </ul>
        </Tile>
      )}

      {practices && (
        <Tile id="practices" title="Good practices" className="kb-prac-tile">
          {practices.length ? (
            <ul className="kb-prac">
              {practices.map((s) => (
                <li key={s.slug}>
                  <Link href={storyHref(s.slug)} className="kb-prac__item">
                    <span className="kb-prac__icon" aria-hidden="true">
                      <Icon name="spark" size={16} />
                    </span>
                    <span className="kb-prac__text">
                      <b>{s.title}</b>
                      <span>{s.replication || s.outcomeLabel}</span>
                    </span>
                    <Icon name="chevron" size={15} className="kb-prac__go" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="kb-quiet">No published practices yet.</p>
          )}
        </Tile>
      )}
    </div>
  );
}
