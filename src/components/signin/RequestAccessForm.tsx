"use client";

/*
 * Request access, from the sign-in page: three steps (Profile, Affiliation, Declarations) and a receipt. A UST
 * email alone doesn't let anyone in, so Thomasians ask here too: they pick University of Santo Tomas as their
 * affiliation, then their role (Administrator, Coordinator or Student), whether they belong to a University Office
 * or a College/Faculty (Students only the second), and which one. They prove their UST email by signing in to
 * Google the way sign-in does (/auth/verify-email, back to this step), which puts a check on the field. An external partner gives
 * their affiliation and institution email. Each step is a form of its own, so the browser's constraint
 * checks, and the Hub's field messages, cover only the fields in view, and Continue moves on once they pass. SignInFlow keeps the answers, so leaving for sign in and
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
  SECTIONS,
  UST_ROLES,
  DRAFT_KEY,
  asksWebsite,
  sectionsFor,
  isThomasian,
  universityEmail,
  emailProblem,
  withRole,
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
  /** The UST email this browser proved with Google, if any. */
  verified: string;
  /** A Thomasian's role, whether in a University Office or a College/Faculty ("offices" or "academic"), and which one. */
  roleId: string;
  section: string;
  unitId: string;
  /** One tick per declaration, in DECLARATIONS order. */
  agreed: boolean[];
};

export const EMPTY_DRAFT: AccessDraft = {
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
  verified: "",
  roleId: "",
  section: "",
  unitId: "",
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

const stamp = (iso: string) => `${new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Manila" })} PHT`;

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
  startPart = 0,
}: {
  draft: AccessDraft;
  onDraft: (d: AccessDraft) => void;
  domains: string[];
  units: { label: string; units: RequestUnit[] }[];
  onTrack: (reference: string, email: string) => void;
  onSignIn: () => void;
  /** The step to open on: Affiliation when coming back from verifying the email. */
  startPart?: number;
}) {
  const [part, setPart] = useState(startPart);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [pending, start] = useTransition();
  const [affiliationFocused, setAffiliationFocused] = useState(false);
  const [editingBirthday, setEditingBirthday] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const done = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const set = (patch: Partial<AccessDraft>) => onDraft({ ...d, ...patch });
  const thomasian = isThomasian(d.affiliation);
  const website = !thomasian && asksWebsite(d.affiliation) && !listedAffiliation(d.affiliation);
  const email = d.email.trim().toLowerCase();
  const ust = universityEmail(email, domains);
  // the units of the chosen section: University Offices, or Faculty/Colleges
  const sectionUnits = units.find((g) => g.label === SECTIONS.find((x) => x.key === d.section)?.label)?.units ?? [];
  const unitLabel = d.section === "offices" ? "Office" : "College/Faculty";
  const verified = ust && d.verified === email;
  // the email must match the affiliation: a UST address for the University, any other for an external partner
  const emailIssue = (value: string) => emailProblem(value, d.affiliation, domains, "self");

  // Like sign-in, verifying leaves for Google; the answers wait in this tab and come back with the result (SignInFlow).
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    // the browser's Back from Google can restore this page as it was left
    const back = (e: PageTransitionEvent) => e.persisted && setLeaving(false);
    window.addEventListener("pageshow", back);
    return () => window.removeEventListener("pageshow", back);
  }, []);
  const verify = () => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    } catch {
      toast("Your browser won’t keep your answers while you verify. Allow site storage, then try again.", "error");
      return;
    }
    setLeaving(true);
    location.assign(`/auth/verify-email?email=${encodeURIComponent(email)}`);
  };
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
      const r = await requestAccess({
        ...d,
        organization: thomasian ? "" : d.organization,
        roleId: thomasian ? d.roleId : "",
        section: thomasian ? d.section : "",
        unitId: thomasian ? d.unitId : "",
        birthday: requestBirthday(d.birthday),
        website: website ? d.website : "",
        agreed: d.agreed.every(Boolean),
      });
      if (!r.ok || !r.reference) {
        toast(r.message, "error");
        return;
      }
      moved.current = true;
      setReceipt({
        reference: r.reference,
        at: r.at ?? new Date().toISOString(),
        email: d.email.trim().toLowerCase(),
        link: new URL(`/signin?track=${r.reference}`, location.origin).toString(),
      });
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
          // a UST email moves on only once Google has vouched for it; Continue opens the window if it hasn't
          if (part === 1 && ust && !verified) verify();
          else if (part < PARTS.length - 1) goTo(part + 1);
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
            <AffiliationField value={d.affiliation} onChange={(affiliation) => set({ affiliation })} onFocusChange={setAffiliationFocused} required />

            {thomasian && (
              <div className={sectionsFor(d.roleId).length > 1 ? "si__pair si__pair--affiliation" : undefined}>
                <label className="field">
                  <span className="field__label">Role</span>
                  <Select
                    className="select"
                    name="roleId"
                    value={d.roleId}
                    // a Student has only College/Faculty; a unit chosen in another section goes
                    onChange={(roleId) => set(withRole(roleId, d.section, d.unitId))}
                    placeholder="Choose"
                    aria-label="Role"
                    required
                  >
                    {UST_ROLES.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </Select>
                </label>

                {sectionsFor(d.roleId).length > 1 && (
                  <label className="field">
                    <span className="field__label">Unit</span>
                    <Select
                      className="select"
                      name="section"
                      value={d.section}
                      onChange={(section) => set({ section, unitId: section === d.section ? d.unitId : "" })}
                      placeholder="Choose"
                      aria-label="Unit"
                      required
                    >
                      {SECTIONS.map((x) => (
                        <option key={x.key} value={x.key}>
                          {x.name}
                        </option>
                      ))}
                    </Select>
                  </label>
                )}
              </div>
            )}

            {thomasian && d.section && (
              <label className="field">
                <span className="field__label">{unitLabel}</span>
                <Select key={d.section} className="select" name="unitId" value={d.unitId} onChange={(unitId) => set({ unitId })} placeholder="Type or choose" aria-label={unitLabel} searchable required>
                  {sectionUnits.map((u) => (
                    <option key={u.id} value={u.id} data-depth={u.depth}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </label>
            )}

            {!thomasian && (
              <>
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

            <label className="field">
              <span className="field__label">{thomasian ? "UST Email" : "Institution Email"}</span>
              <span className="si__email" data-adorned={ust || undefined}>
                <input
                  className="input"
                  type="email"
                  name="email"
                  title=""
                  value={d.email}
                  onChange={(e) => {
                    e.target.setCustomValidity(emailIssue(e.target.value));
                    set({ email: e.target.value });
                  }}
                  ref={(input) => {
                    // changing the affiliation rechecks the address already typed
                    input?.setCustomValidity(emailIssue(input.value));
                  }}
                  aria-describedby={verified ? "si-email-verified" : undefined}
                  placeholder={thomasian ? `name@${domains[0] ?? "ust.edu.ph"}` : "name@institution.org"}
                  autoComplete="email"
                  spellCheck={false}
                  required
                />
                {verified ? (
                  <span className="si__email-mark" id="si-email-verified" title="">
                    <Icon name="check" size={14} strokeWidth={2.6} />
                    <span className="sr-only">Verified with Google</span>
                  </span>
                ) : (
                  ust && (
                    <button type="button" className="si__email-verify" onClick={verify} disabled={leaving} aria-busy={leaving}>
                      <Icon name="shield-check" size={14} /> {leaving ? "Opening…" : "Verify"}
                    </button>
                  )
                )}
              </span>
            </label>
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
                  onChange={(e) =>
                    set({
                      agreed: d.agreed.map((v, j) => (j === i ? e.target.checked : v)),
                    })
                  }
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
