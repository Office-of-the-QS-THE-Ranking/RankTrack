"use client";

/*
 * The demo bar: always on screen, it says this is sample data that is never saved, lets the visitor switch between
 * the roles, and leads out to the real sign-in. Inside an iframe (a portfolio embed) Google sign-in can't run, so
 * Exit demo opens the sign-in in a new tab there.
 */
import { useEffect, useState } from "react";
import { Select } from "@/components/ui/pickers";
import type { DemoRole } from "@/lib/demo-portal/roles";

export function DemoBanner({ role, roles, onRole }: { role: DemoRole; roles: readonly DemoRole[]; onRole: (key: string) => void }) {
  const [framed, setFramed] = useState(false);
  useEffect(() => {
    try {
      setFramed(window.self !== window.top);
    } catch {
      // A cross-origin parent can't even be compared: that is a frame too.
      setFramed(true);
    }
  }, []);

  return (
    <div className="demo-bar" role="region" aria-label="Demo">
      <p className="demo-bar__note">
        <b>Demo</b>
        <span aria-hidden="true"> · </span>
        <span>sample data</span>
        <span aria-hidden="true"> · </span>
        <span>nothing is saved</span>
      </p>
      <label className="demo-bar__role">
        <span className="demo-bar__label">View as</span>
        <Select className="select select--sm" value={role.key} onChange={onRole} aria-label="Demo role">
          {roles.map((r) => (
            <option key={r.key} value={r.key}>
              {`${r.label} · ${r.hint}`}
            </option>
          ))}
        </Select>
      </label>
      <a className="demo-bar__exit" href="/signin" data-demo-exit="" {...(framed && { target: "_blank", rel: "noopener noreferrer" })}>
        Exit demo{framed && <span className="sr-only"> (opens in a new tab)</span>}
      </a>
    </div>
  );
}
