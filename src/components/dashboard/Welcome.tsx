import Image from "next/image";
import Link from "next/link";
// imported rather than referenced by path: the URL then carries the file's hash, so a re-render is never served stale
import building from "../../../public/images/main-building-3d.webp";
import { daysUntil } from "@/lib/data";
import type { Hub } from "@/lib/governance/server/hub";
import { viewerCan, type Viewer } from "@/lib/governance/viewer";
import { Tile } from "./Tile";

/** By the hour in Manila, where the University keeps its hours. */
function greeting(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-PH", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Manila" }).format(now));
  return hour >= 5 && hour < 12 ? "Good morning" : hour >= 12 && hour < 18 ? "Good afternoon" : "Good evening";
}

/** The first name as people write it: directory names often arrive in capitals. */
function firstName(name: string) {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return first === first.toUpperCase() ? first.toLowerCase().replace(/(^|[-'’])(\p{L})/gu, (_, mark: string, letter: string) => mark + letter.toUpperCase()) : first;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The dashboard's welcome: a greeting, what is waiting today in one line, and the next step, on the night
 * scene the sign-in opens with (the Main Building's render, lit for the night).
 */
export function Welcome({ h, viewer }: { h: Hub; viewer: Viewer | null }) {
  const evidence = h.evidence.filter((e) => viewerCan(viewer, "evidence", "view", { unitId: e.unitSlug }));
  const review = evidence.filter((e) => e.status === "For review").length;
  const revise = evidence.filter((e) => e.status === "Needs revision").length;
  const next = h.rankings.filter((r) => daysUntil(r.deadline) >= 0).sort((a, b) => a.deadline.localeCompare(b.deadline))[0];
  const days = next ? daysUntil(next.deadline) : 0;
  const name = viewer ? firstName(viewer.name) : "";

  const work = review
    ? `${count(review, "submission", "submissions")} to review.`
    : revise
      ? `${count(revise, "item", "items")} back for revision.`
      : "Nothing is waiting for review.";
  const due = next && `${next.short} closes ${days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}.`;

  return (
    <Tile id="ov-hello" className="ov-welcome">
      <div className="ov-welcome__text">
        <h2 id="ov-hello" className="ov-welcome__title">
          {greeting()}
          {name && `, ${name}`}
        </h2>
        <p className="ov-welcome__sub">
          {work}
          {due && ` ${due}`}
        </p>
        {review > 0 ? (
          <Link href="/admin/contribute" className="btn btn--sm ov-welcome__btn">
            Review submissions
          </Link>
        ) : (
          next && (
            <Link href={`/admin/rankings/${next.slug}`} className="btn btn--sm ov-welcome__btn">
              Open {next.short}
            </Link>
          )
        )}
      </div>
      <div className="ov-welcome__scene" aria-hidden="true">
        <Image src={building} className="ov-welcome__art" alt="" fill loading="eager" sizes="(max-width: 620px) 80vw, 480px" />
      </div>
    </Tile>
  );
}
