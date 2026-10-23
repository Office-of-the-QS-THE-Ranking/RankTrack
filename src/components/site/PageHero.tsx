import Image from "next/image";
import type { ReactNode } from "react";
import type { Photo } from "@/lib/site";

/**
 * Every inner page opens like the home page, smaller: the headline on the left and the motif cropped
 * by the right edge, either as a gold-ringed photograph or as a gold disc holding a figure.
 */
export function PageHero({
  title,
  lead,
  actions,
  photo,
  figure,
  long,
  id = "page-title",
}: {
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  photo?: Photo;
  figure?: { label?: string; value: string; note?: ReactNode };
  /** long titles (a ranking's full name, a story) are set one step smaller */
  long?: boolean;
  id?: string;
}) {
  return (
    <section className={`w-phero${figure ? " w-phero--figure" : ""}`} aria-labelledby={id}>
      <div className="w-phero__copy w-wrap">
        <h1 id={id} className={`w-phero__title ${long ? "w-phero__title--long" : "w-display"}`}>
          {title}
        </h1>
        {lead && <div className="w-phero__lead w-lead">{lead}</div>}
        {actions && <div className="w-actions w-phero__actions">{actions}</div>}
      </div>
      <div className="w-phero__disc">
        {photo ? (
          <div className="w-phero__photo">
            <Image src={photo.src} alt={photo.alt} fill preload sizes="(max-width: 900px) 120vw, 70vw" style={{ objectPosition: photo.pos }} />
          </div>
        ) : figure ? (
          <div className="w-phero__fig">
            {figure.label && <span className="w-phero__figlabel">{figure.label}</span>}
            <span className="w-phero__figval w-figure">{figure.value}</span>
            {figure.note && <span className="w-phero__fignote">{figure.note}</span>}
          </div>
        ) : null}
      </div>
    </section>
  );
}
