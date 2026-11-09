"use client";

import { useEffect, useState } from "react";

/** What the chat says it's up to until the first word of an answer arrives. */
const PHRASES = [
  "Checking now",
  "Verifying details",
  "Locating your concern",
  "Debunking myths",
  "Asking someone",
  "Typing my answer now",
  "Determining your intention",
  "Searching the Hub",
  "Reading the fine print",
  "Comparing notes",
  "Putting it together",
];
const PHRASE_MS = 1800;

/** Every phrase once before any comes back, in a different order each time. */
function shuffled(): string[] {
  const list = [...PHRASES];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** The dots and a changing phrase. A screen reader hears "Thinking" once, not every phrase in the conversation's live region. */
export function Thinking() {
  const [phrases] = useState(shuffled);
  const [turn, setTurn] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTurn((n) => n + 1), PHRASE_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <p className="assist-msg assist-msg--assistant assist-think">
      <span className="sr-only">Thinking</span>
      <span className="assist-think__dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {/* A new key each time, so the phrase rises in again */}
      <span key={turn} className="assist-think__phrase" aria-hidden="true">
        {phrases[turn % phrases.length]}
      </span>
    </p>
  );
}
