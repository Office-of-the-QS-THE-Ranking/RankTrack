"use client";

/*
 * The sign-in sidebar's form as the demo shows it: the real page's heading, buttons and styles (signin.css), with
 * nothing behind them. Signing in opens the demo's dashboard; no account, Google or session is involved.
 */
import Link from "next/link";
import { useState } from "react";
import { FlowHeading } from "@/components/signin/FlowHeading";
import { GoogleMark } from "@/components/ui/GoogleMark";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/toast";
import { DEMO_BASE } from "@/lib/demo-portal/paths";

const NOT_IN_DEMO = "Access requests aren’t part of the demo. Sign in to look around.";

export function DemoSignIn() {
  const [keep, setKeep] = useState(false);
  return (
    <>
      <FlowHeading />
      <div className="si" data-step="start">
        <div className="si__actions">
          <Link href={DEMO_BASE} className="si__google">
            <span className="si__google-mark">
              <GoogleMark />
            </span>
            Sign in via Institution Account
          </Link>
          <label className="si__keep">
            <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.currentTarget.checked)} />
            <span>Keep me signed in</span>
          </label>
          <div className="si__divider">
            <span>or</span>
          </div>
          <button type="button" className="si__alt" onClick={() => toast(NOT_IN_DEMO, "info")}>
            <span className="si__alt-mark" aria-hidden="true">
              <Icon name="user-plus" size={21} strokeWidth={1.6} />
            </span>
            Request access
            <span className="si__alt-go" aria-hidden="true">
              <Icon name="arrow" size={18} strokeWidth={1.6} />
            </span>
          </button>
        </div>
        <p className="si__note si__note--track">
          <Icon name="clock" size={14} />
          <span>
            Already submitted your request?{" "}
            <button type="button" className="si__link si__link--inline" onClick={() => toast(NOT_IN_DEMO, "info")}>
              Track your status here
            </button>
          </span>
        </p>
      </div>
    </>
  );
}
