"use client";

/*
 * The post composer's settings and panels: the layout picker, the shell the panels share, the dropzone and
 * upload rows for images and the thumbnail, the SDG picker with the official goal icons, and the hashtag list.
 */
import { useEffect, useId, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { POST_LAYOUTS, POST_LIMITS, POST_PICK, hashtag, type PostLayout } from "@/lib/governance/posts";
import { Icon } from "@/components/ui/Icon";
import { POST_ACCEPT } from "./media";
import { useViews } from "@/components/reference/ReferenceProvider";

/* ---------- Shell ---------- */

export function Panel({ id, title, note, foot, onDone, children }: { id: string; title: string; note?: ReactNode; foot?: ReactNode; onDone: () => void; children: ReactNode }) {
  return (
    <section id={id} className="pc-doc pc-panel" aria-labelledby={`${id}-title`}>
      <header className="pc-doc__head">
        <h3 id={`${id}-title`} className="pc-doc__title">
          {title}
        </h3>
        <span className="pc-doc__count" aria-live="polite">
          {note}
        </span>
        <button type="button" className="btn btn--sm btn--dark pc-doc__done" onClick={onDone}>
          Done
        </button>
      </header>
      <div className="pc-panel__body">{children}</div>
      {foot && <footer className="pc-panel__foot">{foot}</footer>}
    </section>
  );
}

/* ---------- Dropzone ---------- */

function Sheet({ label, color, flip }: { label: string; color: string; flip?: boolean }) {
  const x = flip ? 6.4 : 0;
  return (
    <svg viewBox="0 0 30 36" className="dz__badge" aria-hidden="true">
      <path className="dz__badge-sheet" d="M5 1h14l10 10v20a4 4 0 0 1-4 4H5a4 4 0 0 1-4-4V5a4 4 0 0 1 4-4z" />
      <path className="dz__badge-fold" d="M19 1v6a4 4 0 0 0 4 4h6" />
      <rect x={x} y="19" width="23.6" height="11" rx="3" fill={color} fillOpacity="0.12" />
      <text x={x + 4} y="27.2" className="dz__badge-text" fill={color}>
        {label}
      </text>
    </svg>
  );
}

/** A drop area that fans its sheets when files come near; clicking or Enter browses instead. Pictures by default;
 * `accept`, `sheets` (the two labelled sheets and their colours) and `hint` suit it to other files. */
export function Dropzone({
  multiple,
  noun,
  disabled,
  accept = POST_ACCEPT,
  sheets = [
    ["JPG", "#e5484d"],
    ["PNG", "#5b5bd6"],
  ],
  hint,
  onFiles,
}: {
  multiple?: boolean;
  noun: string;
  disabled?: string;
  accept?: string;
  sheets?: [[string, string], [string, string]];
  hint?: ReactNode;
  onFiles: (files: File[]) => void;
}) {
  const hintId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const files = (e: DragEvent) => e.dataTransfer.types.includes("Files");
  return (
    <div className="dz" data-over={over ? "" : undefined}>
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const list = e.currentTarget.files;
          if (list?.length) onFiles([...list]);
          e.currentTarget.value = "";
        }}
      />
      <button
        type="button"
        className="dz__area"
        aria-describedby={hintId}
        disabled={!!disabled}
        onClick={() => input.current?.click()}
        onDragEnter={(e) => files(e) && setOver(true)}
        onDragOver={(e) => {
          if (!files(e) || disabled) return;
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = "copy";
          setOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
        }}
        onDrop={(e) => {
          setOver(false);
          if (!e.dataTransfer.files.length || disabled) return;
          e.preventDefault();
          e.stopPropagation();
          onFiles([...e.dataTransfer.files]);
        }}
      >
        <span className="dz__stack" aria-hidden="true">
          <span className="dz__sheet dz__sheet--l">
            <Sheet label={sheets[0][0]} color={sheets[0][1]} />
          </span>
          <span className="dz__sheet dz__sheet--r">
            <Sheet label={sheets[1][0]} color={sheets[1][1]} flip />
          </span>
          <span className="dz__sheet dz__sheet--m">
            <Icon name="upload" size={18} />
          </span>
        </span>
        <span className="dz__title">
          {disabled ? (
            disabled
          ) : (
            <>
              <span className="dz__mouse">
                {over ? `Drop to add ${noun}` : <>Drop {noun} here or <span className="dz__browse">browse</span></>}
              </span>
              <span className="dz__touch">
                Tap to <span className="dz__browse">choose {noun}</span>
              </span>
            </>
          )}
        </span>
        <span className="dz__hint" id={hintId}>
          {hint ?? <>JPG or PNG · up to {POST_PICK.maxMb}&nbsp;MB {multiple ? "each" : ""} · compressed on upload</>}
        </span>
      </button>
    </div>
  );
}

/* ---------- Upload rows ---------- */

const MB = 1_048_576;

/** "1.5 of 4.2 MB", or KB for small files. */
export function sizePair(loaded: number, total: number) {
  if (total >= MB) return `${(loaded / MB).toFixed(1)} of ${(total / MB).toFixed(1)} MB`;
  return `${Math.round(loaded / 1024)} of ${Math.max(1, Math.round(total / 1024))} KB`;
}

export function sizeOf(bytes: number) {
  return bytes >= MB ? `${(bytes / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Time left from how long the upload has run so far. */
export function timeLeft(progress: number, started?: number) {
  if (!started || progress < 0.04) return "starting…";
  const left = (((Date.now() - started) / 1000) * (1 - progress)) / progress;
  if (left < 1.5) return "almost done";
  return left < 60 ? `${Math.round(left)}s left` : `${Math.round(left / 60)} min left`;
}

export function UploadRow({
  src,
  badge,
  wide,
  name,
  meta,
  progress,
  failed,
  onRetry,
  onRemove,
  removeLabel,
  actions,
  children,
  grip,
}: {
  /** The picture, or `badge` (a file-type mark) for other files. */
  src?: string;
  badge?: ReactNode;
  /** The thumbnail's row shows its picture at the shape lists use. */
  wide?: boolean;
  name: string;
  meta: ReactNode;
  progress?: number;
  failed?: string;
  onRetry: () => void;
  onRemove: () => void;
  removeLabel: string;
  actions?: ReactNode;
  children?: ReactNode;
  grip?: ReactNode;
}) {
  const status = failed ? "error" : progress !== undefined ? "uploading" : "done";
  return (
    <div className="dz-row" data-status={status}>
      {grip}
      {src ? <img className={`dz-row__pic${wide ? " dz-row__pic--wide" : ""}`} src={src} alt="" draggable={false} /> : badge}
      <div className="dz-row__info">
        <span className="dz-row__name" title={name}>
          {name}
        </span>
        <span className="dz-row__meta">{failed ? <span className="dz-row__error">{failed}</span> : meta}</span>
        {progress !== undefined && (
          <span className="dz-row__bar" role="progressbar" aria-label={`${name} upload`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
            <span style={{ transform: `scaleX(${progress})` }} />
          </span>
        )}
        {children}
      </div>
      <div className="dz-row__actions">
        {actions}
        {failed && (
          <button type="button" className="dz-row__btn" aria-label={`Retry ${name}`} data-tip="Retry" onClick={onRetry}>
            <Icon name="refresh" size={16} />
          </button>
        )}
        <button type="button" className="dz-row__btn" aria-label={removeLabel} data-tip="Remove" onClick={onRemove}>
          <Icon name="close" size={16} />
        </button>
      </div>
    </div>
  );
}

/* ---------- SDGs ---------- */



export function SdgPicker({ value, onToggle, compact = false }: { value: number[]; onToggle: (n: number) => void; compact?: boolean }) {
  // The official UN icon for each goal (sdg_goals, in the R2 public bucket).
  const { sdgNames, sdgIcons } = useViews();
  const goals = Object.keys(sdgNames).map(Number).sort((a, b) => a - b);
  return (
      <ul className={compact ? "pc-sdgs pc-sdgs--compact" : "pc-sdgs"}>
        {goals.map((n) => (
          <li key={n}>
            <button type="button" className="pc-sdg" aria-pressed={value.includes(n)} aria-label={`SDG ${n}: ${sdgNames[n]}`} onClick={() => onToggle(n)}>
              <img src={sdgIcons[n]} alt="" width={466} height={466} loading="lazy" draggable={false} />
              <span className="pc-sdg__check" aria-hidden="true">
                <Icon name="check" size={13} strokeWidth={2.8} />
              </span>
            </button>
          </li>
        ))}
    </ul>

  );
}

/* ---------- Hashtags ---------- */

export function HashtagList({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const field = useRef<HTMLInputElement>(null);
  const fieldId = useId();
  const [adding, setAdding] = useState(value.length === 0);
  const [draft, setDraft] = useState("");
  const full = value.length >= POST_LIMITS.hashtags;

  /** Adds what is typed: a space, comma or Enter ends each hashtag. Reports a problem and returns false. */
  const commit = () => {
    const el = field.current;
    const words = draft.split(/[\s,]+/).map((w) => w.replace(/^#+/, "")).filter(Boolean);
    if (!el || !words.length) return true;
    const tags = words.map(hashtag);
    const fail = (message: string) => {
      el.setCustomValidity(message);
      el.reportValidity();
      return false;
    };
    if (tags.some((t) => !t)) return fail("Use letters, numbers or underscores, like FloodResilience.");
    const next = [...value];
    for (const t of tags) if (!next.some((x) => x.toLowerCase() === t.toLowerCase())) next.push(t);
    if (next.length > POST_LIMITS.hashtags) return fail(`A post takes up to ${POST_LIMITS.hashtags} hashtags.`);
    onChange(next);
    setDraft("");
    if (next.length >= POST_LIMITS.hashtags) setAdding(false);
    return true;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Escape") {
      // Leaves the new tag, not the panel.
      e.preventDefault();
      e.stopPropagation();
      setDraft("");
      setAdding(false);
      return;
    }
    if (e.key === "Backspace" && !draft && value.length) {
      e.preventDefault();
      onChange(value.slice(0, -1));
      return;
    }
    if (e.key !== "Enter" && e.key !== " " && e.key !== ",") return;
    e.preventDefault();
    commit();
  };

  return (
    <>
      {value.length > 0 || adding ? (
        <ul className="pc-taglist" aria-label="Hashtags on this post">
          {value.map((t) => (
            <li key={t} className="pc-tagrow">
              <span className="pc-tagrow__mark" aria-hidden="true">
                <Icon name="hash" size={15} />
              </span>
              <span className="pc-tagrow__name">{t}</span>
              <button type="button" className="dz-row__btn" aria-label={`Remove #${t}`} data-tip="Remove" onClick={() => onChange(value.filter((x) => x !== t))}>
                <Icon name="close" size={16} />
              </button>
            </li>
          ))}
          {adding && !full && (
            <li className="pc-tagrow pc-tagrow--new">
              <span className="pc-tagrow__mark" aria-hidden="true">
                <Icon name="hash" size={15} />
              </span>
              <label className="sr-only" htmlFor={fieldId}>
                New hashtag
              </label>
              <input
                ref={field}
                id={fieldId}
                className="pc-tagrow__input"
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  e.target.setCustomValidity("");
                }}
                onKeyDown={onKeyDown}
                onBlur={() => {
                  if (!draft.trim()) setAdding(value.length === 0);
                  else commit();
                }}
                placeholder="Type a hashtag, then Enter"
                maxLength={POST_LIMITS.hashtag + 1}
                autoComplete="off"
                spellCheck={false}
                autoFocus
              />
            </li>
          )}
        </ul>
      ) : null}
      {!value.length && !adding && <p className="pc-hint">Hashtags help people find related stories, like #FloodResilience.</p>}
      <button
        type="button"
        className="btn pc-tagadd"
        disabled={full}
        onClick={() => {
          if (adding && draft.trim()) commit();
          setAdding(true);
          requestAnimationFrame(() => field.current?.focus());
        }}
      >
        <Icon name="plus" size={16} /> {full ? `${POST_LIMITS.hashtags} is the most a post takes` : "Add tag"}
      </button>
    </>
  );
}

/* ---------- Layouts ---------- */

const lines = (n: number) => Array.from({ length: n }, (_, i) => <i key={i} />);

/** What each layout looks like inside its window: the image areas as blocks, the text as lines. */
const SKETCHES: Record<PostLayout, ReactNode> = {
  cover: (
    <>
      <span className="pc-sketch__hero">
        <span className="pc-sketch__text">
          <b />
          {lines(2)}
        </span>
        <span className="pc-sketch__img" />
      </span>
      <span className="pc-sketch__text">{lines(2)}</span>
    </>
  ),
  feature: (
    <>
      <span className="pc-sketch__text">
        <b />
      </span>
      <span className="pc-sketch__img pc-sketch__img--grow" />
      <span className="pc-sketch__text">{lines(1)}</span>
    </>
  ),
  split: (
    <>
      <span className="pc-sketch__text">
        <b />
      </span>
      <span className="pc-sketch__cols">
        <span className="pc-sketch__text">{lines(4)}</span>
        <span className="pc-sketch__stack">
          <span className="pc-sketch__img" />
          <span className="pc-sketch__img" />
        </span>
      </span>
    </>
  ),
  essay: (
    <>
      <span className="pc-sketch__text pc-sketch__text--narrow">
        <b />
        {lines(3)}
      </span>
      <span className="pc-sketch__row">
        <span className="pc-sketch__img" />
        <span className="pc-sketch__img" />
        <span className="pc-sketch__img" />
      </span>
    </>
  ),
  banner: (
    <span className="pc-sketch__img pc-sketch__img--grow pc-sketch__banner">
      <span className="pc-sketch__text pc-sketch__text--on">
        <b />
        {lines(1)}
      </span>
    </span>
  ),
  gallery: (
    <>
      <span className="pc-sketch__row">
        <span className="pc-sketch__img" />
        <span className="pc-sketch__img" />
        <span className="pc-sketch__img" />
      </span>
      <span className="pc-sketch__text">
        <b />
        {lines(2)}
      </span>
    </>
  ),
  magazine: (
    <>
      <span className="pc-sketch__hero pc-sketch__hero--short">
        <span className="pc-sketch__text">
          <b />
        </span>
        <span className="pc-sketch__img" />
      </span>
      <span className="pc-sketch__cols pc-sketch__cols--even">
        <span className="pc-sketch__text">{lines(3)}</span>
        <span className="pc-sketch__text">{lines(3)}</span>
      </span>
    </>
  ),
  alternate: (
    <>
      <span className="pc-sketch__text">
        <b />
      </span>
      <span className="pc-sketch__cols pc-sketch__cols--even">
        <span className="pc-sketch__text">{lines(3)}</span>
        <span className="pc-sketch__img" />
      </span>
      <span className="pc-sketch__cols pc-sketch__cols--even">
        <span className="pc-sketch__img" />
        <span className="pc-sketch__text">{lines(3)}</span>
      </span>
    </>
  ),
};

/** A layout drawn as a small desktop window. */
function LayoutSketch({ layout }: { layout: PostLayout }) {
  return (
    <span className={`pc-sketch pc-sketch--${layout}`} aria-hidden="true">
      <span className="pc-sketch__chrome">
        <i />
        <i />
        <i />
      </span>
      <span className="pc-sketch__screen">{SKETCHES[layout]}</span>
    </span>
  );
}

/** The layouts as a carousel of windows, with arrows to page through them. */
export function LayoutPicker({ value, name, labelId, onChange }: { value: PostLayout; name: string; labelId: string; onChange: (layout: PostLayout) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const [ends, setEnds] = useState({ start: true, end: false });
  const [progress, setProgress] = useState({ page: 0, pages: 1 });

  const measure = () => {
    const t = track.current;
    if (!t) return;
    setEnds({ start: t.scrollLeft < 4, end: t.scrollLeft + t.clientWidth > t.scrollWidth - 4 });
    const distance = Math.max(0, t.scrollWidth - t.clientWidth);
    const pages = distance > 4 ? Math.ceil(distance / Math.max(1, t.clientWidth * 0.8)) + 1 : 1;
    setProgress({ page: distance ? Math.round(t.scrollLeft / distance * (pages - 1)) : 0, pages });
  };
  useEffect(() => {
    const t = track.current;
    if (!t) return;
    measure();
    // Start with the chosen layout in view.
    t.querySelector<HTMLElement>(":checked")?.closest("label")?.scrollIntoView({ block: "nearest", inline: "nearest" });
    const ro = new ResizeObserver(measure);
    ro.observe(t);
    return () => ro.disconnect();
  }, []);

  const page = (dir: 1 | -1) => {
    const t = track.current;
    if (!t) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    t.scrollBy({ left: dir * t.clientWidth * 0.8, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <div className="pc-carousel" data-start={ends.start ? "" : undefined} data-end={ends.end ? "" : undefined}>
      <div className="pc-set__head">
        <h3 id={labelId} className="pc-set__label">
          Layout
        </h3>
        <span className="pc-carousel__nav">
          <button type="button" className="pc-carousel__btn" aria-label="Earlier layouts" disabled={ends.start} onClick={() => page(-1)}>
            <Icon name="chevron-left" size={16} />
          </button>
          <button type="button" className="pc-carousel__btn" aria-label="More layouts" disabled={ends.end} onClick={() => page(1)}>
            <Icon name="chevron" size={16} />
          </button>
        </span>
      </div>
      <div ref={track} className="pc-carousel__track" role="radiogroup" aria-labelledby={labelId} onScroll={measure}>
        {POST_LAYOUTS.map((l) => (
          <label key={l.key} className="pc-layoutopt">
            <input
              type="radio"
              className="sr-only"
              name={name}
              value={l.key}
              checked={value === l.key}
              onChange={(e) => {
                onChange(l.key);
                e.currentTarget.closest("label")?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
              }}
            />
            <LayoutSketch layout={l.key} />
            <span className="pc-layoutopt__name">{l.name}</span>
          </label>
        ))}
      </div>
      {progress.pages > 1 && (
        <div className="pc-carousel__dots" role="group" aria-label="Layout scroll progress">
          {Array.from({ length: progress.pages }, (_, index) => (
            <button
              key={index}
              type="button"
              className="pc-carousel__dot"
              aria-label={`Show layout page ${index + 1} of ${progress.pages}`}
              aria-current={progress.page === index ? "step" : undefined}
              onClick={() => {
                const t = track.current;
                if (!t) return;
                t.scrollTo({ left: (t.scrollWidth - t.clientWidth) * index / (progress.pages - 1), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
              }}
            ><span /></button>
          ))}
        </div>
      )}
    </div>
  );
}
