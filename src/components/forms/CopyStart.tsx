"use client";

/*
 * A form with team copies doesn't open on its questions. Its link starts a copy: sign in with Google (the copy is
 * yours), name it after the event it's for, and choose who can open it, anyone with its link or only the people you
 * add. Building it gives the copy the form's next reference and a link of its own, and opens it. Beside that, the
 * copies you started or were added to, and those opened on this device. A private copy opened by someone not on it
 * lets them request access from its owner, or sign in with an account its owner added (CopyGate).
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { buildFormCopy, requestFormCopyAccess } from "@/app/actions/form-copies";
import { Icon } from "@/components/ui/Icon";
import { InfoTooltip } from "@/components/ui/interactive";
import { toast } from "@/components/ui/toast";
import { COPY_LIMITS, copyPath, type CopyAccess } from "@/lib/forms/copies";
import { STATUS_LABEL } from "@/lib/forms/review";
import type { CopySummary, FormWho } from "@/lib/governance/hub-types";
import { AccessChoice, PeopleEditor, WhoBox, keepCopy, keptCopies, type KeptCopy } from "./copy-parts";
import { ago } from "./marks";

type Listed = { token: string; ref: string; label: string; access?: CopyAccess; status?: CopySummary["status"]; mine?: boolean; at: string };

export function CopyStart({ form, who, copies, open }: { form: { code: string; prefix: string; title: string }; who: FormWho | null; copies: CopySummary[]; open: boolean }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [access, setAccess] = useState<CopyAccess>("link");
  const [members, setMembers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [kept, setKept] = useState<KeptCopy[]>([]);
  const back = `/f/${form.code}`;

  useEffect(() => setKept(keptCopies(form.code, who?.email)), [form.code, who?.email]);

  // Signed out, nothing is listed: not even the copies opened on this device.
  const listed: Listed[] = !who ? [] : [
    ...copies.map((c) => ({ token: c.token, ref: c.ref, label: c.label, access: c.access, status: c.status, mine: c.mine, at: c.editedAt })),
    ...kept.filter((k) => !copies.some((c) => c.token === k.token)).map((k) => ({ token: k.token, ref: k.ref, label: k.label, at: k.at })),
  ];

  const build = async () => {
    setBusy(true);
    const r = await buildFormCopy({ code: form.code, label, access, members }).catch(() => ({ ok: false as const, message: "The Hub could not be reached. Check your connection and try again." }));
    toast(r.message, r.ok ? "ok" : "error");
    if (!r.ok) return setBusy(false);
    keepCopy({ code: form.code, token: r.token, ref: r.ref, label }, who?.email);
    router.push(copyPath(form.code, r.token));
  };

  return (
    <div className="fr-body fr-body--start">
      <section className="fr-card fr-start" aria-labelledby="fr-start-title">
        <header className="fr-card__head">
          <span className="fr-card__eyebrow">
            <Icon name="copy" size={15} />
            New copy
          </span>
          <h2 className="fr-card__title" id="fr-start-title">
            Build a form copy
          </h2>
        </header>

        <ul className="fr-start__perks">
          <li>
            <span className="fr-pv-ico" aria-hidden="true">
              <Icon name="hash" size={18} />
            </span>
            <span>
              <b>Unique Reference, Easy Access</b>
            </span>
          </li>
          <li>
            <span className="fr-pv-ico" aria-hidden="true">
              <Icon name="users" size={18} />
            </span>
            <span>
              <b>Collaborate in Real Time</b>
            </span>
          </li>
          <li>
            <span className="fr-pv-ico" aria-hidden="true">
              <Icon name="lock-keyhole" size={18} />
            </span>
            <span>
              <b>Your Workspace, Your Privacy</b>
            </span>
          </li>
        </ul>

        {open ? (
          <ol className="fr-start__steps">
            <li className="fr-start__step" data-done={who ? "" : undefined}>
              <span className="fr-start__num" aria-hidden="true">
                {who ? <Icon name="check" size={14} strokeWidth={2.6} /> : 1}
              </span>
              <div className="fr-start__body">
                <div className="fr-start__heading">
                  <h3 className="fr-start__title">{who ? "Signed in" : "Sign in"}</h3>
                  {!who && (
                    <InfoTooltip label="About signing in" escapeClipping>
                      The copy is yours: you choose who can open it.
                    </InfoTooltip>
                  )}
                </div>
                <WhoBox who={who} back={back} />
              </div>
            </li>
            <li className="fr-start__step fr-start__step--form" data-locked={who ? undefined : ""}>
              <form
                className="fr-start__form"
                inert={!who}
                onSubmit={(e) => {
                  e.preventDefault();
                  void build();
                }}
              >
                <div className="fr-start__row">
                  <span className="fr-start__num" aria-hidden="true">
                    2
                  </span>
                  <div className="fr-start__body">
                    <div className="fr-start__heading">
                      <label className="fr-start__title" htmlFor="fr-copy-name">
                        Create a File Name
                      </label>
                      <InfoTooltip label="About naming this copy" escapeClipping>
                        So your team can tell its copies apart.
                      </InfoTooltip>
                    </div>
                    <input
                      id="fr-copy-name"
                      className="input"
                      value={label}
                      title=""
                      required
                      maxLength={COPY_LIMITS.label}
                      placeholder="Community Development Project - University of Santo Tomas"
                      autoComplete="off"
                      data-missing="Name the copy, like the event it’s for."
                      onChange={(e) => setLabel(e.target.value)}
                    />
                  </div>
                </div>
                <div className="fr-start__row">
                  <span className="fr-start__num" aria-hidden="true">
                    3
                  </span>
                  <div className="fr-start__body">
                    <div className="fr-start__heading">
                      <span className="fr-start__title">Who can open it</span>
                      <InfoTooltip label="About who can open this copy" escapeClipping>
                        You can change this later.
                      </InfoTooltip>
                    </div>
                    <AccessChoice value={access} onChange={setAccess} name="copy-access" />
                    {access === "private" && who && <PeopleEditor id="fr-copy-people" code={form.code} owner={who} value={members} onChange={setMembers} />}
                  </div>
                </div>
                <footer className="fr-start__foot">
                  <button type="submit" className="w-btn w-btn--ink fr-go" disabled={busy || !who} aria-busy={busy || undefined}>
                    {busy ? "Building…" : "Build copy"}
                    <span className="fr-go__disc" aria-hidden="true">
                      <Icon name="arrow" size={15} />
                    </span>
                  </button>
                </footer>
              </form>
            </li>
          </ol>
        ) : (
          <p className="fr-start__closed">
            <Icon name="lock" size={16} /> This form isn’t taking responses, so no new copies can be built.
          </p>
        )}
      </section>

      <aside className="fr-mine" aria-labelledby="fr-mine-title">
        <header className="fr-mine__head">
          <h2 id="fr-mine-title">Your Files</h2>
          {listed.length > 0 && <span className="fr-mine__count">{listed.length}</span>}
        </header>
        {listed.length ? (
          <ul className="fr-mine__list">
            {listed.map((c) => (
              <li key={c.token}>
                <a className="fr-mine__item" href={copyPath(form.code, c.token)}>
                  <span className="fr-mine__ref">{c.ref}</span>
                  <span className="fr-mine__label">{c.label}</span>
                  <span className="fr-mine__meta">
                    {c.access && <Icon name={c.access === "private" ? "lock-keyhole" : "link"} size={12} />}
                    {c.status ? (c.status === "draft" ? "In progress" : STATUS_LABEL[c.status]) : "Opened here"}
                    {c.mine === false && " · Shared with you"}
                    <span aria-hidden="true">·</span>
                    {ago(c.at)}
                  </span>
                  <Icon name="arrow" size={15} className="fr-mine__go" />
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <div className="fr-mine__empty">
            <span className="fr-mine__stack" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <p>{who ? "Copies you build, or are added to, show here." : "Sign in to see the copies you built or were added to."}</p>
          </div>
        )}
      </aside>
    </div>
  );
}

/**
 * A private copy, opened by someone not on it: ask its owner to let this account in, or sign in with an account its
 * owner added. Once asked (`requested`), the door says so until the owner answers.
 */
export function CopyGate({ code, token, who, requested }: { code: string; token: string; who: FormWho | null; requested?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState(!!requested);
  const ask = async () => {
    setBusy(true);
    const r = await requestFormCopyAccess({ code, token }).catch(() => ({ ok: false as const, message: "The Hub could not be reached. Check your connection and try again." }));
    toast(r.message, r.ok ? "ok" : "error");
    setBusy(false);
    if (r.ok) {
      setAsked(true);
      router.refresh();
    }
  };
  const email = who && <b className="fr-gate__email">{who.email}</b>;
  return (
    <div className="fr-body fr-body--single">
      <div className="fr-card fr-shut fr-gate" data-asked={asked || undefined}>
        <span className="fr-shut__icon" aria-hidden="true">
          <Icon name={asked ? "send" : "lock-keyhole"} size={22} />
        </span>
        <h2 className="fr-shut__title">{asked ? "Access requested" : "This copy is private"}</h2>
        <p className="fr-shut__text">
          {!who ? (
            "Sign in with the Google account its owner added."
          ) : asked ? (
            <>The owner was asked to let {email} in. Open this link again once they have.</>
          ) : (
            <>{email} isn’t on it. Request access from the person who started it, or use another Google account.</>
          )}
        </p>
        <div className="fr-gate__who">
          {who && !asked && (
            <button type="button" className="fr-google fr-gate__ask" disabled={busy} onClick={() => void ask()}>
              <Icon name="user-plus" size={17} />
              {busy ? "Sending…" : "Request access"}
            </button>
          )}
          <WhoBox who={null} back={copyPath(code, token)} cta={who ? "Use another account" : "Continue with Google"} />
        </div>
      </div>
    </div>
  );
}
