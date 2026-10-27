"use client";

/*
 * Invite someone (Accounts): the Request access form's questions, rules and conditions (RequestAccessForm),
 * asked by an administrator for the person they invite, in three steps. Profile: names and salutation.
 * Affiliation: University of Santo Tomas brings a role, a University Office or College/Faculty and which one,
 * on a UST email; any other affiliation makes them an External partner, a guest of the Office, on an email
 * outside the University, with the accreditation organization or website the request form asks for. Access:
 * who they are at a glance, when access ends (an External partner's always does, GUEST_DAYS from today unless
 * changed), the scope and what the role can do. Each step is a form of its own, so the Hub's field messages
 * cover only the fields in view; the server checks the same rules again (person-details.ts). The birthday and
 * the declarations stay with Request access: they are the requester's own proof and consent.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AffiliationField } from "@/components/signin/AffiliationField";
import { Icon } from "@/components/ui/Icon";
import { DateField, Select } from "@/components/ui/pickers";
import {
  GUEST_DAYS,
  NO_SALUTATION,
  OTHER_SALUTATION,
  SALUTATIONS,
  SECTIONS,
  SPECIFY,
  SPECIFY_LABEL,
  UST_ROLES,
  asksWebsite,
  emailProblem,
  isThomasian,
  listedAffiliation,
  requestText,
  salutationText,
  sectionsFor,
  withRole,
} from "@/lib/governance/access-requests";
import { HUB_OFFICE, ROLE } from "@/lib/governance/catalog";
import { requestUnits } from "@/lib/governance/directory";
import { UNIVERSITY, has, permissionsAt, roleScope, unitScope } from "@/lib/governance/rbac";
import type { Scope } from "@/lib/governance/types";
import { viewerCan } from "@/lib/governance/viewer";
import { PermissionMatrix, ScopeEditor, diffCell } from "../parts";
import { Block, Disclosure, Field, KV, Sheet, useAct, useConsole } from "../ui";

type Draft = {
  lastName: string;
  firstName: string;
  middleName: string;
  salutation: string;
  otherSalutation: string;
  affiliation: string;
  organization: string;
  website: string;
  email: string;
  /** A Thomasian's role, whether in a University Office or a College/Faculty ("offices" or "academic"), and which one. */
  roleId: string;
  section: string;
  unitId: string;
  /** Empty: none for a Thomasian, GUEST_DAYS from today for an External partner. */
  expires: string;
};

const EMPTY: Draft = {
  lastName: "",
  firstName: "",
  middleName: "",
  salutation: "",
  otherSalutation: "",
  affiliation: "",
  organization: "",
  website: "",
  email: "",
  roleId: "",
  section: "",
  unitId: "",
  expires: "",
};

const PARTS = ["Profile", "Affiliation", "Access"];

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** The step bar under the title: each step's number, ticked once passed. */
function Steps({ at }: { at: number }) {
  return (
    <ol className="adm-invite-steps" aria-label="Invitation steps">
      {PARTS.map((name, i) => (
        <li key={name} className={i < at ? "is-done" : i === at ? "is-current" : undefined} aria-current={i === at ? "step" : undefined}>
          <span className="adm-invite-steps__n" aria-hidden="true">
            {i < at ? <Icon name="check" size={12} strokeWidth={2.6} /> : i + 1}
          </span>
          <span className="adm-invite-steps__name">
            <span className="sr-only">{`Step ${i + 1} of ${PARTS.length}: `}</span>
            {name}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function InviteSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const formId = useId();
  const { data } = useConsole();
  const act = useAct();
  const v = data.viewer;
  const [d, setD] = useState<Draft>(EMPTY);
  const [part, setPart] = useState(0);
  const [custom, setCustom] = useState(false);
  const [scope, setScope] = useState<Scope>(UNIVERSITY);
  const [affiliationFocused, setAffiliationFocused] = useState(false);
  const [sending, setSending] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const moved = useRef(false);
  useEffect(() => {
    if (!open) return;
    setD(EMPTY);
    setPart(0);
    setCustom(false);
    setScope(UNIVERSITY);
    moved.current = false;
  }, [open]);
  // a new role or unit starts again from the role's own scope
  const set = (patch: Partial<Draft>) => {
    if ("roleId" in patch || "section" in patch || "unitId" in patch || "affiliation" in patch) setCustom(false);
    setD((x) => ({ ...x, ...patch }));
  };

  const { domains, allowGuests } = data.signIn;
  const thomasian = isThomasian(d.affiliation);
  const external = !!d.affiliation.trim() && !thomasian;
  const website = !thomasian && asksWebsite(d.affiliation) && !listedAffiliation(d.affiliation);
  const showWebsite = !affiliationFocused && website;
  const groups = useMemo(() => requestUnits(data.units), [data.units]);
  // the units of the chosen section that the inviter may add people to: University Offices, or Faculty/Colleges
  const sectionUnits = (groups.find((g) => g.label === SECTIONS.find((x) => x.key === d.section)?.label)?.units ?? []).filter((u) => viewerCan(v, "accounts", "create", { unitId: u.id }));
  const unitLabel = d.section === "offices" ? "Office" : "College/Faculty";
  // an External partner is a guest of the Office, as an approved request makes them
  const roleId = thomasian ? d.roleId : external ? ROLE.external : "";
  const unitId = thomasian ? d.unitId : external ? HUB_OFFICE : "";
  const role = data.roles.find((r) => r.id === roleId);
  const unit = data.units.find((u) => u.id === unitId);
  const expires = d.expires || (external ? addDays(data.day, GUEST_DAYS) : "");
  const universityAdmin = v.grants.some((g) => g.units === "all" && has(g.perms, "accounts", "edit"));
  const defaultScope = role && unitId ? roleScope(role.id, unitId) : null;
  const emailIssue = (value: string) => emailProblem(value, d.affiliation, domains, "other");
  // only University-wide Administrators sponsor guests, and only while guest sign-in is on
  const affiliationProblem = !external
    ? ""
    : !viewerCan(v, "accounts", "manage")
      ? "Only University-wide Administrators can invite people from outside the University."
      : !allowGuests
        ? "Guest sign-in is off in Privacy and Security. Turn it on to invite people from outside the University."
        : "";
  const salutation = d.salutation === OTHER_SALUTATION ? d.otherSalutation.trim() : d.salutation === NO_SALUTATION ? "" : d.salutation;
  const name = [d.firstName, d.middleName, d.lastName].map((x) => x.trim()).filter(Boolean).join(" ");
  // as the approver's request sheet shows it: a named accreditation organization after its kind, Others when unlisted
  const listed = listedAffiliation(d.affiliation);
  const affiliationText = `${listed === SPECIFY ? SPECIFY_LABEL : (listed ?? d.affiliation.trim())}${listed === SPECIFY && d.organization.trim() ? ` · ${d.organization.trim()}` : ""}${listed ? "" : " (Others)"}`;

  // Keep Affiliation inactive on arrival, so its list stays shut; other steps focus their first field.
  useEffect(() => {
    if (moved.current && part !== 1) form.current?.querySelector<HTMLElement>("input:not([type=hidden]):not([disabled]), button.pick-trigger")?.focus();
  }, [part]);

  const goTo = (to: number) => {
    moved.current = true;
    setPart(to);
  };

  const send = async () => {
    setSending(true);
    const r = await act({
      type: "account.invite",
      input: {
        lastName: d.lastName,
        firstName: d.firstName,
        middleName: d.middleName,
        salutation: d.salutation,
        otherSalutation: d.otherSalutation,
        email: d.email,
        affiliation: d.affiliation,
        organization: thomasian ? "" : d.organization,
        website: website ? d.website : "",
        roleId: thomasian ? d.roleId : "",
        section: thomasian ? d.section : "",
        unitId: thomasian ? d.unitId : "",
        expires: expires || undefined,
        scope: custom ? scope : undefined,
      },
    });
    setSending(false);
    if (!r.ok) return;
    onClose();
    if (typeof r.data === "string") onCreated(r.data);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Invite someone"
      sub="They join the first time they sign in."
      headerContent={<Steps at={part} />}
      footer={
        <>
          {part > 0 ? (
            <button type="button" className="btn" onClick={() => goTo(part - 1)} disabled={sending}>
              <Icon name="arrow-left" size={15} /> Back
            </button>
          ) : (
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
          )}
          {part < PARTS.length - 1 ? (
            <button type="submit" form={formId} className="btn btn--dark">
              Continue <Icon name="arrow" size={15} />
            </button>
          ) : (
            <button type="submit" form={formId} className="btn btn--dark" disabled={sending} aria-busy={sending}>
              <Icon name="send" size={15} /> {sending ? "Sending…" : "Send invitation"}
            </button>
          )}
        </>
      }
    >
      <form
        ref={form}
        key={part}
        id={formId}
        className="adm-invite"
        onSubmit={(e) => {
          e.preventDefault();
          if (part < PARTS.length - 1) goTo(part + 1);
          else void send();
        }}
      >
        {part === 0 && (
          <>
            <div className="adm-invite__pair">
              <Field label="Last Name">
                <input className="input" name="lastName" title="" value={d.lastName} onChange={(e) => set({ lastName: requestText(e.target.value) })} autoComplete="off" required />
              </Field>
              <Field label="First Name">
                <input className="input" name="firstName" title="" value={d.firstName} onChange={(e) => set({ firstName: requestText(e.target.value) })} autoComplete="off" required />
              </Field>
            </div>
            <div className="adm-invite__pair">
              <Field
                label={
                  <>
                    Middle Name <em>Optional</em>
                  </>
                }
              >
                <input className="input" name="middleName" title="" value={d.middleName} onChange={(e) => set({ middleName: requestText(e.target.value) })} autoComplete="off" />
              </Field>
              <Field label="Preferred Salutation">
                <Select className="select" name="salutation" value={d.salutation} onChange={(salutation) => set({ salutation })} placeholder="Choose" required>
                  {[...SALUTATIONS, OTHER_SALUTATION, NO_SALUTATION].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {d.salutation === OTHER_SALUTATION && (
              <Field label="Their Salutation">
                <input
                  className="input"
                  name="otherSalutation"
                  title=""
                  value={d.otherSalutation}
                  onChange={(e) => set({ otherSalutation: salutationText(e.target.value) })}
                  placeholder="e.g. Arch."
                  autoComplete="off"
                  maxLength={24}
                  required
                />
              </Field>
            )}
          </>
        )}

        {part === 1 && (
          <>
            <AffiliationField
              value={d.affiliation}
              onChange={(affiliation) => set({ affiliation })}
              onFocusChange={setAffiliationFocused}
              problem={affiliationProblem}
              fieldClass="adm-field"
              labelClass="adm-field__label"
              required
            />

            {thomasian && (
              <div className={sectionsFor(d.roleId).length > 1 ? "adm-invite__pair" : undefined}>
                <Field label="Role">
                  <Select className="select" name="roleId" value={d.roleId} onChange={(id) => set(withRole(id, d.section, d.unitId))} placeholder="Choose" aria-label="Role" required>
                    {UST_ROLES.map((r) => {
                      const grantable = data.roles.find((x) => x.id === r.id)?.grantable;
                      return (
                        <option key={r.id} value={r.id} disabled={!grantable}>
                          {r.name}
                          {grantable ? "" : " (above your access)"}
                        </option>
                      );
                    })}
                  </Select>
                </Field>

                {sectionsFor(d.roleId).length > 1 && (
                  <Field label="Unit">
                    <Select className="select" name="section" value={d.section} onChange={(section) => set({ section, unitId: section === d.section ? d.unitId : "" })} placeholder="Choose" aria-label="Unit" required>
                      {SECTIONS.map((x) => (
                        <option key={x.key} value={x.key}>
                          {x.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
              </div>
            )}

            {thomasian && d.section && (
              <Field label={unitLabel}>
                <Select key={d.section} className="select" name="unitId" value={d.unitId} onChange={(id) => set({ unitId: id })} placeholder="Type or choose" aria-label={unitLabel} searchable required>
                  {sectionUnits.map((u) => (
                    <option key={u.id} value={u.id} data-depth={u.depth}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            {!thomasian && (
              <>
                {listedAffiliation(d.affiliation) === SPECIFY && (
                  <Field label="Accreditation Organization">
                    <input
                      className="input"
                      name="organization"
                      title=""
                      value={d.organization}
                      onChange={(e) => set({ organization: requestText(e.target.value) })}
                      placeholder="E.G. ABET OR AACSB"
                      autoComplete="off"
                      required
                    />
                  </Field>
                )}
                <div className="adm-invite__reveal" data-visible={showWebsite} inert={!showWebsite} aria-hidden={!showWebsite}>
                  <div className="adm-invite__reveal-clip">
                    <Field
                      label={
                        <>
                          Organization Website <em>Optional</em>
                        </>
                      }
                    >
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
                        autoComplete="off"
                        spellCheck={false}
                        maxLength={200}
                      />
                    </Field>
                  </div>
                </div>
              </>
            )}

            <Field label={thomasian ? "UST Email" : "Institution Email"}>
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
                placeholder={thomasian ? `name@${domains[0] ?? "ust.edu.ph"}` : "name@institution.org"}
                autoComplete="off"
                spellCheck={false}
                maxLength={254}
                required
              />
            </Field>
          </>
        )}

        {part === 2 && (
          <>
            <KV
              rows={[
                ["Person", `${salutation ? `${salutation} ` : ""}${name}`],
                ["Email", d.email.trim().toLowerCase()],
                ["Affiliation", thomasian ? "University of Santo Tomas" : affiliationText],
                ["Role", role?.name ?? "—"],
                [thomasian ? unitLabel : "Sponsored by", unit?.name ?? "—"],
              ]}
            />
            <Field
              label={
                external ? (
                  "Access Ends"
                ) : (
                  <>
                    Access Ends <em>Optional</em>
                  </>
                )
              }
            >
              <DateField className="input" name="expires" min={addDays(data.day, 1)} value={expires} onChange={(x) => set({ expires: x })} aria-label="Access ends" required={external} />
            </Field>
            {role &&
              (custom ? (
                <Block
                  title="Access scope"
                  actions={
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => setCustom(false)}>
                      Use default
                    </button>
                  }
                >
                  <ScopeEditor value={scope} onChange={setScope} allowUniversity={universityAdmin} unitFilter={(u) => u.status === "Active" && viewerCan(v, "accounts", "edit", { unitId: u.id })} />
                </Block>
              ) : (
                <p className="adm-note">
                  Access scope: {defaultScope?.units === "all" ? "University-wide" : "their unit"}.{" "}
                  <button
                    type="button"
                    className="link"
                    onClick={() => {
                      setCustom(true);
                      setScope(defaultScope?.units === "all" && universityAdmin ? UNIVERSITY : unitId ? unitScope(unitId) : UNIVERSITY);
                    }}
                  >
                    Change
                  </button>
                </p>
              ))}
            {role && (
              <Disclosure title={`What ${role.name} can do`}>
                <PermissionMatrix caption={`${role.name} permissions`} cell={diffCell({}, permissionsAt(role, custom ? scope : (defaultScope ?? { units: [] })))} />
              </Disclosure>
            )}
          </>
        )}
      </form>
    </Sheet>
  );
}
