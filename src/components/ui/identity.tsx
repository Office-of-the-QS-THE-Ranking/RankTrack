"use client";

/* Ranking and SDG identity marks: their colours and names are reference data (lib/reference.ts). */
import Link from "next/link";
import type { CSSProperties } from "react";
import { inkOn, type FamilyKey } from "@/lib/data";
import { familyOf } from "@/lib/reference";
import { useReference } from "@/components/reference/ReferenceProvider";
import { cx } from "./primitives";

export function Swatch({ family, bar, title }: { family: FamilyKey; bar?: boolean; title?: string }) {
  return (
    <i
      className={cx("sw", bar && "sw--bar")}
      style={{ ["--c" as string]: familyOf(useReference(), family).band, background: familyOf(useReference(), family).band } as CSSProperties}
      aria-hidden={title ? undefined : true}
      title={title}
    />
  );
}

export function RankingChip({ slug, href }: { slug: string; href?: string | false }) {
  const r = useReference().rankings.find((x) => x.slug === slug);
  if (!r) return null;
  const inner = (
    <>
      <Swatch family={r.family} />
      {r.short}
    </>
  );
  return href === false ? (
    <span className="chip chip--outline">{inner}</span>
  ) : (
    <Link href={href ?? `/admin/rankings/${r.slug}`} className="chip chip--outline">
      {inner}
    </Link>
  );
}

export function RankingName({ slug }: { slug: string }) {
  const r = useReference().rankings.find((x) => x.slug === slug);
  if (!r) return null;
  return (
    <span className="row nowrap" style={{ gap: 8 }}>
      <Swatch family={r.family} />
      {r.short}
    </span>
  );
}

export function Sdg({ n, withName }: { n: number; withName?: boolean }) {
  const { sdgColors, sdgNames } = useReference();
  return (
    <span className="row" style={{ gap: 8 }}>
      <span className="sdg" style={{ background: sdgColors[n], color: inkOn(sdgColors[n]) }} title={`SDG ${n}: ${sdgNames[n]}`}>
        {n}
        {!withName && <span className="sr-only">{`: ${sdgNames[n]}`}</span>}
      </span>
      {withName && <span className="small">{sdgNames[n]}</span>}
    </span>
  );
}
