"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Select } from "@/components/ui/pickers";
import { toast } from "@/components/ui/toast";
import { firstName } from "@/lib/first-name";
import { OrbEngine, type Status } from "./engine";
import { isModel, MODELS, reply, type ModelId, type Turn } from "./reply";

/** The longest message, and how tall the box grows before it scrolls. */
const MAX_MESSAGE = 4000;
const MAX_INPUT_HEIGHT = 160;
const MODEL_KEY = "hub-assistant-model";

/** Ways in for a first question. A click asks it. */
const IDEAS = [
  { icon: "deadline", text: "What’s due before the next deadline?" },
  { icon: "evidence", text: "Summarise this cycle’s open submissions" },
  { icon: "knowledge", text: "Explain a QS or THE indicator" },
  { icon: "pen", text: "Draft an evidence narrative" },
] as const;

/**
 * The assistant in the signed-in workspaces: an orb that docks in the top bar or sticks to the side of the screen it is
 * thrown at, the full-screen chat it opens, and the light round the screen's edge while that chat is open. The page
 * behind is blurred, dimmed and out of reach until the chat closes, from the orb (which shows an X) or with Esc.
 * engine.ts does the moving; this holds the conversation.
 */
export default function Assistant({ name }: { name: string }) {
  const orb = useRef<HTMLButtonElement>(null);
  const body = useRef<HTMLSpanElement>(null);
  const shadow = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const face = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLElement>(null);
  const edge = useRef<HTMLCanvasElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const engine = useRef<OrbEngine | null>(null);
  const stick = useRef(true);
  const abort = useRef<AbortController | null>(null);
  const nextId = useRef(0);

  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [draft, setDraft] = useState("");
  const [model, setModel] = useState<ModelId>(() => {
    try {
      const kept = localStorage.getItem(MODEL_KEY);
      return isModel(kept) ? kept : MODELS[0].id;
    } catch {
      return MODELS[0].id;
    }
  });

  useEffect(() => {
    if (!orb.current || !body.current || !shadow.current || !canvas.current || !face.current || !panel.current || !edge.current) return;
    const running = new OrbEngine({
      orb: orb.current,
      body: body.current,
      shadow: shadow.current,
      canvas: canvas.current,
      face: face.current,
      panel: panel.current,
      edge: edge.current,
      onToggle: () => {
        // The box is about to go inert: the keyboard goes back to the orb rather than being dropped on the page.
        if (panel.current?.contains(document.activeElement)) orb.current?.focus({ preventScroll: true });
        setOpen((o) => !o);
      },
    });
    engine.current = running;
    return () => {
      running.destroy();
      engine.current = null;
    };
  }, []);

  useEffect(() => {
    engine.current?.setOpen(open);
    if (!open) return;
    // A phone's keyboard shouldn't jump up over the conversation just because the box opened.
    if (matchMedia("(pointer: fine)").matches) input.current?.focus({ preventScroll: true });
    else panel.current?.focus({ preventScroll: true });
  }, [open]);

  // Modal: everything in the workspace except the assistant is out of reach until it closes.
  useEffect(() => {
    const app = orb.current?.parentElement;
    if (!open || !app) return;
    const ours: Element[] = [orb.current, panel.current, edge.current, scrim.current].filter((el): el is NonNullable<typeof el> => !!el);
    const shut = [...app.children].filter((el): el is HTMLElement => el instanceof HTMLElement && !ours.includes(el) && !el.inert);
    for (const el of shut) el.inert = true;
    return () => {
      for (const el of shut) el.inert = false;
    };
  }, [open]);

  // Wherever focus has landed inside the assistant, Esc closes it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      orb.current?.focus({ preventScroll: true });
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    engine.current?.setStatus(status);
  }, [status]);

  useEffect(() => () => abort.current?.abort(), []);

  // Stay at the newest message unless they have scrolled back to read.
  useLayoutEffect(() => {
    const el = log.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [turns, status]);

  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }, [draft]);

  const close = useCallback(() => {
    orb.current?.focus({ preventScroll: true });
    setOpen(false);
  }, []);

  const pickModel = (value: string) => {
    if (!isModel(value)) return;
    setModel(value);
    try {
      localStorage.setItem(MODEL_KEY, value);
    } catch {}
  };

  const stop = useCallback(() => abort.current?.abort(), []);

  const send = useCallback(async (asked?: string) => {
    const text = (asked ?? draft).trim();
    if (!text || status !== "idle") return;
    const mine: Turn = { id: ++nextId.current, from: "me", text };
    const history = [...turns, mine];
    setTurns(history);
    setDraft("");
    setStatus("thinking");
    stick.current = true;

    const controller = new AbortController();
    abort.current = controller;
    const answerId = ++nextId.current;
    let started = false;
    try {
      for await (const chunk of reply(history, controller.signal, { model })) {
        if (!started) {
          started = true;
          setStatus("streaming");
          setTurns((all) => [...all, { id: answerId, from: "assistant", text: chunk }]);
        } else {
          setTurns((all) => all.map((t) => (t.id === answerId ? { ...t, text: t.text + chunk } : t)));
        }
      }
      engine.current?.smile();
    } catch (error) {
      if (!controller.signal.aborted) toast(`Could not get an answer: ${error instanceof Error ? error.message : "try again."}`, "error");
    } finally {
      abort.current = null;
      setStatus("idle");
    }
  }, [draft, model, status, turns]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send();
  };

  const onInputKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };

  const startOver = () => {
    stop();
    setTurns([]);
    setDraft("");
    input.current?.focus({ preventScroll: true });
  };

  const busy = status !== "idle";
  const started = turns.length > 0;

  // The chat fills the screen, so the blurred space either side of it is the panel itself (and its bar): a click
  // there closes it, like the scrim. Only when the press began there too, so a text selection dragged out of the
  // conversation doesn't count.
  const pressedFree = useRef(false);
  const isFree = (e: { target: EventTarget; currentTarget: EventTarget }) =>
    e.target === e.currentTarget || (e.target instanceof Element && e.target.classList.contains("assist-top"));

  return (
    <>
      {/* The glow class puts the dashboard's rim colours in reach of the engine, which reads them from here. */}
      <canvas ref={edge} className="assist-edge glow" aria-hidden="true" />

      {/* The page behind the chat, blurred and dimmed: the chat's own background. */}
      <div ref={scrim} className="assist-scrim" data-on={open ? "" : undefined} aria-hidden="true" onClick={close} />

      <section
        ref={panel}
        id="assistant-panel"
        className="assist-panel"
        role="dialog"
        aria-label="Assistant"
        aria-modal={open ? "true" : undefined}
        tabIndex={-1}
        inert={!open}
        data-open={open ? "" : undefined}
        data-started={started ? "" : undefined}
        onPointerDown={(e) => (pressedFree.current = isFree(e))}
        onClick={(e) => {
          if (pressedFree.current && isFree(e)) close();
          pressedFree.current = false;
        }}
      >
        <header className="assist-top">
          <h2 className="assist-top__title">Assistant</h2>
          <span className="chip chip--outline assist-top__chip">Preview</span>
          {started && (
            <button type="button" className="assist-tool" onClick={startOver} aria-label="New chat" data-tip="New chat">
              <Icon name="plus" size={16} />
            </button>
          )}
        </header>

        <div className="assist-stage">
          {started ? (
            <div
              ref={log}
              className="assist-log"
              role="log"
              aria-live="polite"
              aria-label="Conversation"
              tabIndex={0}
              onScroll={(e) => {
                const el = e.currentTarget;
                stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
              }}
            >
              <div className="assist-log__in">
                {turns.map((t) => (
                  <p key={t.id} className={`assist-msg assist-msg--${t.from}`}>
                    {t.text}
                  </p>
                ))}
                {status === "thinking" && (
                  <p className="assist-msg assist-msg--assistant assist-msg--dots" aria-label="Thinking">
                    <i />
                    <i />
                    <i />
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="assist-hello">
              <p className="assist-hello__name">Hi, {firstName(name)}</p>
              <p className="assist-hello__ask">How can I help?</p>
            </div>
          )}

          <form className="assist-ask" onSubmit={onSubmit}>
            <span className="glow assist-ask__bloom" aria-hidden="true" />
            <span className="assist-ask__glass" aria-hidden="true" />
            <span className="glow assist-ask__rim" aria-hidden="true" />
            <textarea
              ref={input}
              className="assist-ask__input"
              rows={1}
              maxLength={MAX_MESSAGE}
              placeholder="Ask the Hub anything…"
              aria-label="Message the assistant"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onInputKey}
            />
            <Select className="select select--sm assist-model" value={model} onChange={pickModel} aria-label="Model">
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </Select>
            {busy ? (
              <button type="button" className="assist-send" onClick={stop} aria-label="Stop">
                <span className="assist-send__stop" />
              </button>
            ) : (
              <button type="submit" className="assist-send" disabled={!draft.trim()} aria-label="Send">
                <Icon name="arrow-up" size={18} />
              </button>
            )}
          </form>

          {!started && (
            <div className="assist-ideas">
              <p className="assist-ideas__head">Try asking</p>
              <ul>
                {IDEAS.map((idea) => (
                  <li key={idea.text}>
                    <button type="button" className="assist-idea" onClick={() => void send(idea.text)}>
                      <Icon name={idea.icon} size={17} />
                      <span>{idea.text}</span>
                      <Icon name="arrow-up-right" size={15} className="assist-idea__go" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      <button ref={orb} type="button" className="assist-orb" aria-label={open ? "Close assistant" : "Open assistant"} aria-expanded={open} aria-controls="assistant-panel">
        <span ref={shadow} className="assist-orb__shadow" />
        <span ref={body} className="assist-orb__body">
          <canvas ref={canvas} className="assist-orb__gl" aria-hidden="true" />
          <span ref={face} className="assist-orb__face" data-mood="open">
            <span className="assist-eye">
              <i />
              <i />
            </span>
            <span className="assist-eye">
              <i />
              <i />
            </span>
          </span>
          {/* While the chat is open the eyes give way to the way out. */}
          <span className="assist-orb__x" aria-hidden="true" />
        </span>
      </button>
    </>
  );
}
