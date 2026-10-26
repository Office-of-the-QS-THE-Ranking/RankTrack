"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { inkOn } from "@/lib/data";
import { Icon } from "@/components/ui/Icon";
import { Card, Notice } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { useFlag, useGovern, useHub, useRankings, useViewer } from "@/components/hub/HubProvider";
import { StageTrack } from "./StageTrack";
import { uploadEvidence } from "./evidence-upload";
import { skipChecks } from "@/lib/dev-checks";
import { useViews } from "@/components/reference/ReferenceProvider";

const TYPES = [
  ["Operational data", "Energy, water, waste, transport or campus figures"],
  ["Research output", "Publications, citations, co-authorship"],
  ["Policy", "Approved policies and governance documents"],
  ["Narrative and outcomes", "Programmes with beneficiaries and results"],
  ["Financial data", "Research or industry income, budgets"],
  ["Teaching and course data", "Courses, curricula, learning outcomes"],
  ["Innovation or intellectual property", "Patents, utility models, new practices"],
] as const;
type DataType = (typeof TYPES)[number][0];


const STEPS = [
  ["Activity or data type", "The type decides which rankings can use it."],
  ["Reporting period", "Most rankings this cycle ask for 2025. Evidence outside the window is returned."],
  ["Describe the contribution", "The challenge, what was implemented and who was involved."],
  ["Measurable results", "Outcomes count for more than activities: say what changed, not only what happened."],
  ["Beneficiaries", "Who benefited, how many, and how the change was verified."],
  ["Relevant SDGs", "Select every goal the contribution supports."],
  ["Upload evidence", "Attach files or give a public URL where the ranking asks for one."],
  ["Rankings", "The Hub recommends every ranking that can reuse this evidence."],
  ["Certify and submit", "Check the summary, then certify the submission."],
] as const;

const GM_BY_SDG: Record<number, string> = {
  6: "Water",
  7: "Energy and Climate Change",
  11: "Setting and Infrastructure",
  12: "Waste",
  13: "Energy and Climate Change",
  15: "Setting and Infrastructure",
};

interface Match {
  key: string;
  ranking: string;
  indicator: string;
  why: string;
}

function recommend(type: DataType | null, sdgs: number[], sdgNames: Record<number, string>): Match[] {
  const out: Match[] = [];
  const add = (ranking: string, indicator: string, why: string) => {
    const key = `${ranking} · ${indicator}`;
    if (!out.some((m) => m.key === key)) out.push({ key, ranking, indicator, why });
  };
  switch (type) {
    case "Operational data":
      sdgs.forEach((s) => GM_BY_SDG[s] && add("UI GreenMetric", GM_BY_SDG[s], `Campus operations for SDG ${s}`));
      if (!sdgs.some((s) => GM_BY_SDG[s])) add("UI GreenMetric", "Setting and Infrastructure", "Campus operations data");
      add("QS Sustainability", "Environmental Impact", "Environmental sustainability lens");
      break;
    case "Research output":
      add("QS WUR", "Citations per Faculty", "Indexed outputs feed citations");
      add("THE WUR", "Research Quality", "Citation impact and research strength");
      add("QS by Subject", "Citations and H-index", "Subject research performance");
      break;
    case "Policy":
      add("QS Sustainability", "Governance", "Approved policies with public links");
      break;
    case "Narrative and outcomes":
      add("QS Sustainability", "Social Impact", "Knowledge exchange and community outcomes");
      add("WURI", "Social Responsibility", "Programmes serving communities");
      break;
    case "Financial data":
      add("THE WUR", "Research Environment", "Research income per staff");
      add("THE WUR", "Industry", "Industry income");
      break;
    case "Teaching and course data":
      add("UI GreenMetric", "Education and Research", "Sustainability courses");
      add("QS Sustainability", "Environmental Impact", "Environmental education lens");
      break;
    case "Innovation or intellectual property":
      add("WURI", "Industrial Application", "Innovation applied with partners");
      add("THE WUR", "Industry", "Patents citing UST research");
      break;
  }
  sdgs.forEach((s) => add("THE Impact", `SDG ${s}`, sdgNames[s]));
  return out;
}

export function SubmitWizard() {
  const { evidenceLevels, sdgColors, sdgNames } = useViews();
  const hub = useHub();
  const viewer = useViewer();
  const rankings = useRankings();
  const smart = useFlag("smart-matching");
  const { run, pending } = useGovern();
  // Reporting periods and upload rules come from System Configuration.
  const PERIODS = (hub?.periods ?? []).map((p) => [p.label, p.note] as const);
  const uploads = hub?.uploads ?? { maxFileMB: 25, maxFiles: 10, types: ["PDF", "XLSX", "CSV"] };
  const tracked = useMemo(() => new Set(rankings.map((r) => r.short)), [rankings]);
  const [step, setStep] = useState(0);
  const [tried, setTried] = useState<boolean[]>(() => STEPS.map(() => false));
  const [type, setType] = useState<DataType | null>(null);
  const [period, setPeriod] = useState<string>(() => hub?.periods[0]?.label ?? "");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [result, setResult] = useState("");
  const [resultUnit, setResultUnit] = useState("");
  const [level, setLevel] = useState(3);
  const [who, setWho] = useState("");
  const [count, setCount] = useState("");
  const [verified, setVerified] = useState("");
  const [sdgs, setSdgs] = useState<number[]>([]);
  const [files, setFiles] = useState<{ name: string; sizeMB: number; file: File }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState("");
  const [ref, setRef] = useState("");
  const [url, setUrl] = useState("");
  const [over, setOver] = useState(false);
  const [auto, setAuto] = useState(smart);
  const [picked, setPicked] = useState<string[]>([]);
  const [certified, setCertified] = useState(false);
  const [sent, setSent] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const addFiles = (list: File[]) => {
    const next = [...files, ...list.map((f) => ({ name: f.name, sizeMB: Math.round((f.size / 1_048_576) * 10) / 10, file: f }))];
    const ext = (n: string) => n.split(".").pop()?.toUpperCase() ?? "";
    const wrong = next.find((f) => !uploads.types.includes(ext(f.name)));
    const big = next.find((f) => f.sizeMB > uploads.maxFileMB);
    setFileError(
      next.length > uploads.maxFiles
        ? `Attach at most ${uploads.maxFiles} files.`
        : wrong
          ? `${wrong.name} is not an accepted type. Use ${uploads.types.join(", ")}.`
          : big
            ? `${big.name} is larger than ${uploads.maxFileMB} MB.`
            : "",
    );
    setFiles(next);
  };

  // Only rankings System Configuration tracks can receive evidence.
  const matches = useMemo(() => recommend(type, sdgs, sdgNames).filter((m) => tracked.has(m.ranking)), [type, sdgs, sdgNames, tracked]);
  const chosen = auto ? matches.map((m) => m.key) : picked.filter((p) => matches.some((m) => m.key === p));
  const rankingsCount = new Set(matches.filter((m) => chosen.includes(m.key)).map((m) => m.ranking)).size;
  const urlOk = !url.trim() || /^https?:\/\/[^\s.]+\.[^\s]+$/i.test(url.trim());

  const errors: (string | null)[] = [
    type ? null : "Choose the kind of evidence you are submitting.",
    period ? null : "Choose a reporting period.",
    title.trim().length > 3 ? null : "Give the contribution a title of at least four characters.",
    result.trim() ? null : "Enter the measurable result, for example 4,820.",
    who.trim() ? null : "Say who benefited.",
    sdgs.length ? null : "Select at least one SDG.",
    fileError || (files.length || (url.trim() && urlOk) ? (urlOk ? null : "Enter a full public URL starting with https://") : urlOk ? "Attach a file or give a public URL." : "Enter a full public URL starting with https://"),
    chosen.length ? null : "Keep at least one ranking, or turn automatic matching back on.",
    certified ? null : "Certify the submission to send it.",
  ];
  const complete = errors.map((e) => !e);
  const showError = tried[step] && errors[step];

  const go = (n: number) => {
    setStep(n);
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>("h2")?.focus());
  };
  const next = () => {
    if (errors[step] && !skipChecks()) {
      setTried((t) => t.map((v, i) => (i === step ? true : v)));
      return;
    }
    go(Math.min(STEPS.length - 1, step + 1));
  };

  if (sent) {
    return (
      <Card className="sent">
        <span className="sent__mark" aria-hidden="true">
          <Icon name="check" size={28} strokeWidth={2.2} />
        </span>
        <p className="eyebrow">Reference {ref}</p>
        <h2 className="sent__title">Received. Thank you.</h2>
        <p className="lead-text">
          &ldquo;{title}&rdquo; is with the Office for review. You will see it move through each stage below, and your unit will be credited in{" "}
          <b>
            {rankingsCount} {rankingsCount === 1 ? "ranking" : "rankings"}
          </b>{" "}
          once it is accepted.
        </p>
        <StageTrack stage={0} status="For review" />
        <div className="btns-row mt-4">
          <Link href="/portal/history" className="btn btn--dark">
            <Icon name="history" size={18} /> Track this submission
          </Link>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setSent(false);
              setStep(0);
              setTitle("");
              setDesc("");
              setResult("");
              setResultUnit("");
              setWho("");
              setCount("");
              setVerified("");
              setSdgs([]);
              setFiles([]);
              setUrl("");
              setPicked([]);
              setCertified(false);
              setTried(STEPS.map(() => false));
            }}
          >
            Submit another
          </button>
        </div>
      </Card>
    );
  }

  const field = (label: ReactNode, control: ReactNode, hint?: string) => (
    <label className="field">
      <span className="field__label">{label}</span>
      {control}
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  );

  return (
    <div className="wizard">
      {viewer && (
        <p className="wizard__for small text-2">
          Submitting for <b>{viewer.portal.unitName}</b>
          {viewer.portal.programName ? ` · ${viewer.portal.programName}` : ""} as {viewer.name}
        </p>
      )}
      <nav aria-label="Submission steps" className="wizard__steps">
        <p className="wizard__progress">
          Step {step + 1} of {STEPS.length}
          <span className="meter" aria-hidden="true">
            <span className="meter__fill" style={{ width: `${((step + 1) / STEPS.length) * 100}%`, animation: "none" }} />
          </span>
        </p>
        <ol className="stepper">
          {STEPS.map(([s], i) => (
            <li key={s} className={complete[i] && i !== step ? "is-done" : tried[i] && errors[i] ? "is-error" : ""}>
              <button type="button" aria-current={i === step ? "step" : undefined} onClick={() => go(i)}>
                <span className="stepper__dot">{complete[i] && i !== step ? <Icon name="check" size={13} strokeWidth={2.4} /> : i + 1}</span>
                <span>{s}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div ref={formRef}>
        <Card className="wizard__form">
          <header className="wizard__head">
            <p className="eyebrow">
              Step {step + 1} of {STEPS.length}
            </p>
            <h2 tabIndex={-1}>{STEPS[step][0]}</h2>
            <p className="text-2">{STEPS[step][1]}</p>
          </header>

          <div className="wizard__body">
            {step === 0 && (
              <fieldset className="field">
                <legend className="sr-only">Activity or data type</legend>
                <div className="choices choices--grid">
                  {TYPES.map(([t, d]) => (
                    <label key={t} className="choice">
                      <input type="radio" name="type" checked={type === t} onChange={() => setType(t)} />
                      <span className="choice__text">
                        {t}
                        <small>{d}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {step === 1 && (
              <fieldset className="field">
                <legend className="sr-only">Reporting period</legend>
                <div className="choices choices--grid">
                  {PERIODS.map(([p, d]) => (
                    <label key={p} className="choice">
                      <input type="radio" name="period" checked={period === p} onChange={() => setPeriod(p)} />
                      <span className="choice__text">
                        {p}
                        <small>{d}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {step === 2 && (
              <div className="stack">
                {field(
                  "Title",
                  <input
                    className="input"
                    value={title}
                    aria-invalid={!!(tried[2] && errors[2]) || undefined}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Rainwater reuse in the Engineering complex"
                  />,
                )}
                {field(
                  <>
                    What did your unit do? <em>(optional)</em>
                  </>,
                  <textarea className="textarea" value={desc} maxLength={1200} onChange={(e) => setDesc(e.target.value)} placeholder="The challenge, what was implemented, and who was involved." />,
                  `${desc.length} of 1,200 characters`,
                )}
              </div>
            )}
            {step === 3 && (
              <div className="stack">
                <div className="grid cols-2">
                  {field(
                    "Result",
                    <input
                      className="input num"
                      inputMode="decimal"
                      value={result}
                      aria-invalid={!!(tried[3] && errors[3]) || undefined}
                      onChange={(e) => setResult(e.target.value)}
                      placeholder="4,820"
                    />,
                  )}
                  {field("Unit of measure", <input className="input" value={resultUnit} onChange={(e) => setResultUnit(e.target.value)} placeholder="cubic metres reused" />)}
                </div>
                <fieldset className="field">
                  <legend className="field__label">What does this evidence show?</legend>
                  <div className="ladder-pick">
                    {evidenceLevels.map((l, i) => (
                      <label key={l} className="choice">
                        <input type="radio" name="level" checked={level === i + 1} onChange={() => setLevel(i + 1)} />
                        <span className="choice__text">
                          <small>Rung {i + 1}</small>
                          {l}
                        </span>
                      </label>
                    ))}
                  </div>
                  <span className="field__hint">Evidence of verified change counts for more than activity reports alone.</span>
                </fieldset>
              </div>
            )}
            {step === 4 && (
              <div className="stack">
                <div className="grid cols-2">
                  {field(
                    "Who benefited?",
                    <input className="input" value={who} aria-invalid={!!(tried[4] && errors[4]) || undefined} onChange={(e) => setWho(e.target.value)} placeholder="Residents of Barangay 455" />,
                  )}
                  {field(
                    <>
                      How many? <em>(optional)</em>
                    </>,
                    <input className="input num" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/[^\d,]/g, ""))} placeholder="1,200" />,
                  )}
                </div>
                {field(
                  <>
                    How was the change verified? <em>(optional)</em>
                  </>,
                  <input className="input" value={verified} onChange={(e) => setVerified(e.target.value)} placeholder="Barangay records before and after the retrofit" />,
                )}
              </div>
            )}
            {step === 5 && (
              <fieldset className="field">
                <legend className="sr-only">Relevant SDGs</legend>
                <div className="sdgpick">
                  {Object.keys(sdgNames).map((k) => {
                    const n = Number(k);
                    const on = sdgs.includes(n);
                    return (
                      <button
                        key={n}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setSdgs((v) => (on ? v.filter((x) => x !== n) : [...v, n].sort((a, b) => a - b)))}
                        style={on ? ({ background: sdgColors[n], color: inkOn(sdgColors[n]), borderColor: sdgColors[n] } as CSSProperties) : undefined}
                      >
                        <b>{n}</b>
                        <span>{sdgNames[n]}</span>
                        {on && <Icon name="check" size={14} strokeWidth={2.6} className="sdgpick__check" />}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}
            {step === 6 && (
              <div className="stack">
                <label
                  className={`dropzone${over ? " is-over" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOver(true);
                  }}
                  onDragLeave={() => setOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setOver(false);
                    addFiles(Array.from(e.dataTransfer.files));
                  }}
                >
                  <span className="dropzone__icon">
                    <Icon name="upload" />
                  </span>
                  <strong>Choose files or drop them here</strong>
                  <span className="small muted">
                    {uploads.types.join(", ")} · up to {uploads.maxFileMB} MB each · {uploads.maxFiles} files at most
                  </span>
                  <input
                    type="file"
                    multiple
                    className="sr-only"
                    accept={uploads.types.map((t) => `.${t.toLowerCase()}`).join(",")}
                    onChange={(e) => addFiles(Array.from(e.target.files ?? []))}
                  />
                </label>
                {files.length > 0 && (
                  <ul className="filelist">
                    {files.map((f, i) => (
                      <li key={f.name + i}>
                        <Icon name="paperclip" size={16} />
                        <span className="truncate">
                          {f.name} <span className="muted small">{f.sizeMB} MB</span>
                        </span>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => {
                            setFiles((x) => x.filter((_, k) => k !== i));
                            setFileError("");
                          }}
                          aria-label={`Remove ${f.name}`}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <label className="field">
                  <span className="field__label">
                    Public URL <em>(if the ranking asks for one)</em>
                  </span>
                  <input className="input" type="url" value={url} aria-invalid={!urlOk || undefined} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.ust.edu.ph/…" />
                  <span className="field__hint">Anyone must be able to open it without signing in.</span>
                </label>
              </div>
            )}
            {step === 7 && (
              <div className="stack">
                {smart ? (
                  <label className="choice" style={{ alignSelf: "flex-start" }}>
                    <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
                    Match rankings automatically
                  </label>
                ) : (
                  <p className="small text-2">Tick every ranking this evidence supports. Only the rankings the Office currently tracks are listed.</p>
                )}
                {matches.length === 0 ? (
                  <Notice tone="plain">Choose a data type and at least one SDG to see where this can count.</Notice>
                ) : (
                  <div className="choices choices--grid">
                    {matches.map((m) => (
                      <label key={m.key} className="choice">
                        <input
                          type="checkbox"
                          disabled={auto}
                          checked={chosen.includes(m.key)}
                          onChange={(e) => setPicked((p) => (e.target.checked ? [...p, m.key] : p.filter((x) => x !== m.key)))}
                        />
                        <span className="choice__text">
                          {m.key}
                          <small>{m.why}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
            {step === 8 && (
              <div className="stack">
                <dl className="kv summary">
                  {[
                    ["Type", type, 0],
                    ["Period", period, 1],
                    ["Title", title, 2],
                    ["Result", result ? `${result} ${resultUnit}`.trim() : "", 3],
                    ["Beneficiaries", who ? `${who}${count ? `, ${count}` : ""}` : "", 4],
                    ["SDGs", sdgs.map((s) => `SDG ${s}`).join(", "), 5],
                    ["Evidence", [...files.map((f) => f.name), url].filter(Boolean).join(", "), 6],
                    ["Rankings", chosen.length ? `${chosen.length} indicators in ${rankingsCount} rankings` : "", 7],
                  ].map(([k, v, i]) => (
                    <div key={k as string} className="summary__row">
                      <dt>{k}</dt>
                      <dd>
                        <span>{v ? (v as string) : <span className="field__error">Missing</span>}</span>
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => go(i as number)} aria-label={`Edit ${k}`}>
                          Edit
                        </button>
                      </dd>
                    </div>
                  ))}
                </dl>
                <label className="choice" style={{ alignSelf: "flex-start" }}>
                  <input type="checkbox" checked={certified} onChange={(e) => setCertified(e.target.checked)} />I certify this submission is accurate and approved
                  by the unit head
                </label>
                {!complete.slice(0, 8).every(Boolean) && (
                  <Notice tone="warn">Some steps are incomplete. Save a draft now and finish later; the Office reviews complete submissions first.</Notice>
                )}
              </div>
            )}

            {showError && (
              <p className="field__error mt-4" role="alert">
                <Icon name="alert" size={15} /> {errors[step]}
              </p>
            )}
          </div>

          <footer className="wizard__nav">
            <button type="button" className="btn" onClick={() => go(Math.max(0, step - 1))} disabled={step === 0} aria-label="Back">
              <Icon name="arrow-left" size={18} /> <span className="hide-sm">Back</span>
            </button>
            <span className="row" style={{ ["--gap" as string]: "8px" } as CSSProperties}>
              <button type="button" className="btn btn--ghost" onClick={() => toast("Draft saved. You can finish it from Submission history.")}>
                <span>Save<span className="hide-sm"> draft</span></span>
              </button>
              {step < STEPS.length - 1 ? (
                <button type="button" className="btn btn--dark" onClick={next}>
                  Continue <Icon name="arrow" size={18} />
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={pending || uploading}
                  onClick={async () => {
                    if (errors.some(Boolean) && !skipChecks()) {
                      setTried(STEPS.map(() => true));
                      return;
                    }
                    setUploading(true);
                    const sent = await uploadEvidence(
                      files.map((f) => f.file),
                      { unitSlug: viewer?.portal.unitId ?? "" },
                    ).finally(() => setUploading(false));
                    if (!sent.ok) {
                      toast(sent.message, "error");
                      return;
                    }
                    const r = await run({
                      type: "evidence.submit",
                      unitSlug: viewer?.portal.unitId ?? "",
                      input: {
                        title,
                        type: type!,
                        period,
                        summary: desc,
                        result: `${result} ${resultUnit}`.trim(),
                        beneficiaries: `${who}${count ? `, ${count}` : ""}${verified ? `. Verified by ${verified}` : ""}`,
                        level: level as 1 | 2 | 3 | 4 | 5,
                        sdgs,
                        files: sent.files,
                        url,
                        mappedTo: matches.filter((m) => chosen.includes(m.key)).map((m) => m.key),
                      },
                    });
                    if (!r.ok) {
                      toast(r.message, "error");
                      return;
                    }
                    setRef(typeof r.data === "string" ? r.data : "");
                    setSent(true);
                  }}
                >
                  <Icon name="send" size={18} /> {uploading ? "Uploading files…" : "Submit for validation"}
                </button>
              )}
            </span>
          </footer>
        </Card>
      </div>

      <aside className="wizard__live" aria-live="polite" aria-label="Where this could count">
        <Card title="Where this could count" icon="layers" tone="dark">
          {matches.length === 0 ? (
            <p className="small" style={{ color: "var(--on-dark-2)" }}>
              Pick a data type and SDGs. The Hub suggests every ranking that can reuse this evidence, so you submit it once.
            </p>
          ) : (
            <>
              <p className="live__big">
                {rankingsCount} <span>{rankingsCount === 1 ? "ranking" : "rankings"}</span>
              </p>
              <ul className="live__list">
                {matches.map((m) => (
                  <li key={m.key} className={chosen.includes(m.key) ? "is-on" : undefined}>
                    <b>{m.ranking}</b> {m.indicator}
                    <span>{m.why}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </aside>
    </div>
  );
}
