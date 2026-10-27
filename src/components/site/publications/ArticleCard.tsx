import Image from "next/image";
import Link from "next/link";
import type { StoryCard } from "./cards";

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Manila" });

export const shortDate = (iso: string) => DAY.format(new Date(iso));

/**
 * One story in the newsroom. The whole card is the link; its title names it. `lead` is the front page's
 * opening story, `card` a story in a grid, `row` a line in the archive with its picture in the seal's circle.
 */
export function ArticleCard({ card: c, variant = "card", headingLevel = 3, priority }: { card: StoryCard; variant?: "lead" | "card" | "row"; headingLevel?: 2 | 3; priority?: boolean }) {
  const H = headingLevel === 2 ? "h2" : "h3";
  const sizes = variant === "lead" ? "(max-width: 900px) 100vw, 58vw" : variant === "row" ? "120px" : "(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 30vw";
  return (
    <Link href={`/publications/stories/${c.slug}`} className={`w-acard w-acard--${variant}`}>
      <span className="w-acard__pic">
        {c.image && <Image src={c.image.src} alt="" fill sizes={sizes} preload={priority} />}
      </span>
      <span className="w-acard__text">
        <span className="w-acard__section">{c.section}</span>
        <H className="w-acard__title">{c.title}</H>
        {variant !== "row" && c.dek && <span className="w-acard__dek">{c.dek}</span>}
        {variant === "lead" && c.figure && (
          <span className="w-acard__fig">
            <b className="w-figure">{c.figure.value}</b> {c.figure.label}
          </span>
        )}
        <span className="w-acard__meta">
          <span className="w-acard__unit">{c.unit}</span>
          <span>
            <time dateTime={c.date}>{shortDate(c.date)}</time> · {c.minutes} min read
          </span>
        </span>
      </span>
    </Link>
  );
}
