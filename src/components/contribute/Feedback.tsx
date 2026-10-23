"use client";

import { useState, type CSSProperties } from "react";
import { formatDate } from "@/lib/data";
import { useGovern, useHub, useViewer } from "@/components/hub/HubProvider";
import { Icon } from "@/components/ui/Icon";
import { Card, Empty, Status } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { StageTrack } from "./StageTrack";

/** Respond to validation comments; a reply with a corrected file sends the item straight back to review. */
export function Feedback() {
  const hub = useHub();
  const viewer = useViewer();
  const { run, pending } = useGovern();
  const unitName = viewer?.portal.unitName ?? "";
  const mine = (hub?.evidence ?? []).filter((e) => e.comments.length > 0);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [file, setFile] = useState<Record<string, string>>({});
  const [err, setErr] = useState<Record<string, string>>({});
  const types = hub?.uploads.types ?? [];

  const send = async (id: string) => {
    const text = (draft[id] ?? "").trim();
    if (!text) {
      setErr((x) => ({ ...x, [id]: "Write a reply so the reviewer knows what changed." }));
      return;
    }
    const r = await run({ type: "evidence.respond", id, text, file: file[id] || undefined });
    if (!r.ok) {
      toast(r.message, "error");
      return;
    }
    toast("Resubmitted. The reviewer has been notified and the item is back in the queue.");
    setDraft((d) => ({ ...d, [id]: "" }));
    setFile((f) => ({ ...f, [id]: "" }));
    setErr((x) => ({ ...x, [id]: "" }));
  };

  const ordered = [...mine].sort((a, b) => (a.status === "Needs revision" ? -1 : b.status === "Needs revision" ? 1 : 0));
  if (!ordered.length) {
    return (
      <Card>
        <Empty icon="comment" title="No comments waiting">
          Reviewers&rsquo; comments on your submissions will appear here.
        </Empty>
      </Card>
    );
  }

  return (
    <div className="stack" style={{ ["--gap" as string]: "16px" } as CSSProperties}>
      {ordered.map((e) => {
        const st = e.status;
        return (
          <Card
            key={e.id}
            title={e.title}
            sub={
              <>
                <span className="num">{e.id}</span> · {e.period}
              </>
            }
            actions={<Status status={st} />}
            className={st === "Needs revision" ? "card--attention" : undefined}
          >
            <StageTrack stage={e.stage} status={st} />
            <div className="thread mt-6">
              {e.comments.map((c, i) => {
                const mineMsg = c.role === unitName || c.by === viewer?.name;
                return (
                  <div key={i} className={`thread__msg${mineMsg ? " thread__msg--mine" : ""}`}>
                    <span className={`avatar avatar--sm${mineMsg ? " avatar--gold" : ""}`} aria-hidden="true">
                      {c.by
                        .replace(/^(Engr|Dr|Ms|Mr|Ar)\.\s/, "")
                        .split(/[\s.]+/)
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((w) => w[0])
                        .join("")}
                    </span>
                    <div className="comment">
                      <p className="comment__who">
                        {c.by}, {c.role} · {formatDate(c.date)}
                      </p>
                      <p style={{ whiteSpace: "pre-line" }}>{c.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            {st === "Needs revision" && (
              <div className="stack mt-4" style={{ ["--gap" as string]: "12px" } as CSSProperties}>
                <label className="field">
                  <span className="field__label">Your reply</span>
                  <textarea
                    className="textarea"
                    value={draft[e.id] ?? ""}
                    aria-invalid={!!err[e.id] || undefined}
                    onChange={(ev) => {
                      setDraft((d) => ({ ...d, [e.id]: ev.target.value }));
                      if (ev.target.value.trim()) setErr((x) => ({ ...x, [e.id]: "" }));
                    }}
                    placeholder="Say what you changed, for example: removed the three FY2024 contracts and attached signed summaries."
                  />
                  {err[e.id] && (
                    <span className="field__error">
                      <Icon name="alert" size={14} /> {err[e.id]}
                    </span>
                  )}
                </label>
                <div className="btns-row">
                  <label className="btn">
                    <Icon name="paperclip" size={18} />
                    {file[e.id] || "Attach corrected file"}
                    <input
                      type="file"
                      className="sr-only"
                      accept={types.map((t) => `.${t.toLowerCase()}`).join(",")}
                      onChange={(ev) => setFile((f) => ({ ...f, [e.id]: ev.target.files?.[0]?.name ?? "" }))}
                    />
                  </label>
                  <button type="button" className="btn btn--dark" disabled={pending} onClick={() => void send(e.id)}>
                    <Icon name="send" size={18} /> Send and resubmit
                  </button>
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
