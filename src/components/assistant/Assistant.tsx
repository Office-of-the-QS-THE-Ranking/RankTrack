"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { assistantOptions, requestModelAccess } from "@/app/actions/agentic-control";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/toast";
import { useTypedPlaceholder } from "@/components/ui/use-typed-placeholder";
import type { ChatOptions } from "@/lib/assistant/types";
import { firstName } from "@/lib/first-name";
import { Answer } from "./Answer";
import { ChatSettings } from "./ChatSettings";
import { OrbEngine, type Status } from "./engine";
import { reply, type Turn } from "./reply";
import { Thinking } from "./Thinking";

/** The longest message, and how tall the box grows before it scrolls. */
const MAX_MESSAGE = 4000;
const MAX_INPUT_HEIGHT = 160;
const MODEL_KEY = "hub-assistant-model";

/** What the suggestion button can put in the box: things from the Hub, and things it can simply help with. */
const IDEAS = [
  "When is the next ranking deadline?",
  "What makes evidence acceptable?",
  "What does each ranking measure?",
  "Who runs the Office of QS/THE Rankings?",
  "How do university rankings work?",
  "Help me write a short email asking a unit for its data",
];

/** What the empty box types out in turn, one every eight seconds, and what it shows when it can't animate. */
const PROMPTS = [
  "Ask about the next ranking deadline…",
  "Ask what makes evidence acceptable…",
  "Ask how university rankings work…",
  "Ask for help writing an email…",
  "Ask about the Office and its work…",
];
const PROMPT_CYCLE_MS = 8000;
const PROMPT_FALLBACK = "Ask me anything…";

/**
 * The assistant in the signed-in workspaces: an orb that docks in the top bar or sticks to the side of the screen it is
 * thrown at, the full-screen chat it opens, and the light round the screen's edge while that chat is open. The page
 * behind is covered and out of reach until the chat closes, from the orb (which shows an X) or with Esc.
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
  const settingsButton = useRef<HTMLButtonElement>(null);
  const settingsClose = useRef<HTMLButtonElement>(null);
  const engine = useRef<OrbEngine | null>(null);
  const stick = useRef(true);
  const abort = useRef<AbortController | null>(null);
  const nextId = useRef(0);

  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [draft, setDraft] = useState("");
  const [suggested, setSuggested] = useState(0);
  const [options, setOptions] = useState<ChatOptions | null>(null);
  const [kept, setKept] = useState<string | null>(() => {
    try {
      return localStorage.getItem(MODEL_KEY);
    } catch {
      return null;
    }
  });
  // The one they chose, while it's still theirs to use; the Office can change that at any time.
  const usable = options?.models.filter((m) => m.state === "ready") ?? [];
  const model = (usable.find((m) => m.id === kept) ?? usable.find((m) => m.isDefault) ?? usable[0])?.id;

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
        setSettings(false);
        setOpen((o) => !o);
      },
    });
    engine.current = running;
    return () => {
      running.destroy();
      engine.current = null;
    };
  }, []);

  // Read each time it opens, so a provider connected or a model switched off on the AI tab reaches everyone.
  useEffect(() => {
    if (!open) return;
    let stale = false;
    void assistantOptions().then((o) => {
      if (!stale) setOptions(o);
    });
    return () => {
      stale = true;
    };
  }, [open]);

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

  // The sidebar has only just stopped being inert, so this can't be done from the click that opened it.
  useEffect(() => {
    if (settings) settingsClose.current?.focus({ preventScroll: true });
  }, [settings]);

  const closeSettings = useCallback(() => {
    setSettings(false);
    settingsButton.current?.focus({ preventScroll: true });
  }, []);

  // Wherever focus has landed inside the assistant, Esc closes the settings first, then the chat.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      // Already used by a picker inside the chat. React's own listener on document runs first.
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (settings) return closeSettings();
      orb.current?.focus({ preventScroll: true });
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, settings, closeSettings]);

  // The input lets go of the keyboard once a message is sent, so typing anything takes it straight back. Nothing is
  // cancelled: the browser puts this same key into the box that now has focus.
  useEffect(() => {
    if (!open || settings) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      const box = input.current;
      const active = document.activeElement;
      if (e.defaultPrevented || !box || active === box) return;
      if (active instanceof HTMLElement && (active.isContentEditable || active.closest("input, textarea, select"))) return;
      const command = (e.ctrlKey || e.metaKey) && !e.getModifierState("AltGraph");
      // Backspace on an empty box has nothing to do, and a held key would otherwise take back the focus it just gave up.
      const erases = e.key === "Backspace" && !!box.value;
      const writes = command ? e.key.toLowerCase() === "v" : e.key.length === 1 || erases || ["Dead", "Process"].includes(e.key);
      if (!writes) return;
      // Space belongs to a focused button, link or the conversation's scrolling.
      if (e.key === " " && active !== document.body && active !== panel.current) return;
      box.focus({ preventScroll: true });
      box.setSelectionRange(box.value.length, box.value.length);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, settings]);

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
    setSettings(false);
    setOpen(false);
  }, []);

  const pickModel = (value: string) => {
    setKept(value);
    try {
      localStorage.setItem(MODEL_KEY, value);
    } catch {}
  };

  const askForModel = async (id: string) => {
    const r = await requestModelAccess(id).catch(() => ({ ok: false as const, message: "Couldn’t send that. Try again." }));
    toast(r.message, r.ok ? "ok" : "error");
    if (r.ok && r.data) setOptions(r.data);
  };

  const stop = useCallback(() => abort.current?.abort(), []);

  // A random question in the box, never the one already there, ready to edit or send.
  const suggest = () => {
    setSuggested((n) => n + 1);
    const others = IDEAS.filter((idea) => idea !== draft);
    setDraft(others[Math.floor(Math.random() * others.length)]);
    input.current?.focus({ preventScroll: true });
  };

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || status !== "idle" || options?.unavailable) return;
    const mine: Turn = { id: ++nextId.current, from: "me", text };
    const history = [...turns, mine];
    setTurns(history);
    setDraft("");
    setStatus("thinking");
    // The panel rather than nothing, so Tab and Esc still start from inside the chat. On a phone this also lowers the keyboard.
    panel.current?.focus({ preventScroll: true });
    stick.current = true;

    const controller = new AbortController();
    abort.current = controller;
    const answerId = ++nextId.current;
    let started = false;
    const write = (edit: (text: string) => string) => {
      if (!started) {
        started = true;
        setStatus("streaming");
        setTurns((all) => [...all, { id: answerId, from: "assistant", text: edit("") }]);
      } else {
        setTurns((all) => all.map((t) => (t.id === answerId ? { ...t, text: edit(t.text) } : t)));
      }
    };
    try {
      for await (const event of reply(history, controller.signal, { model })) {
        if (event.t === "delta") write((text) => text + event.text);
        else if (event.t === "replace") write(() => event.text);
        else if (event.t === "sources") setTurns((all) => all.map((t) => (t.id === answerId ? { ...t, sources: event.sources, ...(event.internal && { internal: true }) } : t)));
        else if (event.t === "notice") toast(event.text, "info");
        else if (event.t === "error") throw new Error(event.message);
      }
      if (started) engine.current?.smile();
    } catch (error) {
      if (!controller.signal.aborted) toast(`Could not get an answer: ${error instanceof Error ? error.message : "try again."}`, "error");
    } finally {
      abort.current = null;
      setStatus("idle");
    }
  }, [draft, model, options?.unavailable, status, turns]);

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
  const prompt = useTypedPlaceholder(PROMPT_FALLBACK, PROMPTS, open && !draft, PROMPT_CYCLE_MS);
  const started = turns.length > 0;

  // The chat fills the screen, so the empty space either side of it is the panel itself (and its bar): a click
  // there closes it, like the scrim. Only when the press began there too, so a text selection dragged out of the
  // conversation doesn't count.
  const pressedFree = useRef(false);
  const isFree = (e: { target: EventTarget; currentTarget: EventTarget }) =>
    e.target === e.currentTarget || (e.target instanceof Element && e.target.classList.contains("assist-top"));

  return (
    <>
      {/* The glow class puts the dashboard's rim colours in reach of the engine, which reads them from here. */}
      <canvas ref={edge} className="assist-edge glow" aria-hidden="true" />

      {/* Covers the page behind the chat: the chat's own background, black in both themes and ruled out from its column. */}
      <div ref={scrim} className="assist-scrim" data-on={open ? "" : undefined} aria-hidden="true" onClick={close}>
        <i className="assist-rule assist-rule--top" />
        <i className="assist-rule assist-rule--foot" />
        <i className="assist-guide assist-guide--start" />
        <i className="assist-guide assist-guide--end" />
        <i className="assist-tick assist-tick--top assist-tick--start" />
        <i className="assist-tick assist-tick--top assist-tick--end" />
        <i className="assist-tick assist-tick--foot assist-tick--start" />
        <i className="assist-tick assist-tick--foot assist-tick--end" />
      </div>

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
        data-settings={settings ? "" : undefined}
        onPointerDown={(e) => (pressedFree.current = isFree(e))}
        onClick={(e) => {
          if (pressedFree.current && isFree(e)) {
            if (settings) closeSettings();
            else close();
          }
          pressedFree.current = false;
        }}
      >
        <ChatSettings
          shown={settings}
          closeRef={settingsClose}
          models={options?.models}
          model={model}
          onClose={closeSettings}
          onModel={pickModel}
          onRequest={(id) => void askForModel(id)}
        />

        <header className="assist-top theme-dark">
          <h2 className="assist-top__title">Assistant</h2>
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
              className="assist-log theme-dark"
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
                {turns.map((t, i) =>
                  t.from === "assistant" ? (
                    <Answer key={t.id} text={t.text} sources={t.sources} streaming={busy && i === turns.length - 1} />
                  ) : (
                    <p key={t.id} className="assist-msg assist-msg--me">
                      {t.text}
                    </p>
                  ),
                )}
                {status === "thinking" && <Thinking />}
              </div>
            </div>
          ) : (
            <div className="assist-hello theme-dark">
              <p className="assist-hello__name">Hi, {firstName(name)}</p>
              <p className="assist-hello__ask">{options?.unavailable ?? "How can I help?"}</p>
            </div>
          )}

          <form className="assist-ask" onSubmit={onSubmit}>
            <span className="glow assist-ask__bloom" aria-hidden="true" />
            <span className="assist-ask__glass" aria-hidden="true" />
            <span className="glow assist-ask__rim" aria-hidden="true" />
            <textarea
              ref={input}
              className="assist-ask__input"
              rows={2}
              maxLength={MAX_MESSAGE}
              placeholder={prompt}
              aria-label="Message the assistant"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                // Erased back to nothing: the input lets go of the keyboard, as it does after sending.
                const edit = e.nativeEvent instanceof InputEvent ? e.nativeEvent.inputType : "";
                if (!e.target.value && edit.startsWith("delete")) panel.current?.focus({ preventScroll: true });
              }}
              onKeyDown={onInputKey}
            />
            <div className="assist-ask__row">
              <button
                ref={settingsButton}
                type="button"
                className="assist-pill"
                aria-expanded={settings}
                aria-controls="assistant-settings"
                onClick={() => (settings ? closeSettings() : setSettings(true))}
              >
                <span className="assist-pill__icon">
                  <Icon name="settings" size={15} />
                </span>
                Settings
              </button>
              <button type="button" className="assist-pill" onClick={suggest}>
                {/* A new key each time, so the burst plays again */}
                <span key={suggested} className="assist-pill__icon" data-fired={suggested ? "" : undefined}>
                  <Icon name="spark" size={15} />
                </span>
                Suggestion
              </button>
              {busy ? (
                <button type="button" className="assist-send" onClick={stop} aria-label="Stop">
                  <span className="assist-send__stop" />
                </button>
              ) : (
                <button type="submit" className="assist-send" disabled={!draft.trim() || !!options?.unavailable} aria-label="Send">
                  <Icon name="arrow-up" size={18} />
                </button>
              )}
            </div>
          </form>

          {/* Read before the first message of a chat; after that the conversation gets the room. */}
          {!started && (
            <p className="assist-note theme-dark">
              Don’t share personal details, as some model providers may read messages. Answers can be wrong, so check the sources. Chats may be collected and reviewed to improve the service. By using this, you agree to the{" "}
              <a href="/terms" target="_blank" rel="noopener">
                Terms
              </a>{" "}
              and{" "}
              <a href="/privacy" target="_blank" rel="noopener">
                Privacy Policy
              </a>
              .
            </p>
          )}
        </div>
      </section>

      <button ref={orb} type="button" className="assist-orb" data-fx="off" aria-label={open ? "Close assistant" : "Open assistant"} aria-expanded={open} aria-controls="assistant-panel">
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
