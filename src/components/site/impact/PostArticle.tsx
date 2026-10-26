"use client";

import Image from "next/image";
import Link from "next/link";
import { Fragment, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import { inkOn, type Story, type StoryPicture, type StoryPost } from "@/lib/data";
import { paragraphs } from "@/lib/governance/posts";
import { isRich, parseRich, plainText, serializeRich } from "@/lib/rich-text";
import { RichText } from "@/components/ui/RichText";
import { PageHero } from "../PageHero";
import { PostGallery } from "./PostGallery";
import { useViews } from "@/components/reference/ReferenceProvider";

const POSTED = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Manila" });

const URL_IN_TEXT = /(https?:\/\/[^\s<>"]*[^\s<>".,;:!?)'"])/g;

/** A paragraph as written: its line breaks kept, and web addresses made into links. */
function prose(text: string): ReactNode {
  return text.split("\n").map((line, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {line.split(URL_IN_TEXT).map((part, j) =>
        j % 2 ? (
          <a key={j} href={part} className="w-link" target="_blank" rel="noopener noreferrer">
            {part.replace(/^https?:\/\/(www\.)?/, "")}
          </a>
        ) : (
          part
        ),
      )}
    </Fragment>
  ));
}

/**
 * Alternating: each paragraph beside the next photo, the photo switching sides row by row. Paragraphs after the
 * photos run out follow as plain prose; photos left over after the last paragraph go to the gallery.
 */
function Alternating({ body, rich, text, photos }: { body: string; rich: boolean; text: string[]; photos: StoryPicture[] }) {
  const blocks: ReactNode[] = rich
    ? parseRich(body)
        .filter((b) => b.kind !== "p" || b.kids.length)
        .map((b, i) => <RichText key={i} html={serializeRich([b])} linkClassName="w-link" block={() => ({ className: i === 0 ? "w-post__first" : undefined })} />)
    : text.map((t, i) => (
        <p key={i} className={i === 0 ? "w-post__first" : undefined}>
          {prose(t)}
        </p>
      ));
  return (
    <>
      {blocks.map((b, i) => {
        const pic = photos[i];
        if (!pic) return <div key={i} data-reveal>{b}</div>;
        return (
          <div key={i} className={`w-post__alt${i % 2 ? " w-post__alt--flip" : ""}`} data-reveal>
            <div className="w-post__alttext">{b}</div>
            <figure className="w-post__altpic">
              <Image src={pic.src} alt={pic.alt} fill sizes="(max-width: 900px) 100vw, 45vw" />
            </figure>
          </div>
        );
      })}
    </>
  );
}

/**
 * A post written in the Office's composer: the thumbnail in the hero, then the story, its photos and the goals it
 * serves. No server code, so the composer's preview tab draws the same page from a draft.
 */
export function PostArticle({ story: s, post: p, related }: { story: Pick<Story, "slug" | "title" | "unit" | "postedAt" | "sdgs">; post: StoryPost; related: Story[] }) {
  const { photos, sdgColors, sdgNames } = useViews();
  const cover = p.thumbnail ?? p.photos[0] ?? null;
  // The layout chosen in the composer: where the cover sits and how the gallery meets the story.
  const layout = p.layout ?? "cover";
  const heroPhoto = layout === "cover" || layout === "split" || layout === "magazine";
  const rich = isRich(p.body);
  const text = rich ? (plainText(p.body).trim() ? [p.body] : []) : paragraphs(p.body);
  const alternate = layout === "alternate" && text.length > 0;
  // Alternating pairs one photo with each paragraph; the gallery keeps whatever is left.
  const paired = alternate ? (rich ? parseRich(p.body).filter((b) => b.kind !== "p" || b.kids.length).length : text.length) : 0;
  const gallery = p.photos.slice(paired);

  const byline = (
    <p className="w-post__byline">
      {s.unit}
      {s.postedAt && (
        <>
          {" · "}
          <time dateTime={s.postedAt}>{POSTED.format(new Date(s.postedAt))}</time>
        </>
      )}
    </p>
  );
  const back = (
    <Link href="/impact" className="w-link">
      All impact stories
    </Link>
  );

  return (
    <>
      {layout === "banner" ? (
        // Banner: the title set over the full-width cover.
        <section className="w-post-banner" aria-labelledby="page-title">
          {cover && <Image src={cover.src} alt={cover.alt} fill preload sizes="100vw" className="w-post-banner__img" />}
          <div className="w-post-banner__copy w-wrap">
            <h1 id="page-title" className="w-phero__title w-phero__title--long">
              {s.title}
            </h1>
            <div className="w-post-banner__lead">
              {p.subtitle && <p>{p.subtitle}</p>}
              {byline}
            </div>
            <div className="w-actions">{back}</div>
          </div>
        </section>
      ) : (
        <PageHero
          long
          title={s.title}
          lead={
            <>
              {p.subtitle && <p>{p.subtitle}</p>}
              {byline}
            </>
          }
          actions={back}
          photo={heroPhoto ? (cover ? { src: cover.src, alt: cover.alt } : photos.courtyard) : undefined}
        />
      )}

      {(text.length > 0 || p.photos.length > 0) && (
        <section className="w-section w-wrap" aria-labelledby="post-title">
          <h2 id="post-title" className="w-head w-rows__title" data-reveal>
            {text.length ? "The story" : "Photos"}
          </h2>
          {layout === "feature" && cover && (
            <figure className="w-post__feature" data-reveal>
              <Image src={cover.src} alt={cover.alt} fill sizes="(max-width: 900px) 100vw, 1200px" />
            </figure>
          )}
          <div className={`w-post w-post--${layout}`}>
            {text.length > 0 && (
              <div className="w-post__body">
                {alternate ? (
                  <Alternating body={p.body} rich={rich} text={text} photos={p.photos} />
                ) : rich ? (
                  <RichText html={p.body} linkClassName="w-link" block={(i) => ({ className: i === 0 ? "w-post__first" : undefined, "data-reveal": "" } as HTMLAttributes<HTMLElement>)} />
                ) : (
                  text.map((t, i) => (
                    <p key={i} className={i === 0 ? "w-post__first" : undefined} data-reveal>
                      {prose(t)}
                    </p>
                  ))
                )}
                {p.hashtags.length > 0 && (
                  <ul className="w-post__tags" aria-label="Hashtags" data-reveal>
                    {p.hashtags.map((h) => (
                      <li key={h}>#{h}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {gallery.length > 0 && <PostGallery photos={gallery} title={s.title} />}
          </div>
        </section>
      )}

      {s.sdgs.length > 0 && (
        <section className="w-band w-band--stone" aria-labelledby="goals-title">
          <div className="w-wrap">
            <div className="w-intro w-grid">
              <h2 id="goals-title" className="w-head" data-reveal>
                Where it counts
              </h2>
              <div className="w-intro__aside" data-reveal style={{ ["--d" as string]: "90ms" }}>
                <p className="w-lead">This story serves {s.sdgs.length === 1 ? "one" : s.sdgs.length} of the 17 Sustainable Development Goals.</p>
              </div>
            </div>
            <ul className="w-sdgs w-sdgs--sm">
              {s.sdgs.map((n, i) => (
                <li key={n} className="w-sdg" style={{ background: sdgColors[n], color: inkOn(sdgColors[n]), ["--d" as string]: `${i * 80}ms` } as CSSProperties} data-reveal>
                  <span className="w-sdg__n w-figure">{n}</span>
                  <span className="w-sdg__name">{sdgNames[n]}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {related.length > 0 && (
        <section className="w-section w-wrap w-related-stories" aria-labelledby="more-title">
          <h2 id="more-title" className="w-head" data-reveal>
            More stories
          </h2>
          <ul className="w-storyrows">
            {related.map((o, i) => (
              <li key={o.slug} data-reveal style={{ ["--d" as string]: `${i * 70}ms` }}>
                <Link href={`/impact/${o.slug}`} className="w-storyrow">
                  <span className="w-storyrow__pic">
                    <Image src={o.images[0]} alt="" fill sizes="120px" />
                  </span>
                  <span className="w-storyrow__title">{o.title}</span>
                  <span className="w-storyrow__unit">{o.unit}</span>
                  <span className="w-storyrow__fig">
                    {o.outcomeFigure && <b className="w-figure">{o.outcomeFigure}</b>} {o.outcomeLabel}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
