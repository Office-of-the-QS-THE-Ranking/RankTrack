"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { Icon } from "@/components/ui/Icon";
import { Card, Notice } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { useGovern, useViewer } from "@/components/hub/HubProvider";
import { Select } from "@/components/ui/pickers";
import { skipChecks } from "@/lib/dev-checks";
import { useViews } from "@/components/reference/ReferenceProvider";

const STAGES = ["Discover", "Screen", "Develop", "Document", "Submit", "Recognize and scale"];
const READINESS = ["Idea only", "Pilot running", "Results measured", "Results verified", "Replicated elsewhere"];

/** Propose an innovation for the WURI pipeline: Discover → Screen → Develop → Document → Submit → Recognize and scale. */
export function ProposeInnovation() {
  const { wuriCategories } = useViews();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [stage, setStage] = useState(1);
  const [problem, setProblem] = useState("");
  const [novelty, setNovelty] = useState("");
  const [impact, setImpact] = useState("");
  const [scale, setScale] = useState("");
  const [partners, setPartners] = useState("");
  const [ready, setReady] = useState(1);
  const [tried, setTried] = useState(false);
  const [sent, setSent] = useState("");
  const viewer = useViewer();
  const { run, pending } = useGovern();

  const required = { name, category, problem, novelty, impact };
  const missing = Object.entries(required).filter(([, v]) => !v.trim()).map(([k]) => k);
  const bad = (v: string) => tried && !v.trim();

  if (sent) {
    return (
      <Card className="sent">
        <span className="sent__mark" aria-hidden="true">
          <Icon name="innovation" size={26} />
        </span>
        <p className="eyebrow">
          Innovation {sent} · {category}
        </p>
        <h2 className="sent__title">In the pipeline</h2>
        <p className="lead-text">
          &ldquo;{name}&rdquo; enters the WURI pipeline at <b>{STAGES[stage]}</b>. The Office screens new proposals each month against
          novelty, outcome evidence and scalability, and tells you what evidence would strengthen it.
        </p>
        <ol className="pipeline-steps" aria-label="WURI pipeline">
          {STAGES.map((s, i) => (
            <li key={s} className={i < stage ? "is-done" : i === stage ? "is-now" : undefined}>
              {s}
            </li>
          ))}
        </ol>
        <div className="btns-row">
          <Link href="/portal" className="btn btn--dark">
            Back to my dashboard
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <form
      className="stack"
      style={{ ["--gap" as string]: "16px" } as CSSProperties}
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        setTried(true);
        if (missing.length && !skipChecks()) return;
        const r = await run({ type: "innovation.propose", unitSlug: viewer?.portal.unitId ?? "", name, category });
        if (!r.ok) toast(r.message, "error");
        else setSent(typeof r.data === "string" ? r.data : "received");
      }}
    >
      <Card title="Where it is in the pipeline" icon="layers">
        <ol className="pipeline-steps pipeline-steps--pick" role="radiogroup" aria-label="Pipeline stage">
          {STAGES.map((s, i) => (
            <li key={s}>
              <button type="button" role="radio" aria-checked={stage === i} onClick={() => setStage(i)} className={i < stage ? "is-done" : undefined}>
                <span>{i + 1}</span>
                {s}
              </button>
            </li>
          ))}
        </ol>
      </Card>
      <div className="grid cols-2">
        <Card title="The innovation" icon="innovation">
          <div className="stack">
            <label className="field">
              <span className="field__label">Name</span>
              <input className="input" value={name} aria-invalid={bad(name) || undefined} onChange={(e) => setName(e.target.value)} placeholder="Low-cost physics kits for public schools" />
            </label>
            <label className="field">
              <span className="field__label">WURI category</span>
              <Select className="select" value={category} aria-invalid={bad(category) || undefined} onChange={setCategory}>
                <option value="">Choose a category</option>
                {wuriCategories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </label>
            <label className="field">
              <span className="field__label">Problem it addresses</span>
              <textarea className="textarea" value={problem} aria-invalid={bad(problem) || undefined} onChange={(e) => setProblem(e.target.value)} placeholder="Who faced the problem, and why existing approaches fell short." />
            </label>
          </div>
        </Card>
        <Card title="Why it qualifies" icon="target">
          <div className="stack">
            <label className="field">
              <span className="field__label">What is new about it?</span>
              <textarea className="textarea" value={novelty} aria-invalid={bad(novelty) || undefined} onChange={(e) => setNovelty(e.target.value)} placeholder="Novelty compared with practice elsewhere." />
            </label>
            <label className="field">
              <span className="field__label">Outcome and impact so far</span>
              <textarea className="textarea" value={impact} aria-invalid={bad(impact) || undefined} onChange={(e) => setImpact(e.target.value)} placeholder="Measured results, with numbers where you have them." />
            </label>
            <label className="field">
              <span className="field__label">
                Scalability and replication <em>(optional)</em>
              </span>
              <input className="input" value={scale} onChange={(e) => setScale(e.target.value)} placeholder="Could another campus or city adopt it? What would they need?" />
            </label>
            <label className="field">
              <span className="field__label">
                Partners <em>(optional)</em>
              </span>
              <input className="input" value={partners} onChange={(e) => setPartners(e.target.value)} placeholder="Industry, government or community partners" />
            </label>
          </div>
        </Card>
      </div>
      <Card title="Evidence readiness" sub="How far the evidence goes today" icon="evidence">
        <div className="choices choices--grid" role="radiogroup" aria-label="Evidence readiness">
          {READINESS.map((r, i) => (
            <label key={r} className="choice">
              <input type="radio" name="ready" checked={ready === i} onChange={() => setReady(i)} />
              <span className="choice__text">
                <small>Level {i + 1}</small>
                {r}
              </span>
            </label>
          ))}
        </div>
      </Card>
      {tried && missing.length > 0 && (
        <Notice tone="warn" role="alert">
          Complete the name, category, problem, novelty and outcome fields to send the proposal.
        </Notice>
      )}
      <div className="row row--between">
        <p className="small muted">Proposals are screened monthly. Strong candidates are developed with the Office before submission.</p>
        <button type="submit" className="btn btn--primary btn--lg" disabled={pending}>
          <Icon name="send" size={18} /> Send to the pipeline
        </button>
      </div>
    </form>
  );
}
