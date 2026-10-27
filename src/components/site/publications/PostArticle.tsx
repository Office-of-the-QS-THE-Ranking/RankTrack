"use client";

import Image from "next/image";
import Link from "next/link";
import { Fragment, type HTMLAttributes, type ReactNode } from "react";
import type { Story, StoryPicture, StoryPost } from "@/lib/data";
import { paragraphs, readingMinutes } from "@/lib/governance/posts";
import { isRich, parseRich, plainText, serializeRich } from "@/lib/rich-text";
import { RichText } from "@/components/ui/RichText";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/toast";
import { PostGallery } from "./PostGallery";
import { ArticleCard } from "./ArticleCard";
import { storyCard } from "./cards";
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

/** Share through the device's own sheet where there is one, else copy the link. */
function ShareButton({ title, slug }: { title: string; slug: string }) {
  const share = async () => {
    const url = `${window.location.origin}/publications/stories/${slug}`;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // Closing the share sheet is not an error worth reporting.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied.", "ok");
    } catch {
      toast("Could not copy the link. Copy it from the address bar.", "error");
    }
  };
  return (
    <button type="button" className="w-article__share" onClick={share}>
      <Icon name="link" size={16} /> Share
    </button>
  );
}

/**
 * A post written in the Office's composer, set as an article: the headline, standfirst and byline, the cover
 * where the chosen layout puts it, the story in a reading column, then the goals it serves and more stories.
 * No server code, so the composer's preview tab draws the same page from a draft.
 */
export function PostArticle({
  story: s,
  post: p,
  related,
}: {
  story: Pick<Story, "slug" | "title" | "unit" | "postedAt" | "sdgs"> & { themes?: readonly string[] };
  post: StoryPost;
  related: Story[];
}) {
  const { photos, sdgNames, sdgIcons } = useViews();
  const cover = p.thumbnail ?? p.photos[0] ?? null;
  // The layout chosen in the composer: where the cover sits and how the gallery meets the story.
  const layout = p.layout ?? "cover";
  const besideTitle = cover && (layout === "cover" || layout === "split" || layout === "magazine");
  const rich = isRich(p.body);
  const text = rich ? (plainText(p.body).trim() ? [p.body] : []) : paragraphs(p.body);
  const alternate = layout === "alternate" && text.length > 0;
  // Alternating pairs one photo with each paragraph; the gallery keeps whatever is left.
  const paired = alternate ? (rich ? parseRich(p.body).filter((b) => b.kind !== "p" || b.kids.length).length : text.length) : 0;
  const gallery = p.photos.slice(paired);
  // Split, Magazine and Alternating use the full width; the others keep a reading column with the notes beside it.
  const wide = layout === "split" || layout === "magazine" || layout === "alternate";
  const section = s.themes?.[0];
  const minutes = text.length ? readingMinutes(p.body) : 0;

  const crumbs = (
    <nav className="w-article__crumbs" aria-label="Breadcrumb">
      <Link href="/publications/stories">Stories &amp; News</Link>
      {section && (
        <>
          <Icon name="chevron" size={14} />
          <Link href={`/publications/stories?theme=${encodeURIComponent(section)}#stories`}>{section}</Link>
        </>
      )}
    </nav>
  );
  const byline = (
    <div className="w-article__byline">
      <p>
        <span className="w-article__unit">{s.unit}</span>
        <span className="w-article__when">
          {s.postedAt && <time dateTime={s.postedAt}>{POSTED.format(new Date(s.postedAt))}</time>}
          {s.postedAt && minutes > 0 && " · "}
          {minutes > 0 && `${minutes} min read`}
        </span>
      </p>
      <ShareButton title={s.title} slug={s.slug} />
    </div>
  );

  return (
    <article className={`w-article w-article--${layout}`}>
      {layout === "banner" ? (
        // Banner: the title set over the full-width cover.
        <header className="w-post-banner" aria-labelledby="page-title">
          {cover && <Image src={cover.src} alt={cover.alt} fill preload sizes="100vw" className="w-post-banner__img" />}
          <div className="w-post-banner__copy w-wrap">
            {crumbs}
            <h1 id="page-title" className="w-article__title">
              {s.title}
            </h1>
            {p.subtitle && <p className="w-article__dek">{p.subtitle}</p>}
            {byline}
          </div>
        </header>
      ) : (
        <header className={`w-article__head w-wrap${besideTitle ? " w-article__head--cover" : ""}`}>
          <div className="w-article__headtext">
            {crumbs}
            <h1 id="page-title" className="w-article__title">
              {s.title}
            </h1>
            {p.subtitle && <p className="w-article__dek">{p.subtitle}</p>}
            {byline}
          </div>
          {besideTitle && (
            <figure className="w-article__cover" data-reveal="shutter">
              <Image src={cover.src} alt={cover.alt} fill preload sizes="(max-width: 900px) 100vw, 46vw" />
            </figure>
          )}
        </header>
      )}

      {layout === "feature" && cover && (
        <figure className="w-article__feature w-wrap" data-reveal="shutter">
          <span className="w-article__featurepic">
            <Image src={cover.src} alt={cover.alt} fill preload sizes="(max-width: 900px) 100vw, 1400px" />
          </span>
          {cover.alt && <figcaption>{cover.alt}</figcaption>}
        </figure>
      )}

      {(text.length > 0 || p.photos.length > 0 || s.sdgs.length > 0) && (
        <div className={`w-article__main w-wrap${wide ? " w-article__main--wide" : ""}`}>
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
              </div>
            )}
            {gallery.length > 0 && <PostGallery photos={gallery} title={s.title} />}
          </div>

          {(s.sdgs.length > 0 || p.hashtags.length > 0) && (
            <aside className="w-article__notes" aria-label="About this story">
              {s.sdgs.length > 0 && (
                <div className="w-article__note" data-reveal>
                  <h2 className="w-article__notehead">{s.sdgs.length === 1 ? "The goal it serves" : `The ${s.sdgs.length} goals it serves`}</h2>
                  <ul className="w-article__goals">
                    {s.sdgs.map((n) => (
                      <li key={n}>
                        <Link href={`/publications/stories?sdg=${n}#stories`} className="w-article__goal">
                          {sdgIcons[n] ? <img src={sdgIcons[n]} alt="" width={44} height={44} loading="lazy" /> : <span className="w-article__goalnum w-figure">{n}</span>}
                          <span>
                            <b>SDG {n}</b> {sdgNames[n]}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {p.hashtags.length > 0 && (
                <div className="w-article__note" data-reveal>
                  <h2 className="w-article__notehead">Tagged</h2>
                  <ul className="w-post__tags" aria-label="Hashtags">
                    {p.hashtags.map((h) => (
                      <li key={h}>#{h}</li>
                    ))}
                  </ul>
                </div>
              )}
            </aside>
          )}
        </div>
      )}

      <section className="w-band w-band--stone w-article__more" aria-labelledby="more-title">
        <div className="w-wrap">
          <div className="w-article__morehead">
            <h2 id="more-title" className="w-head" data-reveal>
              {related.length ? "More stories" : "Stories & News"}
            </h2>
            <Link href="/publications/stories" className="w-link" data-reveal>
              All stories <Icon name="arrow" size={16} />
            </Link>
          </div>
          {related.length > 0 && (
            <ul className="w-news__grid">
              {related.map((o, i) => (
                <li key={o.slug} data-reveal style={{ ["--d" as string]: `${i * 70}ms` }}>
                  <ArticleCard card={storyCard(o, photos)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </article>
  );
}
