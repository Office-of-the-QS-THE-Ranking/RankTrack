"use client";

/*
 * The pieces of a team copy's pages (lib/forms/copies.ts): who you are (signed in with Google from the form, or the
 * Hub's own account), who can open a copy, the people added to a private one, faces for who is here, and the sheet
 * where a copy's owner changes its name and sharing and answers requests for access. Copies opened on this device are remembered for the start page.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { answerFormCopyRequest, setFormCopySharing, signOutOfForm } from "@/app/actions/form-copies";
import { findCopyPeople } from "@/app/actions/form-people";
import { Sheet } from "@/components/workspace/parts";
import { GoogleMark } from "@/components/ui/GoogleMark";
import { Icon, type IconName } from "@/components/ui/Icon";
import { InfoTooltip } from "@/components/ui/interactive";
import { toast } from "@/components/ui/toast";
import { COPY_LIMITS, copyEmail, copyPath, initials, signInMessage, type CopyAccess } from "@/lib/forms/copies";
import { LOOKUP_MIN, type PersonMatch } from "@/lib/forms/people-lookup";
import type { CopyRequest, FormWho } from "@/lib/governance/hub-types";
import type { Peer } from "./useCopy";

/** Back from Google (?signin=…): told once as a toast, and taken off the address. */
export function SignInReturn({ result }: { result?: string }) {
  useEffect(() => {
    if (!result) return;
    const { text, tone } = signInMessage(result);
    toast(text, tone);
    const url = new URL(window.location.href);
    url.searchParams.delete("signin");
    window.history.replaceState(window.history.state, "", url);
  }, [result]);
  return null;
}

/* ---------- Who you are ---------- */

/** Keep the face readable when Google has no photo or the image cannot load. */
function FaceContent({ name, src }: { name: string; src?: string }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) return <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
  return name === "Guest" ? <Icon name="user" size={13} /> : initials(name);
}

/** Signed in: a face, the name and email, and signing out. Otherwise, choose an account at Google. */
export function WhoBox({ who, back, cta = "Continue with Google" }: { who: FormWho | null; back: string; cta?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (who) {
    return (
      <div className="fr-who">
        <span className="fr-face fr-face--lg" aria-hidden="true">
          <FaceContent key={who.avatar} name={who.name} src={who.avatar} />
        </span>
        <span className="fr-who__text">
          <b>{who.name}</b>
          <small>{who.email}</small>
        </span>
        {who.via === "hub" && (
          <span className="fr-who__via">
            <Icon name="shield-check" size={13} /> Hub account
          </span>
        )}
        <span className="fr-who__actions">
          <button
            type="button"
            className="fr-who__act"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await signOutOfForm().catch(() => null);
              if (r) forgetCopies();
              toast(r ? "You signed out." : "Could not sign out. Check your connection and try again.", r ? "ok" : "error");
              router.refresh();
              setBusy(false);
            }}
          >
            <Icon name="logout" size={14} /> Sign out
          </button>
        </span>
      </div>
    );
  }
  return (
    <form
      className="fr-who-form"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        window.location.assign(`/auth/verify-email?${new URLSearchParams({ back })}`);
      }}
    >
      <button type="submit" className="fr-google" disabled={busy} aria-busy={busy || undefined}>
        <GoogleMark />
        {cta}
      </button>
    </form>
  );
}

/** In a form's hero, the account its pages know you by: your Hub account while you're signed in, else Google's. */
export function WhoChip({ who }: { who: FormWho }) {
  return (
    <span className="fr-who-chip">
      <span className="sr-only">{who.via === "hub" ? "Signed in to the Hub as" : "Signed in with Google as"}</span>
      <span className="fr-face" aria-hidden="true">
        <FaceContent key={who.avatar} name={who.name} src={who.avatar} />
      </span>
      <span className="fr-who-chip__text">
        <b>{who.name}</b>
        <small>
          {who.via === "hub" ? <Icon name="shield-check" size={11} /> : <GoogleMark />}
          <span>{who.email}</span>
        </small>
      </span>
    </span>
  );
}

/* ---------- Who can open it ---------- */

const ACCESS: { key: CopyAccess; icon: IconName; label: string; hint: string }[] = [
  { key: "private", icon: "lock-keyhole", label: "Invitation Only", hint: "Invitation will be sent to email. Google verification is required." },
  { key: "link", icon: "link", label: "Anyone with the link", hint: "No sign-in. Anonymous Guests can edit." },
];

export function AccessChoice({ value, onChange, name }: { value: CopyAccess; onChange: (v: CopyAccess) => void; name: string }) {
  return (
    <div className="fr-access" role="radiogroup" aria-label="Who can open it">
      {ACCESS.map((o) => (
        <label key={o.key} className="fr-access__card" data-on={value === o.key || undefined}>
          <input type="radio" className="sr-only" name={name} value={o.key} checked={value === o.key} onChange={() => onChange(o.key)} />
          <span className="fr-access__icon" aria-hidden="true">
            <Icon name={o.icon} size={18} />
          </span>
          <span className="fr-access__text">
            <b>{o.label}</b>
            <small>{o.hint}</small>
          </span>
          <span className="fr-access__tick" aria-hidden="true">
            <Icon name="check" size={12} strokeWidth={2.8} />
          </span>
        </label>
      ))}
    </div>
  );
}

/* ---------- People on a private copy ---------- */

/** The green shield a person picked from the UST directory carries, as on a form's people cards. */
function Verified() {
  return (
    <span className="fm-person__verified fr-people__verified">
      <InfoTooltip label="Verified using Google" tone="success" escapeClipping icon={<><Icon name="shield" size={22} /><Icon name="check" size={12} strokeWidth={2.5} /></>}>
        Verified using Google
      </InfoTooltip>
    </span>
  );
}

/** People in the UST directory matching what's typed, a moment after typing stops, and whether a search is on its way. */
function useCopyPeople(code: string, text: string) {
  const query = text.trim();
  const ready = query.replace(/[^\p{L}]/gu, "").length >= LOOKUP_MIN;
  const [found, setFound] = useState<{ query: string; people: PersonMatch[] }>();
  useEffect(() => {
    if (!ready) return;
    let live = true;
    const t = setTimeout(() => {
      findCopyPeople({ code, text: query })
        .then((r) => live && setFound({ query, people: r.ok ? r.people : [] }))
        .catch(() => undefined);
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [ready, code, query]);
  const done = found?.query === query;
  return { people: ready && done ? found.people : [], searching: ready && !done };
}

/**
 * The owner, then each person added by email; Enter, Add or leaving the box adds what's typed (a list pastes too).
 * As a name or email is typed, matching people in the UST directory are offered; one picked carries the shield.
 */
export function PeopleEditor({
  code,
  owner,
  value,
  onChange,
  id,
  faces = {},
  onRemove,
}: {
  code: string;
  owner: { name: string; email: string; avatar?: string };
  value: string[];
  onChange: (next: string[]) => void;
  id: string;
  faces?: Record<string, { name?: string; photo?: string }>;
  /** Taking someone off, when it needs more than leaving the list (a confirmation); otherwise they leave at once. */
  onRemove?: (email: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [picked, setPicked] = useState<Record<string, PersonMatch>>({});
  const box = useRef<HTMLInputElement>(null);
  const { people: found, searching } = useCopyPeople(code, draft);
  const offers = found.filter((m) => m.email !== owner.email && !value.includes(m.email));
  const pick = (m: PersonMatch) => {
    const el = box.current;
    if (value.length >= COPY_LIMITS.members) {
      el?.setCustomValidity(`Add up to ${COPY_LIMITS.members} people.`);
      el?.reportValidity();
      return;
    }
    setPicked((p) => ({ ...p, [m.email]: m }));
    onChange([...value, m.email]);
    setDraft("");
    el?.setCustomValidity("");
    el?.focus();
  };
  const add = (report: boolean) => {
    const parts = draft.split(/[\s,;]+/).filter(Boolean);
    if (!parts.length) return;
    const el = box.current;
    const emails = parts.map(copyEmail);
    const fail = (message: string) => {
      if (!report || !el) return;
      el.setCustomValidity(message);
      el.reportValidity();
    };
    if (emails.some((e) => !e)) return fail("Enter an email address, like name@ust.edu.ph.");
    const next = [...value];
    for (const e of emails) if (e !== owner.email && !next.includes(e)) next.push(e);
    if (next.length > COPY_LIMITS.members) return fail(`Add up to ${COPY_LIMITS.members} people.`);
    onChange(next);
    setDraft("");
  };
  return (
    <div className="fr-people">
      <div className="fr-people__add">
        <span className="fr-people__box" data-searching={searching || undefined}>
          <input
            ref={box}
            id={id}
            className="input"
            type="email"
            multiple
            value={draft}
            title=""
            placeholder="Name or name@ust.edu.ph"
            autoComplete="off"
            aria-label="Add someone by name or email"
            onChange={(e) => {
              e.currentTarget.setCustomValidity("");
              setDraft(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
              e.preventDefault();
              // A name, not an email: take the first match.
              if (offers[0] && draft.split(/[\s,;]+/).filter(Boolean).some((p) => !copyEmail(p))) pick(offers[0]);
              else add(true);
            }}
            onBlur={() => add(false)}
          />
          {searching && (
            <span className="fr-people__searching" role="status">
              <span className="fr-people__spinner" aria-hidden="true" />
              Searching
            </span>
          )}
        </span>
        <button type="button" className="fr-people__btn" onClick={() => add(true)}>
          <Icon name="user-plus" size={15} /> Add
        </button>
      </div>
      {offers.length > 0 && (
        <div className="fm-match fr-people__match" role="group" aria-label="Matches in the UST directory">
          {offers.map((m) => (
            <button key={m.email} type="button" className="fm-match__item" onPointerDown={(e) => e.preventDefault()} onClick={() => pick(m)}>
              <span className="fm-match__face" aria-hidden="true">
                <FaceContent key={m.photo} name={m.name} src={m.photo} />
              </span>
              <span className="fm-match__who">
                <b>{m.name}</b>
                <span>{m.email}</span>
              </span>
              <span className="fm-match__use">Add</span>
            </button>
          ))}
        </div>
      )}
      <ul className="fr-people__list">
        <li>
          <span className="fr-face" aria-hidden="true">
            <FaceContent key={owner.avatar} name={owner.name} src={owner.avatar} />
          </span>
          <span className="fr-people__who">
            <b>{owner.name}</b>
            <small>{owner.email}</small>
          </span>
          <span className="fr-people__role">Owner</span>
        </li>
        {value.map((email) => {
          const m = picked[email];
          const known = faces[email];
          const photo = m?.photo ?? known?.photo;
          const name = m?.name ?? known?.name;
          return (
            <li key={email}>
              <span className={`fr-face${photo ? "" : " fr-face--soft"}`} aria-hidden="true">
                {photo ? <FaceContent key={photo} name={name ?? email} src={photo} /> : initials(email)}
              </span>
              <span className="fr-people__who">
                <b>{name ? name.toLocaleUpperCase("en-PH") : email}</b>
                {name && <small>{email}</small>}
              </span>
              {m && <Verified />}
              <button type="button" className="fr-people__revoke" aria-label={`Revoke access for ${email}`} onClick={() => (onRemove ? onRemove(email) : onChange(value.filter((x) => x !== email)))}>
                Revoke
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ---------- Who is here ---------- */

/** Faces of the people with a copy open, this page first, the others in their colours. */
export function Faces({ you, avatar, here, onGo, max = 4 }: { you: string; avatar?: string; here: Peer[]; onGo: (person: Peer) => void; max?: number }) {
  const shown = here.slice(0, max);
  return (
    <span className="fr-faces">
      <span className="fr-face fr-face--you" title={`${you} (you)`}>
        <FaceContent key={avatar} name={you} src={avatar} />
      </span>
      {shown.map((p) => (
        <button type="button" key={p.id} className="fr-face fr-face--jump" data-peer={p.color ? "" : undefined} style={p.color ? ({ "--peer": p.color } as CSSProperties) : undefined} title={`Go to where ${p.name} is editing`} aria-label={`Go to where ${p.name} is editing`} onClick={() => onGo(p)}>
          <FaceContent key={p.avatar} name={p.name} src={p.avatar} />
        </button>
      ))}
      {here.length > max && <span className="fr-face fr-face--more">+{here.length - max}</span>}
    </span>
  );
}

/* ---------- Sharing ---------- */

/** People who asked to open a private copy, each let in or turned down at once. */
function AccessRequests({ code, token, requests, onAnswered }: { code: string; token: string; requests: CopyRequest[]; onAnswered: (email: string, allowed: boolean, r: { members?: string[]; requests: CopyRequest[] }) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const answer = async (email: string, allow: boolean) => {
    setBusy(email);
    const r = await answerFormCopyRequest({ code, token, email, allow }).catch(() => ({ ok: false as const, message: "The Hub could not be reached. Check your connection and try again." }));
    toast(r.message, r.ok ? "ok" : "error");
    setBusy(null);
    if (r.ok) onAnswered(email, allow, r);
  };
  return (
    <div className="field fr-asks">
      <span className="field__label">
        Requesting Access <span className="fr-asks__count">{requests.length}</span>
      </span>
      <ul className="fr-people__list">
        {requests.map((q) => (
          <li key={q.email}>
            <span className={`fr-face${q.avatar ? "" : " fr-face--soft"}`} aria-hidden="true">
              {q.avatar ? <FaceContent key={q.avatar} name={q.name} src={q.avatar} /> : initials(q.name)}
            </span>
            <span className="fr-people__who">
              <b>{q.name}</b>
              <small className="fr-asks__email">{q.email}</small>
            </span>
            <span className="fr-asks__acts">
              <button type="button" className="fr-asks__btn" disabled={busy === q.email} onClick={() => void answer(q.email, false)} aria-label={`Decline ${q.email}`}>
                Decline
              </button>
              <button type="button" className="fr-asks__btn fr-asks__btn--yes" disabled={busy === q.email} onClick={() => void answer(q.email, true)} aria-label={`Let ${q.email} in`}>
                <Icon name="check" size={13} /> Allow
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SharingSheet({
  code,
  token,
  owner,
  sharing,
  requests,
  faces,
  onSaved,
  onRequests,
  onClose,
}: {
  code: string;
  token: string;
  owner: { name: string; email: string; avatar?: string };
  sharing: { label: string; access: CopyAccess; members: string[] };
  requests: CopyRequest[];
  /** Full names and photos of the people on the copy, by email (CopyView.faces). */
  faces: Record<string, { name: string; photo?: string }>;
  onSaved: (s: { label: string; access: CopyAccess; members: string[] }) => void;
  onRequests: (requests: CopyRequest[], members?: string[], admitted?: CopyRequest) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(sharing.label);
  const [access, setAccess] = useState(sharing.access);
  const [members, setMembers] = useState(sharing.members);
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  // Names and faces for the People list: from the Hub and the directory, else as people asked.
  const known: Record<string, { name?: string; photo?: string }> = { ...faces };
  for (const q of requests) known[q.email] = { name: faces[q.email]?.name ?? (q.name !== q.email ? q.name : undefined), photo: faces[q.email]?.photo ?? q.avatar };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(new URL(copyPath(code, token), window.location.origin).href);
      toast("Copy link copied.", "ok");
    } catch {
      toast("Could not copy the link. Select the address and copy it.", "error");
    }
  };
  // Taking away someone's saved access applies at once, over the saved sharing; other unsaved changes stay unsaved.
  const revoke = async (email: string) => {
    setBusy(true);
    const kept = sharing.members.filter((x) => x !== email);
    const r = await setFormCopySharing({ code, token, label: sharing.label, access: sharing.access, members: kept }).catch(() => ({ ok: false as const, message: "The Hub could not be reached. Check your connection and try again." }));
    setBusy(false);
    if (!r.ok) {
      toast(r.message, "error");
      return false;
    }
    toast(`${known[email]?.name ?? email} can no longer open this copy.`, "ok");
    setMembers((m) => m.filter((x) => x !== email));
    onSaved({ label: r.label, access: r.access, members: r.members });
    return true;
  };
  const revokingName = revoking && known[revoking]?.name;
  return (
    <Sheet title="Share this editable file" onClose={onClose} className="fr-sharing-sheet">
      {(close) => (
        <>
        <form
          className="ws-sheet__body fr-share__body"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const r = await setFormCopySharing({ code, token, label, access, members }).catch(() => ({ ok: false as const, message: "The Hub could not be reached. Check your connection and try again." }));
            toast(r.message, r.ok ? "ok" : "error");
            setBusy(false);
            if (!r.ok) return;
            onSaved({ label: r.label, access: r.access, members: r.members });
            onRequests(requests.filter((q) => !r.members.includes(q.email)));
            close();
          }}
        >
          <div className="fr-sharing-sheet__summary">
            <label className="field">
              <span className="field__label">Document title</span>
              <input className="input" title="" value={label} maxLength={COPY_LIMITS.label} required data-missing="Name the copy, like the event it’s for." onChange={(e) => setLabel(e.target.value)} />
            </label>
            <button type="button" className="fr-share__link" onClick={() => void copyLink()}>
              <Icon name="link" size={16} />
              <span>Copy the link</span>
              <Icon name="copy" size={15} />
            </button>
          </div>
          <div className="field">
            <span className="field__label">Who can open it</span>
            <AccessChoice value={access} onChange={setAccess} name="share-access" />
          </div>
          {access === "private" && (
            <div className="field">
              <label className="field__label" htmlFor="share-people">
                People
              </label>
              <PeopleEditor
                id="share-people"
                code={code}
                owner={owner}
                value={members}
                onChange={setMembers}
                faces={known}
                // Someone with saved access is asked about first; someone only just added here just leaves the list.
                onRemove={(email) => (sharing.access === "private" && sharing.members.includes(email) ? setRevoking(email) : setMembers((m) => m.filter((x) => x !== email)))}
              />
            </div>
          )}
          {sharing.access === "private" && requests.length > 0 && (
            <AccessRequests
              code={code}
              token={token}
              requests={requests}
              onAnswered={(email, allowed, r) => {
                // Allowed in at once: the new person joins the list below, kept with any unsaved changes.
                if (allowed) setMembers((m) => (m.includes(email) ? m : [...m, email]));
                onRequests(r.requests, r.members, requests.find((q) => q.email === email));
              }}
            />
          )}
          <footer className="ws-sheet__foot">
            <button type="button" className="btn" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="btn btn--dark" disabled={busy}>
              Save
            </button>
          </footer>
        </form>
        {revoking && (
          <Sheet title="Remove access?" onClose={() => setRevoking(null)} className="ws-sheet--confirm">
            {(closeConfirm) => (
              <div className="ws-sheet__body">
                <p className="ws-sheet__text">
                  {revokingName ? (
                    <>
                      <b>{revokingName.toLocaleUpperCase("en-PH")}</b> (<span className="fr-gate__email">{revoking}</span>)
                    </>
                  ) : (
                    <b className="fr-gate__email">{revoking}</b>
                  )}{" "}
                  can no longer open or edit this copy. Their changes so far stay.
                </p>
                <footer className="ws-sheet__foot">
                  <button type="button" className="btn" onClick={closeConfirm} autoFocus>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn--danger"
                    disabled={busy}
                    onClick={async () => {
                      if (await revoke(revoking)) closeConfirm();
                    }}
                  >
                    <Icon name="user-minus" size={16} /> Remove access
                  </button>
                </footer>
              </div>
            )}
          </Sheet>
        )}
        </>
      )}
    </Sheet>
  );
}

/* ---------- Copies on this device ---------- */

/**
 * The form's start page once listed the copies opened on a device (localStorage "hub-form-copies"). It's gone, but
 * a device may still hold that list of copy links: signing out clears it.
 */
export function forgetCopies() {
  try {
    localStorage.removeItem("hub-form-copies");
  } catch {}
}
