import { useId, useState, type FormEvent } from "react";
import { formatDate } from "@/lib/data";
import { UNIT_EMAILS } from "@/lib/governance/catalog";
import type { UnitProfileData } from "@/lib/governance/hub-types";
import { initials } from "@/lib/governance/rbac";
import { useGovern } from "@/components/hub/HubProvider";
import { Face } from "@/components/ui/Face";
import { Icon } from "@/components/ui/Icon";
import { Select } from "@/components/ui/pickers";
import { toast } from "@/components/ui/toast";
import { SectionTitle, properName } from "./shared";

/** "College name", "Faculty name" or "Unit name", as the unit calls itself. */
function nameLabel(u: UnitProfileData["unit"]) {
  if (u.kind !== "Faculty or college") return "Unit name";
  return u.name.startsWith("Faculty") ? "Faculty name" : u.name.startsWith("College") ? "College name" : "Unit name";
}

const ACCOUNT_STATUS: Record<string, string> = { "Pending Invitation": "Invited", Suspended: "Suspended", Deactivated: "Deactivated" };

/** The unit's account details and coordinators. University Administrators can change them here. */
export function Settings({ data }: { data: UnitProfileData }) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const { unit } = data;
  if (editing) return <EditAccount data={data} onDone={() => setEditing(false)} />;
  return (
    <div className="up-settings">
      <section className="up-tile up-account" aria-labelledby={`${id}-account`}>
        <header className="up-tile__head">
          <SectionTitle id={`${id}-account`} className="up-tile__title">
            Account
          </SectionTitle>
          {data.canEdit && (
            <button type="button" className="btn btn--sm" onClick={() => setEditing(true)}>
              <Icon name="pen" size={15} /> Edit
            </button>
          )}
        </header>
        <dl className="up-fields">
          <div>
            <dt>{nameLabel(unit)}</dt>
            <dd className="up-fields__strong">{unit.name}</dd>
          </div>
          <div>
            <dt>Code</dt>
            <dd className="num">{unit.code}</dd>
          </div>
          <div>
            <dt>Type</dt>
            <dd>{unit.kind}</dd>
          </div>
          <div>
            <dt>Email addresses</dt>
            <dd>
              {unit.emails.length ? (
                <ul className="up-emails">
                  {unit.emails.map((e) => (
                    <li key={e}>
                      <a href={`mailto:${e}`} className="link">
                        <Icon name="mail" size={15} /> {e}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="muted">None yet</span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      <Coordinators data={data} />
    </div>
  );
}

function Coordinators({ data }: { data: UnitProfileData }) {
  const id = useId();
  const { run, pending } = useGovern();
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState("");
  const { unit, coordinators } = data;
  const available = data.people.filter((person) => !unit.adminIds.includes(person.id));
  const here = available.filter((person) => person.here);
  const elsewhere = available.filter((person) => !person.here);

  const add = async (event: FormEvent) => {
    event.preventDefault();
    const result = await run({ type: "unit.coordinator", id: unit.slug, accountId: selected, operation: "add" });
    toast(result.message, result.ok ? "ok" : "error");
    if (result.ok) { setSelected(""); setAdding(false); }
  };

  const remove = async (accountId: string) => {
    const result = await run({ type: "unit.coordinator", id: unit.slug, accountId, operation: "remove" });
    toast(result.message, result.ok ? "ok" : "error");
  };

  return (
    <section className="up-tile up-coord" aria-labelledby={`${id}-title`}>
      <header className="up-tile__head">
        <SectionTitle id={`${id}-title`} className="up-tile__title">Coordinators</SectionTitle>
        {data.canEdit && !adding && (
          <button type="button" className="btn btn--sm" onClick={() => setAdding(true)} disabled={pending}>
            <Icon name="plus" size={15} /> Add
          </button>
        )}
      </header>
      {adding && (
        <form className="up-coord__add" onSubmit={add} aria-label="Add a coordinator">
          {available.length ? (
            <label className="field">
              <span className="field__label">Coordinator</span>
              <Select className="select" value={selected} onChange={setSelected} required autoFocus disabled={pending}>
                <option value="">Choose a coordinator</option>
                {here.length > 0 && <optgroup label={`In ${unit.code}`}>
                  {here.map((person) => <option key={person.id} value={person.id}>{properName(person.name)} · {person.email}</option>)}
                </optgroup>}
                {elsewhere.length > 0 && <optgroup label="Elsewhere in the University">
                  {elsewhere.map((person) => <option key={person.id} value={person.id}>{properName(person.name)} · {person.email} ({person.unitCode})</option>)}
                </optgroup>}
              </Select>
            </label>
          ) : <p className="muted">No other accounts are available. Invite an account in Account Management first.</p>}
          <div className="up-coord__actions">
            <button type="button" className="btn btn--sm" disabled={pending} onClick={() => { setAdding(false); setSelected(""); }}>Cancel</button>
            {available.length > 0 && <button type="submit" className="btn btn--dark btn--sm" disabled={pending}>Add coordinator</button>}
          </div>
        </form>
      )}
      {coordinators.length ? (
        <ul className="up-coord__list">
          {coordinators.map((coordinator) => (
            <li key={coordinator.id}>
              <div className="up-person">
                <span className="up-avatar" aria-hidden="true"><Face src={coordinator.avatar}>{initials(coordinator.name)}</Face></span>
                <div className="up-person__text">
                  <p className="up-person__name">
                    {properName(coordinator.name)}
                    {ACCOUNT_STATUS[coordinator.status] && <span className="chip">{ACCOUNT_STATUS[coordinator.status]}</span>}
                  </p>
                  {coordinator.title && <p className="up-person__title">{coordinator.title}</p>}
                </div>
                {data.canEdit && <button type="button" className="btn btn--ghost btn--icon btn--sm up-coord__remove" aria-label={`Remove ${properName(coordinator.name)} as coordinator`} disabled={pending} onClick={() => void remove(coordinator.id)}><Icon name="close" size={16} /></button>}
              </div>
              <dl className="up-fields">
                <div><dt>Email</dt><dd><a href={`mailto:${coordinator.email}`} className="link"><Icon name="mail" size={15} /> {coordinator.email}</a></dd></div>
                <div><dt>Last sign-in</dt><dd>{coordinator.lastLogin ? formatDate(coordinator.lastLogin.slice(0, 10), { day: "numeric", month: "short", year: "numeric" }) : "Never"}</dd></div>
              </dl>
            </li>
          ))}
        </ul>
      ) : (
        <div className="up-person up-person--empty">
          <span className="up-avatar" aria-hidden="true"><Icon name="user" size={20} /></span>
          <p className="muted">No coordinators yet{data.canEdit ? ". Use Add to choose a coordinator." : "."}</p>
        </div>
      )}
    </section>
  );
}

function EditAccount({ data, onDone }: { data: UnitProfileData; onDone: () => void }) {
  const id = useId();
  const { run, pending } = useGovern();
  const { unit } = data;
  const [name, setName] = useState(unit.name);
  const [emails, setEmails] = useState<string[]>(unit.emails.length ? unit.emails : [""]);
  const kept = emails.map((e) => e.trim().toLowerCase()).filter(Boolean);
  const changed = {
    name: name.trim() !== unit.name,
    emails: kept.join() !== unit.emails.join(),
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const r = await run({
      type: "unit.update",
      id: unit.slug,
      ...(changed.name && { name }),
      ...(changed.emails && { emails: kept }),
    });
    toast(r.message, r.ok ? "ok" : "error");
    if (r.ok) onDone();
  };

  return (
    <form className="up-tile up-edit" onSubmit={save} aria-labelledby={`${id}-edit`}>
      <header className="up-tile__head">
        <SectionTitle id={`${id}-edit`} className="up-tile__title">
          Edit account
        </SectionTitle>
      </header>
      <div className="up-edit__grid">
        <label className="field">
          <span className="field__label">{nameLabel(unit)}</span>
          <input
            className="input"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={3}
            maxLength={120}
            data-missing={`Enter the ${nameLabel(unit).toLowerCase()}.`}
            autoComplete="off"
          />
        </label>
        <fieldset className="field up-edit__emails">
          <legend className="field__label">Email addresses</legend>
          {emails.map((e, i) => (
            <div key={i} className="up-edit__email">
              <input
                className="input"
                type="email"
                name="emails"
                value={e}
                onChange={(ev) => setEmails(emails.map((x, j) => (j === i ? ev.target.value : x)))}
                placeholder="college@ust.edu.ph"
                aria-label={`Email address ${i + 1}`}
                autoComplete="off"
              />
              <button
                type="button"
                className="btn btn--ghost btn--icon btn--sm"
                aria-label={e ? `Remove ${e}` : "Remove this address"}
                onClick={() => setEmails(emails.length > 1 ? emails.filter((_, j) => j !== i) : [""])}
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          ))}
          {emails.length < UNIT_EMAILS && (
            <button type="button" className="btn btn--sm up-edit__add" onClick={() => setEmails([...emails, ""])}>
              <Icon name="plus" size={15} /> Add an address
            </button>
          )}
        </fieldset>
      </div>
      <footer className="up-edit__foot">
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn btn--dark" disabled={pending || !(changed.name || changed.emails)}>
          Save changes
        </button>
      </footer>
    </form>
  );
}
