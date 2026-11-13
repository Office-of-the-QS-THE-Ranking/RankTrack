"use client";

import { closeModal, openModal } from "@/components/ui/modal-motion";

/*
 * Command & Control: the governance console as a page of its own. Its sections are sub-tabs in the sidebar,
 * one route each. The layout holds the console data and confirmations, so they carry over between
 * sections; outcomes go to the Hub-wide toasts (ui/toast). Every change
 * goes through the server, which re-checks the administrator's permissions, applies it, writes it to
 * the audit log, and re-renders the workspace.
 */
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { governConsole, loadConsole } from "@/app/actions/governance";
import type { Command, CommandResult } from "@/lib/governance/commands";
import type { ConsoleData } from "@/lib/governance/console-types";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/toast";
import { sectionHref, sectionInfo, type SectionInfo, type SectionKey } from "./sections";
import { ConsoleCtx, type ConfirmOptions, type ConsoleApi } from "./ui";
import { usePending } from "@/components/ui/ButtonBusy";

export function CommandControlConsole({ initial, base, children }: { initial: ConsoleData; base: string; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? base;
  const confirmRef = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<ConsoleData>(initial);
  const [ended, setEnded] = useState(false);
  const [busy, setBusy] = useState(false);
  usePending(busy);
  const [headerActions, setHeaderActions] = useState<HTMLDivElement | null>(null);
  const [focus, setFocus] = useState<{ path: string; id: string } | null>(null);
  const [ask, setAsk] = useState<{
    opts: ConfirmOptions;
    resolve: (v: string | null) => void;
  } | null>(null);
  const [answer, setAnswer] = useState("");
  const [answerError, setAnswerError] = useState(false);

  // The server re-renders the layout after every change; take its copy when it arrives.
  useEffect(() => setData(initial), [initial]);

  const notify = useCallback((message: string, tone: "ok" | "error" = "ok") => toast(message, tone), []);

  const run = useCallback(async (cmd: Command): Promise<CommandResult> => {
    setBusy(true);
    try {
      const { result, data: next } = await governConsole(cmd);
      if (next) setData(next);
      else if (!result.ok && /session has ended/i.test(result.message)) setEnded(true);
      return result;
    } catch {
      return {
        ok: false,
        message: "The server could not be reached. Nothing was changed.",
      };
    } finally {
      setBusy(false);
    }
  }, []);

  const confirm = useCallback((opts: ConfirmOptions) => {
    setAnswer("");
    setAnswerError(false);
    return new Promise<string | null>((resolve) => setAsk({ opts, resolve }));
  }, []);

  useEffect(() => {
    const d = confirmRef.current;
    if (!d) return;
    if (ask && !d.open) openModal(d);
    if (!ask && d.open) d.close();
  }, [ask]);

  const settle = (value: string | null) => {
    if (!ask) return;
    if (value !== null && ask.opts.input?.required && answer.trim().length < 3) {
      setAnswerError(true);
      return;
    }
    closeModal(confirmRef.current, () => {
      confirmRef.current?.close();
      ask.resolve(value);
      setAsk(null);
    });
  };

  const go = useCallback(
    (s: SectionKey, f?: string) => {
      const href = sectionHref(base, s);
      setFocus(f ? { path: href, id: f } : null);
      router.push(href);
    },
    [base, router],
  );

  const reload = useCallback(async () => {
    const d = await loadConsole().catch(() => null);
    if (d) setData(d);
  }, []);

  const allowed = useCallback((s: SectionInfo) => !s.module || data.viewer.commandControl.includes(s.module), [data]);
  const current = sectionInfo(pathname.slice(base.length + 1).split("/")[0]);
  const focusId = focus && focus.path === pathname ? focus.id : undefined;
  // A record or tab to open on applies once: leaving the section drops it.
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    setFocus((f) => (f && f.path === pathname ? f : null));
  }, [pathname]);

  const api: ConsoleApi = useMemo(() => ({ data, run, busy, notify, confirm, go, reload, focus: focusId, headerActions }), [data, run, busy, notify, confirm, go, reload, focusId, headerActions]);

  return (
    <div className="cmd">
      <header className="ph cmd-ph">
        <div className="ph__main">
          <h1 className="ph__title">{current?.title ?? "Command & Control"}</h1>
        </div>
        <div className="ph__actions" ref={setHeaderActions} />
      </header>

      <div className="cmd-main" key={pathname}>
        {ended ? (
          <div className="cmd-empty">
            <Icon name="lock" size={22} />
            <p className="cmd-empty__title">Your session has ended</p>
            <p className="cmd-empty__text">Sign in again to continue.</p>
          </div>
        ) : current && !allowed(current) ? (
          <div className="cmd-empty">
            <Icon name="lock" size={22} />
            <p className="cmd-empty__title">Not part of your role</p>
          </div>
        ) : (
          <ConsoleCtx.Provider value={api}>{children}</ConsoleCtx.Provider>
        )}
      </div>

      <dialog
        ref={confirmRef}
        className="cmd-confirm"
        aria-labelledby="cmd-confirm-title"
        onCancel={(e) => {
          e.preventDefault();
          settle(null);
        }}
      >
        {ask && (
          <form
            method="dialog"
            onSubmit={(e) => {
              e.preventDefault();
              settle(answer);
            }}
          >
            <h3 id="cmd-confirm-title" className="cmd-confirm__title">
              {ask.opts.title}
            </h3>
            {ask.opts.body && <div className="cmd-confirm__body">{ask.opts.body}</div>}
            {ask.opts.input && (
              <label className="cmd-field">
                <span className="cmd-field__label">{ask.opts.input.label}</span>
                {ask.opts.input.multiline ? (
                  <textarea
                    className="textarea"
                    value={answer}
                    placeholder={ask.opts.input.placeholder}
                    aria-invalid={answerError || undefined}
                    onChange={(e) => {
                      setAnswer(e.target.value);
                      setAnswerError(false);
                    }}
                    autoFocus
                  />
                ) : (
                  <input
                    className="input"
                    value={answer}
                    placeholder={ask.opts.input.placeholder}
                    aria-invalid={answerError || undefined}
                    onChange={(e) => {
                      setAnswer(e.target.value);
                      setAnswerError(false);
                    }}
                    autoFocus
                  />
                )}
                {answerError && <span className="field__error">Required: it is kept in the audit log.</span>}
              </label>
            )}
            <div className="cmd-confirm__actions">
              <button type="button" className="btn" onClick={() => settle(null)}>
                Cancel
              </button>
              <button type="submit" className={`btn ${ask.opts.tone === "danger" ? "btn--danger" : "btn--dark"}`} autoFocus={!ask.opts.input}>
                {ask.opts.confirm}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </div>
  );
}
