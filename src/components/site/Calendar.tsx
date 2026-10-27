import Image from "next/image";
import { siteData } from "@/lib/governance/server/site";
import { serverViews } from "@/lib/governance/server/views";

/** The submission year, October to March: one gold disc per month with what closes in it, beside the Carillon. */
export async function Calendar({ id = "calendar", title = "When each ranking collects data" }: { id?: string; title?: string }) {
  const { photos } = await serverViews();
  const calendar = (await siteData()).calendarMonths;
  return (
    <section id={id} className="w-cal w-section" aria-labelledby={`${id}-title`}>
      <div className="w-wrap">
        <div className="w-intro w-grid">
          <h2 id={`${id}-title`} className="w-head" data-reveal>
            {title}
          </h2>
          <div className="w-intro__aside" data-reveal style={{ ["--d" as string]: "90ms" }}>
            <p className="w-lead">
              Six months, October to March. Evidence validated before each window closes counts in every ranking that asks for it.
            </p>
          </div>
        </div>
        <div className="w-cal__body">
          <ol className="w-cal__months">
            {calendar.map((c, i) => (
              <li key={c.month} className="w-cal__month" data-reveal style={{ ["--d" as string]: `${i * 70}ms` }}>
                <span className="w-cal__name w-figure">{c.month}</span>
                <ul>
                  {c.items.map((it) => (
                    <li key={it}>{it}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          <div className="w-cal__disc" data-reveal="disc">
            <Image
              src={photos.carillon.src}
              alt={photos.carillon.alt}
              fill
              sizes="(max-width: 900px) 70vw, 30vw"
              style={{ objectPosition: photos.carillon.pos }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
