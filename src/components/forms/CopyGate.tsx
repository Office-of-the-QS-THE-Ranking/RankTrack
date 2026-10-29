"use client";

/*
 * The doors of a form filled in as team copies. Its own link builds nothing: a student organization's Secretary
 * builds each copy from the Student Portal and forwards the copy's link (CopyDoor points there). A private copy
 * opened by someone not on it lets them request access from its owner, or sign in with an account its owner added
 * (CopyGate); someone signed in to the Hub asks with that account only.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestFormCopyAccess } from "@/app/actions/form-copies";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/toast";
import { copyPath } from "@/lib/forms/copies";
import { studentPortalPath } from "@/lib/forms/kinds";
import type { FormKind } from "@/lib/forms/types";
import type { FormWho } from "@/lib/governance/hub-types";
import { WhoBox } from "./copy-parts";

/** A Proposal or Terminal Report form's own link: copies of it are built in the Student Portal. */
export function CopyDoor({ kind, open }: { kind: FormKind; open: boolean }) {
  return (
    <div className="fr-body fr-body--single">
      <div className="fr-card fr-shut fr-door">
        <span className="fr-shut__icon" aria-hidden="true">
          <Icon name={open ? "education" : "lock"} size={22} />
        </span>
        <h2 className="fr-shut__title">{open ? "Start it in the Student Portal" : "This form isn’t taking new copies"}</h2>
        <p className="fr-shut__text">
          {open ? "Your organization’s Secretary builds a copy there and forwards its link to your team." : "Copies already built keep working from their own links."}
        </p>
        {open && (
          <a className="w-btn w-btn--ink w-btn--sm" href={studentPortalPath(kind)}>
            Open the Student Portal <Icon name="arrow" size={15} />
          </a>
        )}
      </div>
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
  // Signed in to the Hub, forms know only that account: another Google account would change nothing here.
  const hub = who?.via === "hub";
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
            <>{email} isn’t on it. Request access from the person who started it{hub ? "." : ", or use another Google account."}</>
          )}
        </p>
        {!(hub && asked) && (
          <div className="fr-gate__who">
            {who && !asked && (
              <button type="button" className="fr-google fr-gate__ask" disabled={busy} onClick={() => void ask()}>
                <Icon name="user-plus" size={17} />
                {busy ? "Sending…" : "Request access"}
              </button>
            )}
            {!hub && <WhoBox who={null} back={copyPath(code, token)} cta={who ? "Use another account" : "Continue with Google"} />}
          </div>
        )}
      </div>
    </div>
  );
}
