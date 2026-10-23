import Image from "next/image";
import Link from "next/link";
import type { Story } from "@/lib/data";
import { Icon } from "@/components/ui/Icon";
import { Pattern, SdgList } from "@/components/ui/primitives";

/** Initiative title, lead unit, beneficiaries, SDGs, rankings supported and one measurable outcome. */
export function StoryCard({ story: s, href, showState }: { story: Story; href: string; showState?: boolean }) {
  return (
    <Link href={href} className="card card--link story-card">
      <span className={`story-card__img${s.images[0] ? "" : " story-card__img--empty"}`}>
        {s.images[0] ? <Image src={s.images[0]} alt="" fill sizes="(max-width: 980px) 100vw, 33vw" /> : <Pattern fade="none" />}
        <span className="story-card__fig">
          <b>{s.outcomeFigure || "—"}</b>
          <span>{s.outcomeLabel || s.outcome}</span>
        </span>
      </span>
      <span className="story-card__body">
        <span className="row row--between">
          <span className="story-card__kind">
            {s.kind} · {s.year}
          </span>
          {showState && <span className={`chip${s.state === "Published" ? "" : " chip--gold"}`}>{s.state}</span>}
        </span>
        <span className="story-card__title">{s.title}</span>
        <span className="story-card__unit">{s.unit}</span>
        <span className="small text-2">
          <b style={{ fontWeight: 600 }}>Beneficiaries:</b> {s.beneficiaries}
        </span>
        <span className="story-card__meta">
          <SdgList sdgs={s.sdgs} />
          <span className="small muted">{s.rankings.length} rankings</span>
        </span>
        <span className="link small" style={{ alignSelf: "flex-start" }}>
          Read the story <Icon name="arrow" size={14} />
        </span>
      </span>
    </Link>
  );
}
