"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import { inkOn, type Story } from "@/lib/data";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useViews } from "@/components/reference/ReferenceProvider";

const STEPS: { key: keyof Story; label: string; icon: IconName }[] = [
  { key: "challenge", label: "Challenge", icon: "alert" },
  { key: "response", label: "Thomasian response", icon: "innovation" },
  { key: "implementation", label: "Implementation", icon: "layers" },
  { key: "outcome", label: "Measurable outcome", icon: "target" },
  { key: "beneficiaries", label: "Beneficiaries", icon: "collaboration" },
];

/** The proposal's showcase format, in order, ending with replication guidance. */
export function StoryShowcase({ story: s, compact }: { story: Story; compact?: boolean }) {
  const { sdgColors, sdgNames } = useViews();
  return (
    <div className="showcase">
      {!compact && (
        <div className="showcase__photos">
          {s.images.map((src, i) => (
            <span key={src + i} className={`showcase__photo showcase__photo--${i}`}>
              <Image src={src} alt="" fill sizes={i === 0 ? "(max-width: 900px) 100vw, 50vw" : "25vw"} priority={i === 0} />
            </span>
          ))}
          <span className="showcase__fig">
            <b>{s.outcomeFigure}</b>
            <span>{s.outcomeLabel}</span>
          </span>
        </div>
      )}

      <div className="showcase__body">
        <ol className="journey">
          {STEPS.map((st, i) => (
            <li key={st.key}>
              <span className="journey__icon">
                <Icon name={st.icon} size={16} />
              </span>
              <span className="journey__n">{String(i + 1).padStart(2, "0")}</span>
              <h3>{st.label}</h3>
              <p>{s[st.key] as string}</p>
            </li>
          ))}
          <li>
            <span className="journey__icon">
              <Icon name="globe" size={16} />
            </span>
            <span className="journey__n">06</span>
            <h3>SDG and ranking alignment</h3>
            <div className="align">
              <ul className="align__sdgs">
                {s.sdgs.map((n) => (
                  <li key={n} style={{ background: sdgColors[n], color: inkOn(sdgColors[n]) } as CSSProperties}>
                    <b>{n}</b>
                    <span>{sdgNames[n]}</span>
                  </li>
                ))}
              </ul>
              <p className="small text-2">
                Counts in <b style={{ fontWeight: 600 }}>{s.rankings.join(", ")}</b>.
              </p>
            </div>
          </li>
          <li>
            <span className="journey__icon journey__icon--gold">
              <Icon name="arrow-up-right" size={16} />
            </span>
            <span className="journey__n">07</span>
            <h3>Replication guidance</h3>
            <p>{s.replication}</p>
          </li>
        </ol>

        <div className="showcase__aside">
          <div className="lesson">
            <p className="lesson__k">Lesson for other institutions</p>
            <p className="lesson__v">{s.lessons}</p>
          </div>
          <div className="evidence-note">
            <Icon name="evidence" size={18} />
            <p>
              <b>Supporting evidence.</b> {s.evidence}
            </p>
          </div>
          {!compact && (
            <dl className="glance">
              <div>
                <dt>Outcome</dt>
                <dd>{s.outcome}</dd>
              </div>
              <div>
                <dt>Beneficiaries</dt>
                <dd>{s.beneficiaries}</dd>
              </div>
              <div>
                <dt>Counts in</dt>
                <dd>{s.rankings.join(" · ")}</dd>
              </div>
            </dl>
          )}
        </div>
      </div>
    </div>
  );
}
