"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { STORIES, inkOn, type ImpactTheme, type Story } from "@/lib/data";
import { Icon } from "@/components/ui/Icon";
import { Empty, SdgList } from "@/components/ui/primitives";
import { Drawer, Segmented } from "@/components/ui/interactive";
import { toast } from "@/components/ui/toast";
import { useCan, useGovern, useHub, useRankings } from "@/components/hub/HubProvider";
import { StoryCard } from "./StoryCard";
import { StoryShowcase } from "./StoryShowcase";
import { useViews } from "@/components/reference/ReferenceProvider";

type Theme = "Impact Overview" | ImpactTheme;

export function ImpactLibrary({ mode }: { mode: "internal" | "public" }) {
  const { impactThemes, sdgColors, sdgNames } = useViews();
  const internal = mode === "internal";
  // Stories carry their publication state from the governance store; proposals from units are included.
  const hub = useHub();
  const can = useCan();
  const tracked = useRankings();
  const { run, pending } = useGovern();
  const all = hub?.stories ?? STORIES;
  const stories = internal ? all : all.filter((s) => s.state === "Published");
  const [theme, setTheme] = useState<Theme>("Impact Overview");
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const open = all.find((s) => s.slug === openSlug) ?? null;
  const href = (s: Story) => (internal ? `/admin/impact#${s.slug}` : `/impact/${s.slug}`);

  // Internal: a #slug opens the full story in a side panel, so links from the dashboard land on it.
  useEffect(() => {
    if (!internal) return;
    const sync = () => {
      setOpenSlug(location.hash.slice(1) || null);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [internal]);

  const options = useMemo(
    () => [
      { value: "Impact Overview" as Theme, label: "Impact overview", count: stories.length },
      ...impactThemes.map((t) => ({ value: t as Theme, label: t, count: stories.filter((s) => s.themes.includes(t)).length })),
    ],
    [stories, impactThemes],
  );
  const shown = theme === "Impact Overview" ? stories : stories.filter((s) => s.themes.includes(theme));
  const sdgs = new Set(stories.flatMap((s) => s.sdgs));
  const rankings = new Set(stories.flatMap((s) => s.rankings));
  const featured = shown.find((s) => s.images.length) ?? shown[0];
  const rest = shown.filter((s) => s !== featured);

  return (
    <>
      <nav aria-label="Impact and Innovation sections">
        <Segmented variant="pills" options={options} value={theme} onChange={setTheme} label="Show stories about" />
      </nav>

      {theme === "Impact Overview" && (
        <section className="card impact-summary" aria-label="Impact overview">
          <dl className="impact-summary__stats">
            <div>
              <dt>Stories documented</dt>
              <dd>{stories.length}</dd>
            </div>
            <div>
              <dt>SDGs addressed</dt>
              <dd>
                {sdgs.size}
                <small> of 17</small>
              </dd>
            </div>
            <div>
              <dt>Rankings supported</dt>
              <dd>
                {rankings.size}
                <small> of {tracked.length}</small>
              </dd>
            </div>
            <div>
              <dt>Replicable practices</dt>
              <dd>{stories.filter((s) => s.themes.includes("Replicable Practices")).length}</dd>
            </div>
          </dl>
          <div className="impact-summary__sdgs">
            <p className="small text-2">SDG coverage</p>
            <ul className="sdgstrip" aria-label={`SDGs addressed: ${[...sdgs].sort((a, b) => a - b).join(", ")}`}>
              {Array.from({ length: 17 }, (_, i) => i + 1).map((n) => (
                <li
                  key={n}
                  title={`SDG ${n}: ${sdgNames[n]}${sdgs.has(n) ? "" : " (no story yet)"}`}
                  className={sdgs.has(n) ? "is-on" : undefined}
                  style={sdgs.has(n) ? ({ background: sdgColors[n], color: inkOn(sdgColors[n]) } as CSSProperties) : undefined}
                >
                  {n}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {featured ? (
        <>
          <Link href={href(featured)} className="card card--link featured">
            <span className="featured__img">
              {featured.images[0] && <Image src={featured.images[0]} alt="" fill sizes="(max-width: 980px) 100vw, 45vw" />}
            </span>
            <span className="featured__body">
              <span className="row" style={{ ["--gap" as string]: "8px" } as CSSProperties}>
                <span className="chip chip--gold">Featured</span>
                <span className="story-card__kind">
                  {featured.kind} · {featured.year}
                </span>
                {internal && <span className="chip">{featured.state}</span>}
              </span>
              <span className="featured__title">{featured.title}</span>
              <span className="story-card__unit">{featured.unit}</span>
              <span className="featured__flow">
                <span>
                  <b>Challenge</b>
                  {featured.challenge}
                </span>
                <span>
                  <b>Thomasian response</b>
                  {featured.response}
                </span>
              </span>
              <span className="featured__outcome">
                <span className="featured__fig">{featured.outcomeFigure}</span>
                <span className="small text-2">{featured.outcomeLabel}</span>
              </span>
              <span className="row row--between" style={{ marginTop: "auto" } as CSSProperties}>
                <SdgList sdgs={featured.sdgs} />
                <span className="link">
                  Read the full story <Icon name="arrow" size={16} />
                </span>
              </span>
            </span>
          </Link>
          {rest.length > 0 && (
            <div className="grid cols-3 grid--stretch">
              {rest.map((s) => (
                <StoryCard key={s.slug} story={s} href={href(s)} showState={internal} />
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="card">
          <Empty icon="impact" title="No stories in this section yet">
            {internal ? "Units can propose a story from the contributor workspace." : "New stories are published as reviews are completed."}
          </Empty>
        </div>
      )}

      {internal && (
        <Drawer
          open={!!open}
          onClose={() => {
            setOpenSlug(null);
            history.replaceState(null, "", location.pathname);
          }}
          eyebrow={open ? `${open.kind} · ${open.state}` : ""}
          title={open?.title ?? ""}
          footer={
            open && (
              <>
                {open.state === "Published" ? (
                  <Link href={`/impact/${open.slug}`} className="btn">
                    <Icon name="eye" size={18} /> View on the public site
                  </Link>
                ) : (
                  <span className="small muted">Not public. Publication needs an evidence review and a University-wide Administrator&rsquo;s approval.</span>
                )}
                {can("stories", "approve") &&
                  (open.state === "Published" ? (
                    <button
                      type="button"
                      className="btn btn--danger"
                      disabled={pending}
                      onClick={async () => {
                        const r = await run({ type: "story.state", slug: open.slug, state: "Withdrawn" });
                        toast(r.message, r.ok ? "ok" : "error");
                      }}
                    >
                      Withdraw from the public site
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--dark"
                      disabled={pending}
                      onClick={async () => {
                        const r = await run({ type: "story.state", slug: open.slug, state: "Published" });
                        toast(r.message, r.ok ? "ok" : "error");
                      }}
                    >
                      <Icon name="send" size={18} /> Approve for publication
                    </button>
                  ))}
              </>
            )
          }
        >
          {open && (
            <>
              <p className="small text-2">{open.unit}</p>
              <StoryShowcase story={open} compact />
            </>
          )}
        </Drawer>
      )}
    </>
  );
}
