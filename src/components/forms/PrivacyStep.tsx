"use client";

/*
 * Step 0 of every Digital Form: the data privacy notice, read at a glance. What the form collects (six tiles), how
 * the Office of the QS/THE Rankings and UST SIMBAHAYAN each use it (an onyx card and a gold one; a unit or a student
 * organization that made the form gets a paper card of its own across them), three promises,
 * the respondent's rights folded away, then the two statements to agree to. Continue opens the first question only
 * when both are ticked (lib/forms/privacy.ts holds the words; the server refuses a response without them).
 */
import { Icon } from "@/components/ui/Icon";
import { plural } from "@/lib/forms/format";
import { PRIVACY_COLLECTS, PRIVACY_CONTACT, PRIVACY_LAW, PRIVACY_PROMISES, PRIVACY_RIGHTS, PRIVACY_STATEMENTS, privacyUsers, statementText, type PrivacyMaker, type PrivacyStatement } from "@/lib/forms/privacy";

export function PrivacyStep({ steps, agreed, maker, onChange, onContinue }: { steps: number; agreed: PrivacyStatement[]; maker?: PrivacyMaker; onChange: (v: PrivacyStatement[]) => void; onContinue: () => void }) {
  const left = PRIVACY_STATEMENTS.filter((s) => !agreed.includes(s.id)).length;
  return (
    <form
      className="fr-card fr-step-card fr-privacy"
      aria-labelledby="fr-title-privacy"
      onSubmit={(e) => {
        e.preventDefault();
        onContinue();
      }}
    >
      <header className="fr-card__head">
        <span className="fr-card__eyebrow">
          <Icon name="shield-check" size={15} />
          Step 0 of {steps}
          <span className="fr-card__dot" aria-hidden="true" />
          Before you begin
        </span>
        <h2 className="fr-card__title" id="fr-title-privacy">
          Data privacy
        </h2>
        <p className="fr-pv-lead">
          <span className="fr-pv-law">
            <Icon name="shield" size={13} />
            {PRIVACY_LAW.name}
            <small>{PRIVACY_LAW.ref}</small>
          </span>
        </p>
        <span className="fr-card__num" aria-hidden="true">
          00
        </span>
      </header>

      <section className="fr-pv-sec" aria-labelledby="fr-pv-collects">
        <h3 className="fr-pv-label" id="fr-pv-collects">
          What we collect
        </h3>
        <ul className="fr-pv-collects">
          {PRIVACY_COLLECTS.map((c) => (
            <li key={c.label}>
              <span className="fr-pv-ico" aria-hidden="true">
                <Icon name={c.icon} size={17} />
              </span>
              <span>
                <b>{c.label}</b>
                <small>{c.note}</small>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="fr-pv-sec" aria-labelledby="fr-pv-users">
        <h3 className="fr-pv-label" id="fr-pv-users">
          Who uses it
        </h3>
        <div className="fr-pv-users">
          {privacyUsers(maker).map((u) => (
            <article key={u.id} className="fr-pv-user" data-office={u.id}>
              <header>
                <span className="fr-pv-user__mark" aria-hidden="true">
                  <Icon name={u.icon} size={19} />
                </span>
                <span>
                  <b>{u.name}</b>
                  <small>{u.role}</small>
                </span>
              </header>
              <ul>
                {u.uses.map((use) => (
                  <li key={use}>
                    <Icon name="check" size={13} strokeWidth={2.6} />
                    {use}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <ul className="fr-pv-promises" aria-label="Our promises">
        {PRIVACY_PROMISES.map((p) => (
          <li key={p.title}>
            <Icon name={p.icon} size={18} />
            <span>
              <b>{p.title}</b>
              <small>{p.text}</small>
            </span>
          </li>
        ))}
      </ul>

      <details className="fr-pv-rights">
        <summary>
          <Icon name="scroll" size={16} />
          Your rights under the Act
          <span className="fr-pv-rights__count">{PRIVACY_RIGHTS.length}</span>
          <Icon name="chevron-down" size={16} className="fr-pv-rights__chev" />
        </summary>
        <div className="fr-pv-rights__body">
          <ul>
            {PRIVACY_RIGHTS.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p>
            <Icon name="mail" size={14} />
            {PRIVACY_CONTACT}
          </p>
        </div>
      </details>

      <section className="fr-pv-sec" aria-labelledby="fr-pv-agree">
        <h3 className="fr-pv-label" id="fr-pv-agree">
          Agree to begin
        </h3>
        <ul className="fr-pv-agree">
          {PRIVACY_STATEMENTS.map((s) => (
            <li key={s.id}>
              <label className="choice fr-pv-agree__card" data-on={agreed.includes(s.id) || undefined}>
                <input
                  type="checkbox"
                  name={`privacy-${s.id}`}
                  checked={agreed.includes(s.id)}
                  required
                  data-missing="Tick this box to continue."
                  onChange={(e) => onChange(e.target.checked ? PRIVACY_STATEMENTS.map((x) => x.id).filter((x) => x === s.id || agreed.includes(x)) : agreed.filter((x) => x !== s.id))}
                />
                <span>
                  <b>{s.title}</b>
                  <small>{statementText(s, maker)}</small>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <footer className="fr-dock">
        <span className="fr-dock__spacer" />
        <span className="fr-saved">
          <Icon name="lock" size={14} />
          <span>{left ? `${plural(left, "box", "boxes")} to tick` : "Ready to begin"}</span>
        </span>
        <button type="submit" className="w-btn w-btn--ink fr-go">
          I agree, begin
          <span className="fr-go__disc" aria-hidden="true">
            <Icon name="arrow" size={15} />
          </span>
        </button>
      </footer>
    </form>
  );
}
