"use client";

/*
 * The portal demo: an account chooser standing in for Google's, then the second factor with its code on
 * screen. It lives in its own modal, apart from the real sign-in (SignInFlow), so connecting Google
 * Workspace later only touches startGoogleSignIn and this file can be dropped or gated.
 */
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { startSignIn, verifySecondFactor, type SignInResult } from "@/app/actions/session";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/toast";

export interface ChooserAccount {
  id: string;
  name: string;
  email: string;
  title: string;
  unit: string;
  roles: string[];
  status: string;
  external: boolean;
  workspace: "office" | "portal" | "none";
  initials: string;
  tier: number;
}

/** A step's header: a round back button (or none), the title, and whatever sits at its end. */
export function Head({ title, back, onBack, children }: { title: string; back?: string; onBack?: () => void; children?: ReactNode }) {
  return (
    <div className="si__head">
      {onBack && (
        <button type="button" className="si__back" onClick={onBack} aria-label={back} title={back}>
          <Icon name="arrow-left" size={16} />
        </button>
      )}
      <h1 className="si__title">{title}</h1>
      {children}
    </div>
  );
}

export function Alert({ children }: { children: ReactNode }) {
  return (
    <p className="si__error" role="alert">
      <Icon name="alert" size={16} /> {children}
    </p>
  );
}

export function DemoSignIn({ open, onClose, accounts, next }: { open: boolean; onClose: () => void; accounts: ChooserAccount[]; next?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState<"choose" | "mfa">("choose");
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [mfa, setMfa] = useState<Extract<SignInResult, { ok: true }>["mfa"] | null>(null);
  const [code, setCode] = useState("");
  const [typing, setTyping] = useState(false);
  const [locked, setLocked] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setStep("choose");
      setQ("");
      setError("");
      setLocked(false);
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    const d = ref.current;
    d?.addEventListener("close", onClose);
    return () => d?.removeEventListener("close", onClose);
  }, [onClose]);

  const groups = useMemo(() => {
    const t = q.trim().toLowerCase();
    const hit = (a: ChooserAccount) => !t || [a.name, a.email, a.unit, a.roles.join(" ")].some((x) => x.toLowerCase().includes(t));
    const list = accounts.filter(hit).sort((a, b) => b.tier - a.tier || a.name.replace(/^\S+\.\s/, "").localeCompare(b.name.replace(/^\S+\.\s/, "")));
    return [
      { label: "Office", items: list.filter((a) => a.workspace === "office" && a.status === "Active") },
      { label: "Colleges and units", items: list.filter((a) => a.workspace === "portal" && (a.status === "Active" || a.status === "Pending Invitation")) },
      { label: "Unavailable", items: list.filter((a) => a.status === "Suspended" || a.status === "Deactivated" || a.workspace === "none") },
    ].filter((g) => g.items.length);
  }, [accounts, q]);

  const choose = (a: ChooserAccount) => {
    setError("");
    start(async () => {
      const r = await startSignIn(a.id, next);
      if (!r) return;
      if (!r.ok) toast(r.message, "error");
      else {
        setMfa(r.mfa);
        setCode("");
        setStep("mfa");
      }
    });
  };

  const verify = (value = code) => {
    if (!mfa) return;
    setError("");
    start(async () => {
      const r = await verifySecondFactor(mfa.challengeId, value);
      if (!r) return;
      setError(r.message);
      setCode("");
      if (r.locked) setLocked(true);
    });
  };

  const close = (
    <button type="button" className="si__close" onClick={() => ref.current?.close()} aria-label="Close demo" title="Close">
      <Icon name="close" size={16} />
    </button>
  );

  return (
    <dialog
      ref={ref}
      className="signin__card si-demo"
      aria-label="Portal demo"
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      {open && (
        <div className="si" data-step={step} key={step}>
          {step === "choose" && (
            <>
              <Head title="Portal demo">
                <span className="si__tag" title="Stands in for Google's account chooser">
                  Demo
                </span>
                {close}
              </Head>
              <p className="si__sub">Pick an account to see its workspace.</p>
              <label className="si__search">
                <Icon name="search" size={16} />
                <span className="sr-only">Find an account</span>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, unit or role" autoFocus />
              </label>
              <div className="si__accounts" aria-busy={pending}>
                {groups.map((g) => (
                  <section key={g.label}>
                    <h2 className="si__group">{g.label}</h2>
                    <ul>
                      {g.items.map((a) => (
                        <li key={a.id}>
                          <button type="button" className="si__account" onClick={() => choose(a)} disabled={pending} title={a.email}>
                            <span className="si__avatar" aria-hidden="true">
                              {a.initials}
                            </span>
                            <span className="si__who">
                              <b>{a.name}</b>
                              <span>{[a.roles.join(", ") || "No active role", a.unit].join(" · ")}</span>
                            </span>
                            {a.status !== "Active" ? (
                              <span className={`si__status is-${a.status.split(" ")[0].toLowerCase()}`}>{a.status}</span>
                            ) : a.external ? (
                              <span className="si__status is-guest">Guest</span>
                            ) : (
                              <Icon name="chevron" size={16} className="si__chev" />
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
                {!groups.length && <p className="si__empty">No match.</p>}
              </div>
            </>
          )}

          {step === "mfa" && mfa && (
            <>
              <Head
                title="Verify it’s you"
                back="Choose another account"
                onBack={() => {
                  setStep("choose");
                  setError("");
                  setLocked(false);
                }}
              >
                {close}
              </Head>
              <div className="si__person">
                <span className="si__avatar" aria-hidden="true">
                  {accounts.find((a) => a.email === mfa.email)?.initials ?? mfa.name.slice(0, 1)}
                </span>
                <span className="si__who">
                  <b>{mfa.name}</b>
                  <span>{mfa.email}</span>
                </span>
              </div>
              {!mfa.enrolled && (
                <p className="si__notice">
                  <Icon name="key" size={16} />
                  <span>
                    First add the key <b className="num">HUB2 UST6 RANK 1611</b> to your authenticator.
                  </span>
                </p>
              )}
              <form
                className="si__code"
                onSubmit={(e) => {
                  e.preventDefault();
                  verify();
                }}
              >
                <label className="si__otp">
                  <span className="sr-only">6-digit code from your {mfa.method.toLowerCase()}</span>
                  <input
                    id="si-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    disabled={locked}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                      setCode(v);
                      if (v.length === 6) verify(v);
                    }}
                    onFocus={() => setTyping(true)}
                    onBlur={() => setTyping(false)}
                    autoFocus
                  />
                  <span className="si__cells" aria-hidden="true">
                    {Array.from({ length: 6 }, (_, i) => (
                      <span key={i} className={`si__cell${code[i] ? " is-filled" : ""}${typing && i === Math.min(code.length, 5) ? " is-active" : ""}`}>
                        {code[i]}
                      </span>
                    ))}
                  </span>
                </label>
                <button type="submit" className="si__primary" disabled={pending || locked || code.length !== 6}>
                  {pending ? "Checking…" : "Verify"}
                </button>
              </form>
              {error && <Alert>{error}</Alert>}
              <p className="si__demo">
                Demo code <b className="num">{mfa.demoCode.slice(0, 3)} {mfa.demoCode.slice(3)}</b>
              </p>
            </>
          )}
        </div>
      )}
    </dialog>
  );
}
