"use client";

/*
 * Request access, from the sign-in page: three steps (Profile, Affiliation, Declarations) and a receipt. A UST
 * email alone doesn't let anyone in, so Thomasians ask here too: Affiliation opens on Thomasian or External
 * partner. A Thomasian gives a UST email, their college, faculty or office, and position; an external partner
 * their affiliation and institution email. Each
 * step is a form of its own, so the browser's constraint checks, and the Hub's field messages, cover only the
 * fields in view, and Continue moves on once they pass. SignInFlow keeps the answers, so leaving for sign in and
 * coming back loses nothing; a sent request clears them.
 */
import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type MouseEvent } from "react";
import { requestAccess } from "@/app/actions/session";
import { Icon } from "@/components/ui/Icon";
import { DateField, Select } from "@/components/ui/pickers";
import { toast } from "@/components/ui/toast";
import {
  NO_SALUTATION,
  OTHER_SALUTATION,
  REVIEW_DAYS,
  SALUTATIONS,
  SPECIFY,
  asksWebsite,
  positionText,
  universityEmail,
  type RequesterKind,
  type RequestUnit,
  displayRequestBirthday,
  formatRequestBirthday,
  listedAffiliation,
  requestBirthday,
  requestText,
  salutationText,
} from "@/lib/governance/access-requests";
import { AffiliationField } from "./AffiliationField";

export type AccessDraft = {
  /** Thomasian or External partner; nothing until chosen. */
  kind: RequesterKind | "";
  lastName: string;
  firstName: string;
  middleName: string;
  salutation: string;
  otherSalutation: string;
  birthday: string;
  affiliation: string;
  organization: string;
  website: string;
  email: string;
  /** A Thomasian's college, faculty or office, and position. */
  unitId: string;
  position: string;
  /** One tick per declaration, in DECLARATIONS order. */
  agreed: boolean[];
};

export const EMPTY_DRAFT: AccessDraft = {
  kind: "",
  lastName: "",
  firstName: "",
  middleName: "",
  salutation: "",
  otherSalutation: "",
  birthday: "",
  affiliation: "",
  organization: "",
  website: "",
  email: "",
  unitId: "",
  position: "",
  agreed: [false, false, false],
};

const PARTS = ["Profile", "Affiliation", "Declarations"];

/** What the requester accepts before sending; the policies open in a new tab so the answers stay put. */
const DECLARATIONS = [
  <>The details I have given are true and complete, and the Office may ask me to confirm them.</>,
  <>
    I have read the{" "}
    <Link href="/privacy" target="_blank" rel="noopener">
      Data Privacy Notice
    </Link>{" "}
    and consent to the Office processing my details, including my birthday, to review this request.
  </>,
  <>
    I agree to the{" "}
    <Link href="/terms" target="_blank" rel="noopener">
      Terms of Use
    </Link>{" "}
    and will use any access granted only for its approved purpose.
  </>,
];

type Receipt = { reference: string; at: string; email: string; link: string };

/** The latest birthday the form takes: fifteen years before today (requestAccess checks the same). */
function youngest() {
  const today = new Date().toISOString().slice(0, 10);
  return `${Number(today.slice(0, 4)) - 15}${today.slice(4)}`;
}

const stamp = (iso: string) =>
  `${new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Manila" })} PHT`;

/** The step bar over the form: each step's number, ticked once passed. */
function Steps({ at }: { at: number }) {
  return (
    <ol className="si-steps" aria-label="Request steps">
      {PARTS.map((name, i) => (
        <li key={name} className={i < at ? "is-done" : i === at ? "is-current" : undefined} aria-current={i === at ? "step" : undefined}>
          <span className="si-steps__n" aria-hidden="true">
            {i < at ? <Icon name="check" size={12} strokeWidth={2.6} /> : i + 1}
          </span>
          <span className="si-steps__name">
            <span className="sr-only">{`Step ${i + 1} of ${PARTS.length}: `}</span>
            {name}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function RequestAccessForm({
  draft: d,
  onDraft,
  onTrack,
  onSignIn,
  domains,
  units,
}: {
  draft: AccessDraft;
  onDraft: (d: AccessDraft) => void;
  domains: string[];
  units: { label: string; units: RequestUnit[] }[];
  onTrack: (reference: string, email: string) => void;
  onSignIn: () => void;
}) {
  const [part, setPart] = useState(0);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [pending, start] = useTransition();
  const [affiliationFocused, setAffiliationFocused] = useState(false);
  const [editingBirthday, setEditingBirthday] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const done = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const set = (patch: Partial<AccessDraft>) => onDraft({ ...d, ...patch });
  const thomasian = d.kind === "thomasian";
  const website = d.kind === "external" && asksWebsite(d.affiliation) && !listedAffiliation(d.affiliation);
  const ustDomains = domains.map((x) => `@${x}`).join(" or ");
  // the email must match the choice: a UST address for a Thomasian, any other for an external partner
  const emailProblem = (email: string) =>
    !email.trim() || !d.kind
      ? ""
      : thomasian
        ? universityEmail(email, domains) ? "" : `Enter your UST email, ending in ${ustDomains}.`
        : universityEmail(email, domains) ? "That is a UST email. Choose Thomasian above." : "";
  const showWebsite = !affiliationFocused && website;
  const resumeBirthdayEdit = (input: HTMLInputElement) => {
    if (editingBirthday || !requestBirthday(d.birthday)) return;
    const selectedAll = input.selectionStart === 0 && input.selectionEnd === input.value.length;
    input.value = d.birthday;
    input.maxLength = 10;
    input.setSelectionRange(selectedAll ? 0 : d.birthday.length, d.birthday.length);
    setEditingBirthday(true);
  };

  // Keep Affiliation inactive on arrival; other steps focus their first field.
  useEffect(() => {
    if (!moved.current) return;
    if (receipt) done.current?.focus();
    else if (part !== 1) form.current?.querySelector<HTMLElement>("input:not([type=hidden]), button.pick-trigger, [role=combobox]")?.focus();
  }, [part, receipt]);

  const goTo = (to: number) => {
    moved.current = true;
    setPart(to);
  };

  const send = () =>
    start(async () => {
      if (!d.kind) return;
      const r = await requestAccess({
        ...d,
        kind: d.kind,
        affiliation: thomasian ? "" : d.affiliation,
        organization: thomasian ? "" : d.organization,
        unitId: thomasian ? d.unitId : "",
        position: thomasian ? d.position : "",
        birthday: requestBirthday(d.birthday),
        website: website ? d.website : "",
        agreed: d.agreed.every(Boolean),
      });
      if (!r.ok || !r.reference) {
        toast(r.message, "error");
        return;
      }
      moved.current = true;
      setReceipt({ reference: r.reference, at: r.at ?? new Date().toISOString(), email: d.email.trim().toLowerCase(), link: new URL(`/signin?track=${r.reference}`, location.origin).toString() });
      onDraft(EMPTY_DRAFT);
    });

  if (receipt) {
    const track = (e: MouseEvent<HTMLAnchorElement>) => {
      // a plain click opens the tracker here, with the email filled in; other clicks open the link as usual
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      onTrack(receipt.reference, receipt.email);
    };
    return (
      <>
        <Steps at={PARTS.length} />
        <div className="si__receipt">
          <div className="si__receipt-head">
            <span className="si__done-mark" aria-hidden="true">
              <Icon name="check" size={22} />
            </span>
            <div>
              <h2 className="si__title" ref={done} tabIndex={-1}>
                Request received
              </h2>
              <p className="si__sub">The Office reviews each request within {REVIEW_DAYS} working days.</p>
            </div>
          </div>
          <dl className="si__receipt-list">
            <div>
              <dt>Reference number</dt>
              <dd className="si__receipt-code">{receipt.reference}</dd>
            </div>
            <div>
              <dt>Date submitted</dt>
              <dd>
                <time dateTime={receipt.at}>{stamp(receipt.at)}</time>
              </dd>
            </div>
            <div>
              <dt>Tracker link</dt>
              <dd className="si__receipt-link">
                <a href={receipt.link} className="si__link si__link--inline" onClick={track}>
                  {receipt.link.replace(/^https?:\/\//, "")}
                </a>
                <button
                  type="button"
                  className="si__copy"
                  aria-label="Copy tracker link"
                  title="Copy tracker link"
                  onClick={() =>
                    navigator.clipboard.writeText(receipt.link).then(
                      () => toast("Tracker link copied.", "ok"),
                      () => toast("Couldn’t copy the link. Select it and copy it instead.", "error"),
                    )
                  }
                >
                  <Icon name="copy" size={15} />
                </button>
              </dd>
            </div>
          </dl>
          <p className="si__note">
            <Icon name="mail" size={14} />
            <span>
              A copy of this receipt is sent to <b>{receipt.email}</b>.
            </span>
          </p>
          <button type="button" className="si__primary" onClick={onSignIn}>
            <Icon name="arrow-left" size={16} /> Return to sign in
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <Steps at={part} />
      <form
        ref={form}
        key={part}
        className="si__form"
        onSubmit={(e) => {
          e.preventDefault();
          if (part < PARTS.length - 1) goTo(part + 1);
          else send();
        }}
      >
        {part === 0 && (
          <>
            <div className="si__pair">
              <label className="field">
                <span className="field__label">Last Name</span>
                <input className="input" name="lastName" title="" value={d.lastName} onChange={(e) => set({ lastName: requestText(e.target.value) })} autoComplete="family-name" required />
              </label>
              <label className="field">
                <span className="field__label">First Name</span>
                <input className="input" name="firstName" title="" value={d.firstName} onChange={(e) => set({ firstName: requestText(e.target.value) })} autoComplete="given-name" required />
              </label>
            </div>
            <div className="si__pair">
              <label className="field">
                <span className="field__label">
                  Middle Name <em>Optional</em>
                </span>
                <input className="input" name="middleName" title="" value={d.middleName} onChange={(e) => set({ middleName: requestText(e.target.value) })} autoComplete="additional-name" />
              </label>
              <label className="field">
                <span className="field__label">Preferred Salutation</span>
                <Select className="select" name="salutation" value={d.salutation} onChange={(salutation) => set({ salutation })} placeholder="Choose" required>
                  {[...SALUTATIONS, OTHER_SALUTATION, NO_SALUTATION].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            {d.salutation === OTHER_SALUTATION && (
              <label className="field">
                <span className="field__label">Your Salutation</span>
                <input
                  className="input"
                  name="otherSalutation"
                  title=""
                  value={d.otherSalutation}
                  onChange={(e) => set({ otherSalutation: salutationText(e.target.value) })}
                  placeholder="e.g. Arch."
                  autoComplete="honorific-prefix"
                  maxLength={24}
                  required
                />
              </label>
            )}
            <label className="field">
              <span className="field__label">Birthday</span>
              <span className="si__birthday">
                <input
                  className="input"
                  type="text"
                  placeholder="MM-DD-YYYY"
                  aria-label="Birthday"
                  autoComplete="bday"
                  maxLength={editingBirthday ? 10 : undefined}
                  name="birthday"
                  title=""
                  value={editingBirthday ? d.birthday : displayRequestBirthday(d.birthday)}
                  onFocus={() => setEditingBirthday(true)}
                  onBlur={() => setEditingBirthday(false)}
                  onClick={() => setEditingBirthday(true)}
                  onBeforeInput={(e) => resumeBirthdayEdit(e.currentTarget)}
                  onPaste={(e) => resumeBirthdayEdit(e.currentTarget)}
                  onKeyDown={(e) => {
                    if (e.key === "Backspace" || e.key === "Delete" || (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey)) {
                      resumeBirthdayEdit(e.currentTarget);
                    }
                  }}
                  onChange={(e) => {
                    const input = e.target;
                    const raw = input.value;
                    const caret = input.selectionStart ?? raw.length;
                    const digitsBeforeCaret = raw.slice(0, caret).replace(/\D/g, "").length;
                    const deleting = (e.nativeEvent as InputEvent).inputType?.startsWith("delete") ?? raw.length < d.birthday.length;
                    const value = formatRequestBirthday(raw, deleting);
                    let nextCaret = 0;
                    let seen = 0;
                    while (nextCaret < value.length && seen < digitsBeforeCaret) {
                      if (/\d/.test(value[nextCaret])) seen++;
                      nextCaret++;
                    }
                    if (!deleting && /[-/]/.test(value[nextCaret] ?? "")) nextCaret++;
                    input.value = value;
                    input.setSelectionRange(nextCaret, nextCaret);
                    const iso = requestBirthday(value);
                    e.target.setCustomValidity(
                      !value ? "" : !iso ? "Enter a valid date as MM-DD-YYYY or MM/DD/YYYY." : iso < "1900-01-01" || iso > youngest() ? "Enter a birthday from 01/01/1900 and at least 15 years ago." : "",
                    );
                    set({ birthday: value });
                    if (iso && iso >= "1900-01-01" && iso <= youngest()) setEditingBirthday(false);
                  }}
                  ref={(input) => {
                    // A calendar choice also clears a previous typed-date validation error.
                    const iso = requestBirthday(d.birthday);
                    if (input && iso && iso >= "1900-01-01" && iso <= youngest()) input.setCustomValidity("");
                  }}
                  required
                />
                <DateField
                  className="input si__birthday-calendar"
                  aria-label="Birthday calendar"
                  min="1900-01-01"
                  max={youngest()}
                  value={requestBirthday(d.birthday)}
                  onChange={(v) => {
                    const [year, month, day] = v.split("-");
                    set({ birthday: v ? `${month}-${day}-${year}` : "" });
                  }}
                />
              </span>
            </label>
          </>
        )}

        {part === 1 && (
          <>
            <fieldset className="si__kind">
              <legend className="field__label">I am</legend>
              {(
                [
                  ["thomasian", "Thomasian", "UST faculty, staff or office"],
                  ["external", "External partner", "Ranking body, accreditor or reviewer"],
                ] as const
              ).map(([kind, name, note]) => (
                <label key={kind} className="si__check si__kind-option">
                  <input type="radio" name="kind" title="" value={kind} checked={d.kind === kind} onChange={() => set({ kind })} data-missing="Choose Thomasian or External partner." required />
                  <span>
                    <b>{name}</b>
                    <small>{note}</small>
                  </span>
                </label>
              ))}
            </fieldset>

            {thomasian && (
              <>
                <label className="field">
                  <span className="field__label">College, Faculty or Office</span>
                  <Select className="select" name="unitId" value={d.unitId} onChange={(unitId) => set({ unitId })} placeholder="Choose" aria-label="College, Faculty or Office" required>
                    {units.map((g) => (
                      <optgroup key={g.label} label={g.label}>
                        {g.units.map((u) => (
                          <option key={u.id} value={u.id} data-depth={u.depth}>
                            {u.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </Select>
                </label>
                <label className="field">
                  <span className="field__label">Position or Designation</span>
                  <input
                    className="input"
                    name="position"
                    title=""
                    value={d.position}
                    onChange={(e) => set({ position: positionText(e.target.value) })}
                    placeholder="e.g. Associate Professor, Rankings Focal Person"
                    autoComplete="organization-title"
                    maxLength={120}
                    required
                  />
                </label>
              </>
            )}

            {d.kind === "external" && (
              <>
                <AffiliationField value={d.affiliation} onChange={(affiliation) => set({ affiliation })} onFocusChange={setAffiliationFocused} required />
                {listedAffiliation(d.affiliation) === SPECIFY && (
                  <label className="field">
                    <span className="field__label">Accreditation Organization</span>
                    <input
                      className="input"
                      name="organization"
                      title=""
                      value={d.organization}
                      onChange={(e) => set({ organization: requestText(e.target.value) })}
                      placeholder="E.G. ABET OR AACSB"
                      autoComplete="organization"
                      required
                    />
                  </label>
                )}
                <div className="si__verification" data-visible={showWebsite} inert={!showWebsite} aria-hidden={!showWebsite}>
                  <div className="si__verification-clip">
                    <label className="field">
                      <span className="field__label">
                        Organization Website <em>Optional, helps us verify</em>
                      </span>
                      <input
                        className="input"
                        type="url"
                        disabled={!showWebsite}
                        inputMode="url"
                        name="website"
                        title=""
                        value={d.website}
                        onChange={(e) => set({ website: e.target.value.trim() })}
                        placeholder="https://"
                        pattern="https://.+"
                        autoComplete="url"
                        spellCheck={false}
                        maxLength={200}
                      />
                    </label>
                  </div>
                </div>
              </>
            )}

            {d.kind && (
              <label className="field">
                <span className="field__label">{thomasian ? "UST Email" : "Institution Email"}</span>
                <input
                  className="input"
                  type="email"
                  name="email"
                  title=""
                  value={d.email}
                  onChange={(e) => {
                    e.target.setCustomValidity(emailProblem(e.target.value));
                    set({ email: e.target.value });
                  }}
                  ref={(input) => {
                    // switching between Thomasian and External partner rechecks the address already typed
                    input?.setCustomValidity(emailProblem(input.value));
                  }}
                  placeholder={thomasian ? `name@${domains[0] ?? "ust.edu.ph"}` : "name@institution.org"}
                  autoComplete="email"
                  required
                />
              </label>
            )}
          </>
        )}

        {part === 2 && (
          <fieldset className="si__declare">
            <legend className="field__label">Declarations</legend>
            {DECLARATIONS.map((text, i) => (
              <label key={i} className="si__check">
                <input
                  type="checkbox"
                  name={`declaration-${i + 1}`}
                  title=""
                  checked={d.agreed[i]}
                  onChange={(e) => set({ agreed: d.agreed.map((v, j) => (j === i ? e.target.checked : v)) })}
                  data-missing="Tick this box to send your request."
                  required
                />
                <span>{text}</span>
              </label>
            ))}
          </fieldset>
        )}

        <div className="si__nav">
          {part > 0 && (
            <button type="button" className="si__secondary" onClick={() => goTo(part - 1)} disabled={pending}>
              <Icon name="arrow-left" size={16} /> Back
            </button>
          )}
          {part < PARTS.length - 1 ? (
            <button type="submit" className="si__primary">
              Continue <Icon name="arrow" size={16} />
            </button>
          ) : (
            <button type="submit" className="si__primary" disabled={pending} aria-busy={pending}>
              <Icon name="send" size={16} /> {pending ? "Submitting…" : "Submit request"}
            </button>
          )}
        </div>
      </form>
    </>
  );
}
