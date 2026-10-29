import Link from "next/link";
import { FormArt } from "@/components/forms/art";
import { ResponseMark, ago } from "@/components/forms/marks";
import { Tile } from "@/components/dashboard/Tile";
import { Welcome, count } from "@/components/dashboard/Welcome";
import { Icon } from "@/components/ui/Icon";
import { dayLabel } from "@/lib/forms/format";
import { copyPath } from "@/lib/forms/copies";
import { formKindLabel, studentPortalPath } from "@/lib/forms/kinds";
import { INCOMPLETE, STATUS_LABEL } from "@/lib/forms/review";
import type { ResponseStatus } from "@/lib/forms/types";
import type { StudentCopy } from "@/lib/governance/hub-types";
import type { StudentOverview } from "@/lib/governance/server/student-portal";
import type { Viewer } from "@/lib/governance/viewer";

type Stand = "draft" | ResponseStatus;

/** Where copies stand, in the order they move, each with its status tone. */
const STANDS: { key: Stand; tone: string }[] = [
  { key: "draft", tone: "missing" },
  { key: "received", tone: "review" },
  { key: "in-review", tone: "review" },
  { key: "returned", tone: "revise" },
  { key: "approved", tone: "ok" },
  { key: "declined", tone: "danger" },
];

const standLabel = (s: Stand) => (s === "draft" ? INCOMPLETE : STATUS_LABEL[s]);

/** Copies by where they stand: their proportions on one bar, then each count with its tone. */
function CopyMix({ copies }: { copies: StudentCopy[] }) {
  const mix = STANDS.map((s) => ({ ...s, n: copies.filter((c) => c.status === s.key).length })).filter((s) => s.n);
  if (!mix.length) return null;
  return (
    <div className="ov-pipe">
      <span className="ov-pipe__bar" aria-hidden="true">
        {mix.map((s) => (
          <i key={s.key} className={`is-${s.tone}`} style={{ flexGrow: s.n }} />
        ))}
      </span>
      <dl className="ov-pipe__legend">
        {mix.map((s) => (
          <div key={s.key}>
            <dt>
              <span className={`status status--${s.tone} ov-key`}>{standLabel(s.key)}</span>
            </dt>
            <dd>{s.n}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * A Student's dashboard (user, 2026-10-29): the Secretary of a student organization, commission or council. The
 * welcome says what's waiting (a copy returned for changes, an assignment to answer, a proposal in progress); the
 * tiles open the Student Portal's pages: Project Proposals, Assignments, Terminal Reports, and their own Evaluation
 * Forms and Registrations, with the copies they touched last.
 */
export function StudentDashboard({ viewer, data }: { viewer: Viewer; data: StudentOverview }) {
  const proposals = data.proposals.copies;
  const reports = data.reports.copies;
  const copies = [...proposals, ...reports].sort((a, b) => b.edited.at.localeCompare(a.edited.at));
  const todo = data.assignments.filter((a) => a.open && !a.answered).sort((a, b) => (a.closesOn ?? "9999").localeCompare(b.closesOn ?? "9999"));
  const returned = copies.filter((c) => c.status === "returned");
  const drafting = proposals.filter((c) => c.status === "draft");
  const forms = { evaluation: data.forms.filter((f) => f.kind === "evaluation"), registration: data.forms.filter((f) => f.kind === "registration") };

  const line = returned.length
    ? `${count(returned.length, "copy was", "copies were")} returned for changes.`
    : todo.length
      ? `${count(todo.length, "assignment", "assignments")} to answer.`
      : drafting.length
        ? `${count(drafting.length, "proposal", "proposals")} in progress.`
        : "You’re all caught up.";
  const action = returned.length
    ? { href: studentPortalPath(returned[0].form.kind), label: "See what to change" }
    : todo.length
      ? { href: "/portal/assignments", label: "Answer assignments" }
      : data.proposals.forms.length
        ? { href: "/portal/proposals", label: "Create a proposal" }
        : undefined;

  return (
    <div className="ov ud st-board">
      <header className="ov__head">
        <div className="ov__title-row">
          <h1 className="ov__title">Dashboard</h1>
          <span className="ud-aside">Student Portal</span>
        </div>
      </header>

      <Welcome
        name={viewer.name}
        line={line}
        action={action}
        badge={
          <span className="ov-welcome__badge">
            <Icon name="users" size={15} />
            {data.organization ? (
              <>
                <b>Secretary</b> · {data.organization}
              </>
            ) : (
              <b>Organization Secretary</b>
            )}
          </span>
        }
      />

      <div className="ov-bento st-bento">
        <Tile id="st-proposals" title="Project Proposals" href="/portal/proposals" className="st-proposals">
          <div className="ov-figrow">
            <p className="ov-value">
              {proposals.length}
              <small>{proposals.length === 1 ? "copy" : "copies"}</small>
            </p>
            <p className="ov-stat">
              <span>Approved</span>
              <b>{proposals.filter((c) => c.status === "approved").length}</b>
            </p>
          </div>
          {proposals.length ? <CopyMix copies={proposals} /> : <p className="ov-none">{data.proposals.forms.length ? "Build your first proposal." : "No proposal forms on the Student Portal yet."}</p>}
        </Tile>

        <Tile
          id="st-tasks"
          title={
            <>
              Assignments {todo.length > 0 && <span className="count">{todo.length}</span>}
            </>
          }
          href="/portal/assignments"
          className="st-tasks-tile"
        >
          {todo.length ? (
            <ul className="st-mini">
              {todo.slice(0, 3).map((a) => (
                <li key={a.id}>
                  <span className="st-mini__name">{a.title}</span>
                  <span className="st-mini__meta">{a.closesOn ? `Until ${dayLabel(a.closesOn)}` : a.from}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="st-clear">
              <Icon name="check-circle" size={18} />
              <span>{data.assignments.length ? "All answered" : "Nothing assigned"}</span>
            </div>
          )}
        </Tile>

        <Tile id="st-reports" title="Terminal Reports" href="/portal/terminal-reports" className="st-reports">
          <div className="ov-figrow">
            <p className="ov-value">
              {reports.length}
              <small>{reports.length === 1 ? "report" : "reports"}</small>
            </p>
            <p className="ov-stat">
              <span>Sent</span>
              <b>{reports.filter((c) => c.status !== "draft").length}</b>
            </p>
          </div>
          {reports.length ? <CopyMix copies={reports} /> : <p className="ov-none">{data.reports.forms.length ? "Report on a finished project." : "Terminal report forms come soon."}</p>}
        </Tile>

        <Tile id="st-forms" title="Your forms" className="st-forms-tile">
          <ul className="st-own">
            {(["evaluation", "registration"] as const).map((k) => {
              const list = forms[k];
              const live = list.filter((f) => f.status !== "draft").length;
              return (
                <li key={k}>
                  <Link href={studentPortalPath(k)} className="st-own__row">
                    <FormArt kind={k} size="sm" />
                    <span className="st-own__name">
                      <b>{k === "evaluation" ? "Evaluation Forms" : "Registrations"}</b>
                      <small>{list.length ? `${live} published · ${list.length - live} ${list.length - live === 1 ? "draft" : "drafts"}` : `Build a ${formKindLabel(k).toLowerCase()}`}</small>
                    </span>
                    <Icon name="chevron" size={16} className="st-own__go" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Tile>

        <Tile id="st-recent" title="Recently edited" className="ov-acts st-recent">
          {copies.length ? (
            <ul className="ov-acts__list">
              {copies.slice(0, 5).map((c) => (
                <li key={c.token}>
                  <a href={`${data.proposals.origin}${copyPath(c.form.code, c.token)}`} className="ov-act" target="_blank" rel="noopener noreferrer">
                    <span className="ov-act__what">{c.label}</span>
                    <ResponseMark status={c.status} />
                    <span className="ov-act__meta">
                      {c.ref} · {ago(c.edited.at)}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ov-none">Copies you build or join show here.</p>
          )}
        </Tile>
      </div>
    </div>
  );
}
