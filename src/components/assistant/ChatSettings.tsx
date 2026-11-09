"use client";

import type { RefObject } from "react";
import { Icon } from "@/components/ui/Icon";
import type { ModelOption } from "@/lib/assistant/types";
import { ProviderLogo } from "./ProviderLogo";

const TIERS = [
  { tier: "free", name: "Free" },
  { tier: "premium", name: "Premium" },
] as const;

/** One model: chosen with a radio if it can be used, otherwise with what's in the way. */
function ModelRow({ m, chosen, onModel, onRequest }: { m: ModelOption; chosen: boolean; onModel: (id: string) => void; onRequest: (id: string) => void }) {
  const text = (
    <>
      <span className="assist-model__mark" aria-hidden="true">
        <ProviderLogo provider={m.provider} />
      </span>
      <span className="assist-model__text">
        <span className="assist-model__name">{m.label}</span>
        <span className="assist-model__maker">{m.maker}</span>
      </span>
    </>
  );
  if (m.state === "ready") {
    return (
      <label className="assist-model assist-model--pick" data-on={chosen ? "" : undefined}>
        <input className="sr-only" type="radio" name="assistant-model" checked={chosen} onChange={() => onModel(m.id)} />
        {text}
        <span className="assist-model__tick" aria-hidden="true">
          <Icon name="check" size={12} />
        </span>
      </label>
    );
  }
  return (
    <div className={`assist-model${m.state === "off" ? " assist-model--off" : ""}`}>
      {text}
      {m.state === "off" && <span className="assist-model__badge">Unavailable</span>}
      {m.state === "pending" && <span className="assist-model__badge">Requested</span>}
      {(m.state === "request" || m.state === "denied") && (
        <button type="button" className="assist-model__ask" onClick={() => onRequest(m.id)} aria-label={`${m.state === "denied" ? "Ask again for" : "Request"} ${m.label}`}>
          {m.state === "denied" ? "Ask again" : "Request"}
        </button>
      )}
    </div>
  );
}

/** The chat's settings, a sheet on top of it: every model at once, by tier. Models is undefined until they've been read. */
export function ChatSettings({
  shown,
  closeRef,
  models,
  model,
  onClose,
  onModel,
  onRequest,
}: {
  shown: boolean;
  closeRef: RefObject<HTMLButtonElement | null>;
  models?: ModelOption[];
  model?: string;
  onClose: () => void;
  onModel: (id: string) => void;
  onRequest: (id: string) => void;
}) {
  return (
    <aside id="assistant-settings" className="assist-side" aria-label="Models" inert={!shown} data-on={shown ? "" : undefined}>
      <header className="assist-side__top">
        <h3 className="assist-side__title">Models</h3>
        <button ref={closeRef} type="button" className="assist-tool" onClick={onClose} aria-label="Close models">
          <Icon name="close" size={16} />
        </button>
      </header>
      <div className="assist-side__body" role="radiogroup" aria-label="Model">
        {!models && [0, 1, 2].map((n) => <div key={n} className="assist-model__blank" />)}
        {models?.length === 0 && <p className="assist-side__empty">No models to show.</p>}
        {models &&
          TIERS.map(({ tier, name }) => {
            const inTier = models.filter((m) => m.tier === tier);
            if (!inTier.length) return null;
            return (
              <section key={tier} className="assist-tier" aria-label={name}>
                <h4 className="assist-tier__name">{name}</h4>
                <ul className="assist-tier__list">
                  {inTier.map((m) => (
                    <li key={m.id}>
                      <ModelRow m={m} chosen={m.id === model} onModel={onModel} onRequest={onRequest} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
      </div>
    </aside>
  );
}
