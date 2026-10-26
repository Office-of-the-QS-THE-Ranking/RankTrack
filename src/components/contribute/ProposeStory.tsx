"use client";

import Link from "next/link";
import { useState, type CSSProperties, type ReactNode } from "react";
import { IMPACT_THEMES, SDG_COLORS, SDG_NAMES, inkOn, type ImpactTheme } from "@/lib/data";
import { Icon } from "@/components/ui/Icon";
import { Card, Notice, Pattern, SdgList } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { useGovern, useHub, useRankings, useViewer } from "@/components/hub/HubProvider";
import { skipChecks } from "@/lib/dev-checks";

type Fields = {
  title: string;
  challenge: string;
  response: string;
  implementation: string;
  figure: string;
  figureLabel: string;
  beneficiaries: string;
  replication: string;
  lessons: string;
};

const REQUIRED: (keyof Fields)[] = ["title", "challenge", "response", "figure", "figureLabel", "beneficiaries"];
const LABELS: Partial<Record<keyof Fields, string>> = {
  title: "title",
  challenge: "challenge",
  response: "Thomasian response",
  figure: "outcome figure",
  figureLabel: "what the figure means",
  beneficiaries: "beneficiaries",
};

/** Propose an impact story in the showcase format, with a live preview of the public card. */
export function ProposeStory() {
  const [f, setF] = useState<Fields>({
    title: "",
    challenge: "",
    response: "",
    implementation: "",
    figure: "",
    figureLabel: "",
    beneficiaries: "",
    replication: "",
    lessons: "",
  });
  const [themes, setThemes] = useState<ImpactTheme[]>([]);
  const [sdgs, setSdgs] = useState<number[]>([]);
  const [rankings, setRankings] = useState<string[]>([]);
  const [evidence, setEvidence] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [tried, setTried] = useState(false);
  const [sent, setSent] = useState<{ id: string; requestId?: string } | null>(null);
  const hub = useHub();
  const viewer = useViewer();
  const RANKINGS = useRankings();
  const { run, pending } = useGovern();
  const mine = hub?.evidence ?? [];
  const unitName = viewer?.portal.unitName ?? "Your unit";
  const missing = REQUIRED.filter((k) => !f[k].trim());
  const err = (k: keyof Fields) => tried && !f[k].trim();

  const text = (k: keyof Fields, label: ReactNode, opts: { area?: boolean; placeholder?: string; hint?: string } = {}) => (
    <label className="field">
      <span className="field__label">{label}</span>
      {opts.area ? (
        <textarea className="textarea" value={f[k]} aria-invalid={err(k) || undefined} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder={opts.placeholder} />
      ) : (
        <input className="input" value={f[k]} aria-invalid={err(k) || undefined} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder={opts.placeholder} />
      )}
      {err(k) ? (
        <span className="field__error">
          <Icon name="alert" size={14} /> Required
        </span>
      ) : (
        opts.hint && <span className="field__hint">{opts.hint}</span>
      )}
    </label>
  );

  if (sent) {
    return (
      <Card className="sent">
        <span className="sent__mark" aria-hidden="true">
          <Icon name="check" size={28} strokeWidth={2.2} />
        </span>
        <p className="eyebrow">
          Story proposal {sent.id}
          {sent.requestId ? ` · publication request ${sent.requestId}` : ""}
        </p>
        <h2 className="sent__title">Proposal received</h2>
        <p className="lead-text">
          &ldquo;{f.title}&rdquo; now goes through the publication workflow: an evidence reviewer checks it against the evidence you linked, then a
          University Administrator approves it for the public Impact and Innovation page. You will be notified at each decision.
        </p>
        <div className="btns-row">
          <Link href="/portal" className="btn btn--dark">
            Back to my dashboard
          </Link>
          <Link href="/impact" className="btn">
            See published stories
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <div className="propose">
      <form
        className="stack"
        style={{ ["--gap" as string]: "16px" } as CSSProperties}
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setTried(true);
          if ((missing.length || !consent) && !skipChecks()) return;
          const r = await run({
            type: "story.propose",
            unitSlug: viewer?.portal.unitId ?? "",
            input: { title: f.title, challenge: f.challenge, response: f.response, figure: f.figure, figureLabel: f.figureLabel, beneficiaries: f.beneficiaries, sdgs, rankings, evidence },
          });
          if (!r.ok) toast(r.message, "error");
          else setSent({ id: typeof r.data === "string" ? r.data : "", requestId: r.requestId });
        }}
      >
        <Card title="The story" sub="Challenge → Thomasian response → implementation" icon="pen">
          <div className="stack">
            {text("title", "Title", { placeholder: "Streets that drain in minutes, not hours" })}
            {text("challenge", "Challenge", { area: true, placeholder: "What problem did people face?" })}
            {text("response", "Thomasian response", { area: true, placeholder: "What did the unit do about it?" })}
            {text("implementation", <>Implementation <em>(optional)</em></>, { area: true, placeholder: "How it was carried out, by whom and when." })}
          </div>
        </Card>
        <Card title="Outcome and beneficiaries" sub="One measurable outcome, and who it changed things for" icon="target">
          <div className="stack">
            <div className="grid cols-2">
              {text("figure", "Outcome figure", { placeholder: "63%", hint: "The single number readers will see first." })}
              {text("figureLabel", "What the figure means", { placeholder: "blood-pressure control, up from 41%" })}
            </div>
            {text("beneficiaries", "Beneficiaries", { placeholder: "1,150 enrolled patients in partner barangays" })}
            <fieldset className="field">
              <legend className="field__label">Supporting evidence</legend>
              <div className="choices">
                {mine.map((e) => (
                  <label key={e.id} className="choice">
                    <input type="checkbox" checked={evidence.includes(e.id)} onChange={() => setEvidence((v) => (v.includes(e.id) ? v.filter((x) => x !== e.id) : [...v, e.id]))} />
                    <span className="choice__text">
                      {e.title}
                      <small>
                        {e.id} · {e.status}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </Card>
        <Card title="Alignment" sub="Impact category, SDGs and rankings supported" icon="globe">
          <div className="stack">
            <fieldset className="field">
              <legend className="field__label">Impact and Innovation category</legend>
              <div className="pills">
                {IMPACT_THEMES.map((t) => (
                  <button key={t} type="button" className="pill" aria-pressed={themes.includes(t)} onClick={() => setThemes((v) => (v.includes(t) ? v.filter((x) => x !== t) : [...v, t]))}>
                    {t}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="field">
              <legend className="field__label">SDGs</legend>
              <div className="sdgpick sdgpick--compact">
                {Object.keys(SDG_NAMES).map((k) => {
                  const n = Number(k);
                  const on = sdgs.includes(n);
                  return (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={on}
                      title={SDG_NAMES[n]}
                      onClick={() => setSdgs((v) => (on ? v.filter((x) => x !== n) : [...v, n].sort((a, b) => a - b)))}
                      style={on ? ({ background: SDG_COLORS[n], color: inkOn(SDG_COLORS[n]), borderColor: SDG_COLORS[n] } as CSSProperties) : undefined}
                    >
                      <b>{n}</b>
                      <span className="sr-only">{SDG_NAMES[n]}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <fieldset className="field">
              <legend className="field__label">Rankings supported</legend>
              <div className="choices">
                {RANKINGS.map((r) => (
                  <label key={r.slug} className="choice">
                    <input type="checkbox" checked={rankings.includes(r.short)} onChange={() => setRankings((v) => (v.includes(r.short) ? v.filter((x) => x !== r.short) : [...v, r.short]))} />
                    {r.short}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </Card>
        <Card title="For other institutions" sub="What another university needs to adapt the practice" icon="arrow-up-right">
          <div className="stack">
            {text("replication", <>Replication guidance <em>(optional)</em></>, { area: true, placeholder: "Templates, protocols or designs you can share." })}
            {text("lessons", <>Lesson learned <em>(optional)</em></>, { placeholder: "One sentence another institution should know." })}
            <label className="choice" style={{ alignSelf: "flex-start" }}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              The unit head approves publishing this story once the Office has reviewed it
            </label>
            {tried && !consent && (
              <p className="field__error">
                <Icon name="alert" size={14} /> Confirm the unit head&rsquo;s approval to send the proposal.
              </p>
            )}
          </div>
        </Card>
        {tried && missing.length > 0 && (
          <Notice tone="warn" role="alert">
            Complete the required fields: {missing.map((k) => LABELS[k]).join(", ")}.
          </Notice>
        )}
        <div className="row row--between">
          <p className="small muted">The Office edits for length and checks every figure against its evidence.</p>
          <button type="submit" className="btn btn--primary btn--lg" disabled={pending}>
            <Icon name="send" size={18} /> Send proposal
          </button>
        </div>
      </form>

      <aside className="propose__preview" aria-label="Preview">
        <p className="eyebrow">Preview of the public card</p>
        <article className="card story-card">
          <span className="story-card__img story-card__img--empty">
            <Pattern fade="none" />
            <span className="story-card__fig">
              <b>{f.figure || "—"}</b>
              <span>{f.figureLabel || "your outcome figure"}</span>
            </span>
          </span>
          <span className="story-card__body">
            <span className="story-card__kind">{themes[0] ?? "Impact story"} · 2026</span>
            <span className="story-card__title">{f.title || "Your story title"}</span>
            <span className="story-card__unit">{unitName}</span>
            <span className="small text-2">
              <b style={{ fontWeight: 600 }}>Beneficiaries:</b> {f.beneficiaries || "—"}
            </span>
            <span className="story-card__meta">
              {sdgs.length ? <SdgList sdgs={sdgs} /> : <span className="small muted">No SDGs yet</span>}
              <span className="small muted">{rankings.length} rankings</span>
            </span>
          </span>
        </article>
      </aside>
    </div>
  );
}
