import Image from "next/image";
import { STAGES } from "@/lib/site";

/**
 * Accordion of tinted panels: the six stages of a contribution, dark to light in one hue of UST Gold.
 * Each stage is a radio button, so the row works without JavaScript; all six texts stay readable to
 * screen readers whichever is open.
 */
export function Process() {
  return (
    <section className="w-process w-section" aria-labelledby="process-title">
      <div className="w-process__intro w-wrap w-grid">
        <h2 id="process-title" className="w-head" data-reveal>
          Asked once, counted everywhere
        </h2>
        <p className="w-lead" data-reveal style={{ ["--d" as string]: "90ms" }}>
          Colleges, centres and offices send each piece of evidence once. The Office checks it, maps it to every indicator it supports and credits the
          unit in every ranking where it counts.
        </p>
      </div>
      <div className="w-wrap">
        <ol className="w-stages" aria-label="How a contribution becomes part of a result" data-reveal style={{ ["--d" as string]: "160ms" }}>
          {STAGES.map((s, i) => (
            <li key={s.name} className={`w-stage w-stage--${i + 1}`}>
              <input type="radio" name="stage" id={`stage-${i}`} className="w-stage__input" defaultChecked={i === 0} />
              <label htmlFor={`stage-${i}`} className="w-stage__tab">
                <span>{s.name}</span>
              </label>
              <div className="w-stage__body">
                <h3 className="w-stage__name">{s.name}</h3>
                <p className="w-stage__text">{s.text}</p>
                {s.count > 0 && (
                  <p className="w-stage__count">
                    <b className="w-figure">{s.count}</b> {s.countLabel} this cycle
                  </p>
                )}
                <span className="w-stage__pic">
                  <Image src={s.photo.src} alt="" fill sizes="(max-width: 900px) 40vw, 22vw" style={{ objectPosition: s.photo.pos }} />
                </span>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
