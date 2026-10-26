import { useId } from "react";
import type { UnitProfileData } from "@/lib/governance/hub-types";
import { ROMAN, TIERS_ON_OFFER, metalOf, type AchievementState } from "@/lib/merit";
import { Meter, cx } from "@/components/ui/primitives";
import { Medal } from "./Medal";
import { ItemTitle, SectionTitle } from "./shared";

/** Earned first (highest tier first), then the nearest to earning. */
const order = (a: AchievementState, b: AchievementState) =>
  b.tier - a.tier || (b.goal ? b.count / b.goal : 1) - (a.goal ? a.count / a.goal : 1) || a.name.localeCompare(b.name);

/**
 * The unit's honours: the Office's citations, then every achievement in the cabinet, earned ones struck in
 * their metal and the rest blank with their progress. Those earned in the chosen cycle are marked new.
 */
export function Recognitions({ data, badges, cycle }: { data: UnitProfileData; badges: AchievementState[]; cycle: string }) {
  const id = useId();
  const earned = badges.reduce((a, b) => a + b.tier, 0);
  const struck = { steel: 0, gold: 0, onyx: 0 };
  for (const b of badges) for (let t = 1; t <= b.tier; t++) struck[metalOf(b, t)]++;
  const fresh = badges.reduce((a, b) => a + b.earned.filter((c) => c === cycle).length, 0);

  return (
    <div className="up-stack">
      <section className="up-cabinet-head" aria-labelledby={`${id}-cabinet`}>
        <div className="up-cabinet-head__count">
          <p className="up-eyebrow up-eyebrow--gold">Cabinet</p>
          <SectionTitle id={`${id}-cabinet`} className="up-cabinet-head__title">
            <b>{earned}</b> of {TIERS_ON_OFFER} achievements
          </SectionTitle>
          <Meter value={(earned / TIERS_ON_OFFER) * 100} tone="gold" label="Achievements earned" />
        </div>
        <dl className="up-cabinet-head__metals">
          <div>
            <dt>
              <i className="up-metal up-metal--steel" aria-hidden="true" /> Steel
            </dt>
            <dd>{struck.steel}</dd>
          </div>
          <div>
            <dt>
              <i className="up-metal up-metal--gold" aria-hidden="true" /> Gold
            </dt>
            <dd>{struck.gold}</dd>
          </div>
          <div>
            <dt>
              <i className="up-metal up-metal--onyx" aria-hidden="true" /> Onyx
            </dt>
            <dd>{struck.onyx}</dd>
          </div>
          <div>
            <dt>New in {cycle}</dt>
            <dd>{fresh}</dd>
          </div>
        </dl>
      </section>

      {data.recognition.length > 0 && (
        <div className="up-citations">
          {data.recognition.map((r) => (
            <article key={r.award} className="up-citation">
              <p className="up-eyebrow up-eyebrow--gold">Office citation · {data.currentCycle}</p>
              <ItemTitle className="up-citation__award">{r.award}</ItemTitle>
              <p className="up-citation__reason">{r.reason.replace(/\.?$/, ".")}</p>
            </article>
          ))}
        </div>
      )}

      <ul className="up-cabinet" aria-label="Achievements">
        {[...badges].sort(order).map((b) => {
          const isNew = b.earned.includes(cycle);
          const tiered = b.goals.length > 1;
          return (
            <li key={b.id} className={cx("up-badge", b.tier > 0 && "is-earned", isNew && "is-new")}>
              <Medal
                icon={b.icon}
                metal={b.tier ? metalOf(b, b.tier) : undefined}
                tier={tiered ? b.tier : undefined}
                progress={b.goal ? b.count / b.goal : 1}
                size={72}
                fresh={isNew}
              />
              <div className="up-badge__text">
                <ItemTitle className="up-badge__name">
                  {b.name}
                  {isNew && <span className="up-new">New</span>}
                </ItemTitle>
                <p className="up-badge__how">{b.how}</p>
                <div className="up-badge__foot">
                  <p className="up-badge__state">
                    {b.goal
                      ? `${b.count} of ${b.goal}${tiered ? ` for ${ROMAN[b.tier + 1]}` : ""}`
                      : `Earned ${b.earned[b.earned.length - 1]}`}
                  </p>
                  {tiered && (
                    <ol className="up-pips" aria-label={`Tier ${b.tier} of ${b.goals.length}`}>
                      {b.goals.map((g, i) => (
                        <li key={g} className={cx(i < b.tier && `is-${metalOf(b, i + 1)}`)}>
                          {ROMAN[i + 1]}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
