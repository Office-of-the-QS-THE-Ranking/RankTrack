"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { regenerateFormCopyLink } from "@/app/actions/form-copies";
import { Icon } from "@/components/ui/Icon";
import { QrCode } from "@/components/ui/QrCode";
import { toast } from "@/components/ui/toast";
import { Sheet } from "@/components/workspace/parts";
import { copyPath } from "@/lib/forms/copies";
import type { CopyView } from "@/lib/governance/hub-types";
import { FormLink } from "./FormLink";
import { keepCopy, replaceKeptCopyToken } from "./copy-parts";

const CONFIRM_WORD = "Generate";

export function CopyLinkActions({ code, copy, email, beforeReplace }: { code: string; copy: CopyView; email?: string; beforeReplace: () => Promise<boolean> }) {
  const router = useRouter();
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped] = useState("");
  const qr = useRef<HTMLSpanElement>(null);
  useEffect(() => setTarget(document.getElementById("fr-copy-link-actions")), []);
  if (!target) return null;
  const url = new URL(copyPath(code, copy.token), window.location.origin).href;

  function download() {
    try {
      const svg = qr.current?.querySelector("svg")?.cloneNode(true) as SVGSVGElement | undefined;
      if (!svg) throw new Error("Missing QR code");
      const size = svg.viewBox.baseVal.width;
      svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      svg.setAttribute("viewBox", `-4 -4 ${size + 8} ${size + 8}`);
      svg.setAttribute("width", "1024");
      svg.setAttribute("height", "1024");
      svg.setAttribute("style", "color:#000000;background:#ffffff");
      const background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      for (const [key, value] of Object.entries({ x: "-4", y: "-4", width: String(size + 8), height: String(size + 8), fill: "#ffffff" })) background.setAttribute(key, value);
      svg.prepend(background);
      const objectUrl = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }));
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `${copy.ref.replace(/[^a-zA-Z0-9_-]/g, "-")}-QR.svg`;
      document.body.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      toast("The QR code couldn’t be downloaded. Try again.", "error");
    }
  }

  async function regenerate() {
    setBusy(true);
    try {
      if (!(await beforeReplace())) {
        toast("Your latest changes couldn’t be saved. Try again before replacing the link.", "error");
        return;
      }
      const r = await regenerateFormCopyLink({ code, token: copy.token });
      toast(r.message, r.ok ? "ok" : "error");
      if (!r.ok) return;
      replaceKeptCopyToken(code, copy.token, r.token);
      keepCopy({ code, token: r.token, ref: copy.ref, label: copy.label }, email);
      setOpen(false);
      setConfirm(false);
      router.replace(copyPath(code, r.token), { scroll: false });
    } catch {
      toast("The Hub could not be reached. Reload to check the current link before trying again.", "error");
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <>
      <span hidden ref={qr}><QrCode value={url} label="Downloadable QR code" /></span>
      <span className="fr-copy-link-actions">
        <button type="button" onClick={download}><Icon name="download" size={14} /> Download</button>
        {copy.mine && <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog"><Icon name="pen" size={14} /> Edit</button>}
      </span>
      {open && copy.mine && createPortal(
        <Sheet title="QR code and link" className="fr-link-sheet" onClose={() => { setOpen(false); setConfirm(false); }}>
          {() => (
            <div className="ws-sheet__body fr-link-editor">
              <figure className="fr-link-editor__card">
                <div className="fr-link-editor__qr"><QrCode value={url} label="Current form link" /></div>
                <figcaption>
                  <span className="fr-link-editor__ref">{copy.ref}</span>
                  <button type="button" className="fr-link-editor__dl" onClick={download}><Icon name="download" size={14} /> Download QR</button>
                </figcaption>
              </figure>
              <div className="fr-link-editor__side">
                <section className="fr-link-editor__group">
                  <h3>Link</h3>
                  <FormLink url={url} copied="Copy link copied." />
                </section>
                <dl className="fr-link-editor__facts">
                  <div><dt>File name</dt><dd>{copy.label}</dd></div>
                  <div><dt>Reference</dt><dd>{copy.ref}</dd></div>
                  <div><dt>Access</dt><dd><Icon name={copy.access === "private" ? "lock" : "link"} size={13} /> {copy.access === "private" ? "Private" : "Anyone with the link"}</dd></div>
                </dl>
                <section className="fr-link-editor__reset">
                  <button type="button" className="btn btn--dark fr-link-editor__generate" onClick={() => { setTyped(""); setConfirm(true); }} aria-haspopup="dialog">
                    <Icon name="refresh" size={15} /> Generate New Link/QR Code
                  </button>
                  <p>Answers, file name, reference and access stay the same.</p>
                </section>
              </div>
            </div>
          )}
        </Sheet>, document.body,
      )}
      {open && confirm && copy.mine && createPortal(
        <Sheet title="Generate a new link?" className="ws-sheet--confirm fr-link-confirm" onClose={() => setConfirm(false)}>
          {(close) => (
            <form
              className="ws-sheet__body"
              onSubmit={(event) => {
                event.preventDefault();
                if (typed === CONFIRM_WORD) void regenerate();
              }}
            >
              <p className="fr-link-confirm__warn"><Icon name="alert" size={16} /> The current link and QR code stop working now.</p>
              <label className="fr-link-confirm__field">
                <span>Type <strong>{CONFIRM_WORD}</strong> to confirm.</span>
                <input className="input" value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} autoFocus disabled={busy} />
              </label>
              <footer className="ws-sheet__foot">
                <button type="button" className="btn" onClick={close} disabled={busy}>Cancel</button>
                <button type="submit" className="btn btn--dark fr-link-confirm__go" disabled={busy || typed !== CONFIRM_WORD} aria-busy={busy}>
                  <Icon name="refresh" size={15} /> {busy ? "Generating…" : "Generate"}
                </button>
              </footer>
            </form>
          )}
        </Sheet>, document.body,
      )}
    </>, target,
  );
}
