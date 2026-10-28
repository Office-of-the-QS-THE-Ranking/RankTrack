"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { Icon } from "@/components/ui/Icon";
import { Card } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { useGovern, useHub, useRankings, useViewer } from "@/components/hub/HubProvider";
import { Select } from "@/components/ui/pickers";

const TOPICS = [
  ["Understanding a requirement", "What a ranking is asking for"],
  ["Evidence standards", "Whether a document will be accepted"],
  ["Reporting period", "Which year or cycle to report"],
  ["Uploading a file", "A technical problem with the Hub"],
  ["Confirming official figures", "Reaching the data owner"],
  ["Something else", "Any other question for the Office"],
] as const;

export function RequestAssistance() {
  const [topic, setTopic] = useState<string>("");
  const [requirement, setRequirement] = useState("");
  const [ranking, setRanking] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("Email");
  const [tried, setTried] = useState(false);
  const [sent, setSent] = useState("");
  const hub = useHub();
  const viewer = useViewer();
  const RANKINGS = useRankings();
  const { run, pending } = useGovern();
  const unit = hub?.units.find((u) => u.slug === viewer?.portal.unitId);

  if (sent) {
    return (
      <Card className="sent">
        <span className="sent__mark" aria-hidden="true">
          <Icon name="help" size={26} />
        </span>
        <p className="eyebrow">
          Request {sent} · {topic}
        </p>
        <h2 className="sent__title">The Office has your request</h2>
        <p className="lead-text">
          A member of the Office will reply by {contact.toLowerCase()} within {urgent ? "one working day" : "two working days"}. You can keep
          working on your submissions in the meantime.
        </p>
        <div className="btns-row">
          <Link href="/portal" className="btn btn--dark">
            Back to my dashboard
          </Link>
          <Link href="/portal/workspace/knowledge#faq" className="btn">
            Browse frequently asked questions
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid cols-2-1">
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setTried(true);
          if ((!topic || message.trim().length < 10)) return;
          const detail = [requirement && `Requirement ${requirement}`, ranking && `Ranking ${ranking}`, `Reply by ${contact.toLowerCase()}`].filter(Boolean).join(" · ");
          const r = await run({ type: "assistance.request", unitSlug: viewer?.portal.unitId ?? "", topic, urgent, message: `${message.trim()}\n\n${detail}` });
          if (!r.ok) toast(r.message, "error");
          else setSent(typeof r.data === "string" ? r.data : "sent");
        }}
      >
        <Card title="What do you need help with?" icon="help">
          <div className="stack">
            <fieldset className="field">
              <legend className="sr-only">Topic</legend>
              <div className="choices choices--grid">
                {TOPICS.map(([t, d]) => (
                  <label key={t} className="choice">
                    <input type="radio" name="topic" checked={topic === t} onChange={() => setTopic(t)} />
                    <span className="choice__text">
                      {t}
                      <small>{d}</small>
                    </span>
                  </label>
                ))}
              </div>
              {tried && !topic && (
                <span className="field__error">
                  <Icon name="alert" size={14} /> Choose a topic.
                </span>
              )}
            </fieldset>
            <div className="grid cols-2">
              <label className="field">
                <span className="field__label">
                  Related requirement <em>(optional)</em>
                </span>
                <Select className="select" value={requirement} onChange={setRequirement}>
                  <option value="">None</option>
                  {(hub?.requirements ?? []).filter((r) => r.status !== "Validated").map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="field">
                <span className="field__label">
                  Related ranking <em>(optional)</em>
                </span>
                <Select className="select" value={ranking} onChange={setRanking}>
                  <option value="">None</option>
                  {RANKINGS.map((r) => (
                    <option key={r.slug}>{r.short}</option>
                  ))}
                </Select>
              </label>
            </div>
            <label className="field">
              <span className="field__label">Your question</span>
              <textarea
                className="textarea"
                value={message}
                aria-invalid={(tried && message.trim().length < 10) || undefined}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe what you are trying to do and where you are stuck."
              />
              {tried && message.trim().length < 10 ? (
                <span className="field__error">
                  <Icon name="alert" size={14} /> Write at least a sentence so the Office can help.
                </span>
              ) : (
                <span className="field__hint">Include the document name or figure if your question is about one.</span>
              )}
            </label>
            <div className="grid cols-2">
              <fieldset className="field">
                <legend className="field__label">How should we reply?</legend>
                <div className="choices">
                  {["Email", "Short meeting"].map((c) => (
                    <label key={c} className="choice">
                      <input type="radio" name="contact" checked={contact === c} onChange={() => setContact(c)} />
                      {c}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset className="field">
                <legend className="field__label">Timing</legend>
                <label className="choice" style={{ alignSelf: "flex-start" }}>
                  <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
                  Needed before a deadline this week
                </label>
              </fieldset>
            </div>
            <div className="row" style={{ justifyContent: "flex-end" } as CSSProperties}>
              <button type="submit" className="btn btn--primary btn--lg" disabled={pending}>
                <Icon name="send" size={18} /> Send request
              </button>
            </div>
          </div>
        </Card>
      </form>
      <div className="stack" style={{ ["--gap" as string]: "16px" } as CSSProperties}>
        <Card title="Quick answers" icon="knowledge" tone="tint">
          <ul className="list">
            <li>
              <Link href="/portal/workspace/knowledge#standards" className="list__main">
                What makes evidence acceptable
              </Link>
              <span className="list__sub">Five checks reviewers apply</span>
            </li>
            <li>
              <Link href="/portal/workspace/knowledge#calendar" className="list__main">
                Submission calendar
              </Link>
              <span className="list__sub">When each ranking collects data</span>
            </li>
            <li>
              <Link href="/portal/workspace/knowledge?q=public" className="list__main">
                Public evidence URLs
              </Link>
              <span className="list__sub">Why links behind a login are returned</span>
            </li>
          </ul>
        </Card>
        <Card title="Your coordinator" icon="user">
          <p className="small text-2">
            {unit ? `${unit.coordinator} coordinates ${unit.name}.` : "Your unit coordinator is your first contact."} The Office follows up on every request within two working days.
          </p>
        </Card>
      </div>
    </div>
  );
}
