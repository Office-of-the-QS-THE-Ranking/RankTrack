"use client";

/*
 * Administration › AI Assistant: what the chat runs on and what it costs. Providers connect with a pasted key, because
 * no provider offers a sign-in link for this; credit is bought on the provider's own site and recorded here, because
 * none of them sells it or reports a balance through an API. So "left" is always an estimate, and says so.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  connectProvider,
  decideModelRequest,
  disconnectProvider,
  rebuildAssistantIndex,
  recheckProvider,
  recordCredits,
  setProviderLimits,
  updateModel,
  updateSettings,
} from "@/app/actions/assistant";
import { TabPanel } from "@/components/ui/interactive";
import { Icon } from "@/components/ui/Icon";
import { NumberField, Select } from "@/components/ui/pickers";
import { overBudget, PROVIDERS, sharesData } from "@/lib/assistant/rules";
import type { AssistantDesk, ModelRow, ProviderRow, UsageRow } from "@/lib/assistant/types";
import { Bars, Block, Disclosure, download, EmptyNote, Field, fmtAgo, fmtDate, Hint, Pill, RowMenu, Sheet, Stat, Switch, Tabs, useConsole } from "../ui";

type Result = { ok: boolean; message: string; data?: AssistantDesk };
type TabKey = "overview" | "models" | "usage";

const ID_BASE = "ai-admin";
const DAY_MS = 86_400_000;

const usd = (n: number) => (n > 0 && n < 0.01 ? "<$0.01" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
/** Prices per million tokens run to fractions of a cent. */
const price = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
const count = (n: number) => n.toLocaleString("en-PH");
const compact = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));
const manilaDay = (at: number) => new Date(at + 8 * 3_600_000).toISOString().slice(0, 10);
const shortDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

const STATUS: Record<ProviderRow["status"], { label: string; tone: "ok" | "danger" | "neutral" }> = {
  ok: { label: "Connected", tone: "ok" },
  disconnected: { label: "Not connected", tone: "neutral" },
  no_credit: { label: "Out of credit", tone: "danger" },
  bad_key: { label: "Key refused", tone: "danger" },
};

export function AssistantAdmin({ initial }: { initial: AssistantDesk }) {
  const { notify, confirm } = useConsole();
  const [desk, setDesk] = useState(initial);
  const [tab, setTab] = useState<TabKey>("overview");
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState<ProviderRow | null>(null);
  const [crediting, setCrediting] = useState<ProviderRow | null>(null);
  const [pricing, setPricing] = useState<ModelRow | null>(null);

  /** Run an action, report it, and take the fresh desk it returns. */
  const act = async (work: Promise<Result>) => {
    setBusy(true);
    try {
      const r = await work;
      notify(r.message, r.ok ? "ok" : "error");
      if (r.ok && r.data) setDesk(r.data);
      return r.ok;
    } catch {
      notify("That didn’t go through. Try again.", "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  // Keep the sheets on the provider's latest figures after an action.
  const liveProvider = (p: ProviderRow | null) => (p ? (desk.providers.find((x) => x.id === p.id) ?? p) : null);

  const togglePaused = async () => {
    if (!desk.paused) {
      const ok = await confirm({ title: "Turn the assistant off?", body: "Nobody can ask it anything until it’s turned back on.", confirm: "Turn off", tone: "danger" });
      if (ok === null) return;
    }
    await act(updateSettings({ paused: !desk.paused }));
  };

  const tabs = [
    { key: "overview" as const, label: "Overview" },
    { key: "models" as const, label: "Models", count: desk.requests.length || undefined, countTone: "alert" as const },
    { key: "usage" as const, label: "Usage" },
  ];

  return (
    <div className="adm-stack ai-admin">
      <Notices desk={desk} onConnect={setConnecting} onCredit={setCrediting} onRecheck={(id) => void act(recheckProvider(id))} onModels={() => setTab("models")} busy={busy} />

      <Tabs
        tabs={tabs}
        value={tab}
        onChange={setTab}
        label="AI Assistant"
        idBase={ID_BASE}
        actions={
          <button type="button" className="btn content-tabs__action" aria-pressed={!desk.paused} onClick={() => void togglePaused()} disabled={busy}>
            <Icon name={desk.paused ? "play" : "ban"} size={15} />
            {desk.paused ? "Turn on" : "Turn off"}
          </button>
        }
      />

      <TabPanel idBase={ID_BASE} index={tabs.findIndex((t) => t.key === tab)}>
        {tab === "overview" && <Overview desk={desk} busy={busy} onConnect={setConnecting} onCredit={setCrediting} onRebuild={() => void act(rebuildAssistantIndex())} />}
        {tab === "models" && <Models desk={desk} busy={busy} act={act} onPrice={setPricing} />}
        {tab === "usage" && <Usage desk={desk} />}
      </TabPanel>

      {connecting && <ConnectSheet provider={liveProvider(connecting)!} desk={desk} busy={busy} act={act} onClose={() => setConnecting(null)} confirm={confirm} />}
      {crediting && <CreditSheet provider={liveProvider(crediting)!} busy={busy} act={act} onClose={() => setCrediting(null)} />}
      {pricing && <PriceSheet model={pricing} busy={busy} act={act} onClose={() => setPricing(null)} />}
    </div>
  );
}

/* ---------- What needs someone's attention ---------- */

function Notice({ tone, icon, title, text, children }: { tone: "revise" | "danger"; icon: "alert" | "ban"; title: string; text?: string; children?: ReactNode }) {
  return (
    <div className={`adm-callout is-${tone}`} role="status">
      <Icon name={icon} size={18} />
      <div>
        <b>{title}</b>
        {text && <p>{text}</p>}
        {children && <div className="adm-actions">{children}</div>}
      </div>
    </div>
  );
}

function Notices({ desk, onConnect, onCredit, onRecheck, onModels, busy }: { desk: AssistantDesk; onConnect: (p: ProviderRow) => void; onCredit: (p: ProviderRow) => void; onRecheck: (id: string) => void; onModels: () => void; busy: boolean }) {
  const cloudflare = desk.providers.find((p) => p.id === "cloudflare");
  const anyChat = desk.providers.some((p) => p.status === "ok");
  return (
    <>
      {desk.paused && <Notice tone="revise" icon="ban" title="The assistant is off for everyone." />}
      {cloudflare?.status === "disconnected" && (
        <Notice tone="revise" icon="alert" title="Connect Cloudflare to start" text="It builds the search index the assistant answers from.">
          <button type="button" className="btn btn--sm btn--dark" onClick={() => onConnect(cloudflare)}>
            Connect Cloudflare
          </button>
        </Notice>
      )}
      {!anyChat && cloudflare?.status !== "disconnected" && <Notice tone="revise" icon="alert" title="No model is connected." />}
      {desk.index.error && <Notice tone="danger" icon="alert" title="The search index couldn’t be built" text={desk.index.error} />}
      {desk.providers.map((p) => {
        if (p.status === "no_credit" || p.status === "bad_key") {
          return (
            <Notice key={p.id} tone="danger" icon="alert" title={`${p.label} stopped answering`} text={p.status === "no_credit" ? "It has no credit left. Its models are out of the chat." : "It refused the saved key. Its models are out of the chat."}>
              {p.status === "no_credit" ? (
                <button type="button" className="btn btn--sm btn--dark" onClick={() => onCredit(p)}>
                  Add credits
                </button>
              ) : (
                <button type="button" className="btn btn--sm btn--dark" onClick={() => onConnect(p)}>
                  Replace the key
                </button>
              )}
              <button type="button" className="btn btn--sm" disabled={busy} onClick={() => onRecheck(p.id)}>
                Try again
              </button>
            </Notice>
          );
        }
        if (p.status !== "ok") return null;
        if (overBudget(p.budget, p.spentMonth)) return <Notice key={p.id} tone="revise" icon="alert" title={`${p.label} reached its budget`} text={`${usd(p.spentMonth)} of ${usd(p.budget!)} this month. Its models are paused until next month.`} />;
        if (p.plan === "paid" && p.left !== null && p.left <= p.low) {
          return (
            <Notice key={p.id} tone="revise" icon="alert" title={`${p.label} credits are low`} text={`About ${usd(Math.max(0, p.left))} left.`}>
              <button type="button" className="btn btn--sm btn--dark" onClick={() => onCredit(p)}>
                Add credits
              </button>
            </Notice>
          );
        }
        return null;
      })}
      {desk.requests.length > 0 && (
        <Notice tone="revise" icon="alert" title={`${count(desk.requests.length)} waiting for a decision on a model`}>
          <button type="button" className="btn btn--sm" onClick={onModels}>
            Review
          </button>
        </Notice>
      )}
    </>
  );
}

/* ---------- Overview ---------- */

const within = (usage: UsageRow[], days: number, now: string) => {
  const from = manilaDay(Date.parse(now) - (days - 1) * DAY_MS);
  return usage.filter((u) => u.day >= from);
};

function Overview({ desk, busy, onConnect, onCredit, onRebuild }: { desk: AssistantDesk; busy: boolean; onConnect: (p: ProviderRow) => void; onCredit: (p: ProviderRow) => void; onRebuild: () => void }) {
  const recent = useMemo(() => within(desk.usage, 30, desk.now), [desk]);
  const days = useMemo(() => {
    const byDay = new Map<string, { messages: number; general: number; cost: number }>();
    for (const u of recent) {
      const d = byDay.get(u.day) ?? { messages: 0, general: 0, cost: 0 };
      d.messages += u.messages;
      if (u.outcome === "general") d.general += u.messages;
      d.cost += u.cost;
      byDay.set(u.day, d);
    }
    return Array.from({ length: 30 }, (_, i) => {
      const day = manilaDay(Date.parse(desk.now) - (29 - i) * DAY_MS);
      return { day, ...(byDay.get(day) ?? { messages: 0, general: 0, cost: 0 }) };
    });
  }, [recent, desk.now]);

  const month = desk.providers.reduce((n, p) => n + p.spentMonth, 0);
  const known = desk.providers.filter((p) => p.left !== null);
  const left = known.reduce((n, p) => n + (p.left ?? 0), 0);
  const messages = days.reduce((n, d) => n + d.messages, 0);
  const general = days.reduce((n, d) => n + d.general, 0);
  const spent = days.some((d) => d.cost > 0);

  return (
    <div className="adm-stack">
      <div className="adm-stats">
        <Stat label="Spend this month" value={usd(month)} icon="wallet" />
        <Stat label="Credits left" value={known.length ? usd(Math.max(0, left)) : "—"} sub={known.length ? "Estimated" : "None recorded"} icon="data" />
        <Stat label="Messages, 30 days" value={count(messages)} icon="comment" />
        <Stat label="General, 30 days" value={count(general)} sub={messages ? `${Math.round((general / messages) * 100)}% not from the Hub` : undefined} icon="spark" />
      </div>

      <Block title="Providers">
        <div className="ai-providers">
          {desk.providers.map((p) => (
            <ProviderCard key={p.id} p={p} onConnect={onConnect} onCredit={onCredit} />
          ))}
        </div>
      </Block>

      <div className="adm-cols">
        <Block title="Messages" sub="Last 30 days">
          {messages ? <Bars label="Messages per day" data={days.map((d) => ({ key: d.day, value: d.messages, title: shortDay(d.day) }))} /> : <EmptyNote icon="comment" title="No messages yet" />}
        </Block>
        <Block title="Spend" sub="Last 30 days, in US cents a day">
          {spent ? <Bars label="Spend per day in cents" data={days.map((d) => ({ key: d.day, value: Math.round(d.cost * 100), title: shortDay(d.day) }))} /> : <EmptyNote icon="wallet" title="Nothing spent yet" />}
        </Block>
      </div>

      <Block
        title={
          <>
            Search index <Hint text="The Hub passages the assistant may answer from. Rebuilt every day." />
          </>
        }
        actions={
          <button type="button" className="btn btn--sm" disabled={busy} onClick={onRebuild}>
            <Icon name="refresh" size={14} />
            Rebuild
          </button>
        }
      >
        <div className="adm-stats">
          <Stat label="Passages" value={count(desk.index.chunks)} />
          <Stat label="Last built" value={<span className="ai-admin__when">{fmtAgo(desk.index.builtAt ?? undefined, desk.now)}</span>} />
        </div>
      </Block>

      {desk.credits.length > 0 && (
        <Disclosure title="Credits recorded" meta={count(desk.credits.length)}>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Provider</th>
                  <th className="num">Amount</th>
                  <th>Recorded by</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {desk.credits.map((c) => (
                  <tr key={c.id}>
                    <td>{fmtDate(c.at)}</td>
                    <td>{desk.providers.find((p) => p.id === c.provider)?.label}</td>
                    <td className="num">{usd(c.amount)}</td>
                    <td>{c.by}</td>
                    <td>{c.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Disclosure>
      )}
    </div>
  );
}

function ProviderCard({ p, onConnect, onCredit }: { p: ProviderRow; onConnect: (p: ProviderRow) => void; onCredit: (p: ProviderRow) => void }) {
  const status = STATUS[p.status];
  const connected = p.status !== "disconnected";
  const share = p.budget ? Math.min(100, (p.spentMonth / p.budget) * 100) : 0;
  return (
    <article className="ai-provider">
      <header className="ai-provider__head">
        <h4 className="ai-provider__name">{p.label}</h4>
        <Pill tone={status.tone}>{status.label}</Pill>
      </header>

      {connected ? (
        <dl className="ai-provider__facts">
          <div>
            <dt>Plan</dt>
            <dd>
              {p.plan === "free" ? "Free" : "Paid"}
              {sharesData(p.id, p.plan) && <Hint text="Google may read what a free key sends it, so only public content reaches this provider." />}
            </dd>
          </div>
          <div>
            <dt>Key</dt>
            <dd className="num">•••• {p.keyHint}</dd>
          </div>
          {p.plan === "paid" && (
            <div>
              <dt>
                Left <Hint text="What you recorded buying, minus the Hub’s tracked cost. The provider’s bill is final." />
              </dt>
              <dd className="num">{p.left === null ? "Not recorded" : `~${usd(Math.max(0, p.left))}`}</dd>
            </div>
          )}
          <div>
            <dt>This month</dt>
            <dd className="num">
              {usd(p.spentMonth)}
              {p.budget !== null && ` of ${usd(p.budget)}`}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="ai-provider__idle">{p.hasFreePlan ? "Free plan available." : "Paid, pay as you go."}</p>
      )}

      {p.budget !== null && connected && (
        <span className="ai-provider__meter" role="img" aria-label={`${Math.round(share)}% of this month’s budget used`}>
          <i style={{ width: `${share}%` }} data-full={share >= 100 ? "" : undefined} />
        </span>
      )}

      <footer className="adm-actions ai-provider__foot">
        <button type="button" className={`btn btn--sm${connected ? "" : " btn--dark"}`} onClick={() => onConnect(p)}>
          {connected ? "Manage" : "Connect"}
        </button>
        {connected && p.plan === "paid" && (
          <button type="button" className="btn btn--sm" onClick={() => onCredit(p)}>
            Add credits
          </button>
        )}
      </footer>
    </article>
  );
}

/* ---------- Models ---------- */

function Models({ desk, busy, act, onPrice }: { desk: AssistantDesk; busy: boolean; act: (w: Promise<Result>) => Promise<boolean>; onPrice: (m: ModelRow) => void }) {
  const provider = (id: string) => desk.providers.find((p) => p.id === id);
  return (
    <div className="adm-stack">
      {desk.requests.length > 0 && (
        <Block title="Requests">
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Unit</th>
                  <th>Model</th>
                  <th>Asked</th>
                  <th>
                    <span className="sr-only">Decide</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {desk.requests.map((r) => (
                  <tr key={`${r.modelId}|${r.accountId}`}>
                    <td>{r.name}</td>
                    <td>{r.unit || "—"}</td>
                    <td>{r.modelLabel}</td>
                    <td>{fmtAgo(r.requestedAt, desk.now)}</td>
                    <td>
                      <div className="adm-actions">
                        <button type="button" className="btn btn--sm" disabled={busy} onClick={() => void act(decideModelRequest({ modelId: r.modelId, accountId: r.accountId, approve: false }))}>
                          Deny
                        </button>
                        <button type="button" className="btn btn--sm btn--dark" disabled={busy} onClick={() => void act(decideModelRequest({ modelId: r.modelId, accountId: r.accountId, approve: true }))}>
                          Approve
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Block>
      )}

      <Block
        title="Models"
        actions={
          <label className="ai-admin__inline">
            <span>
              Backup <Hint text="Answers when the chosen model is out of credit or busy." />
            </span>
            <Select className="select select--sm" value={desk.fallbackModel ?? ""} disabled={busy} aria-label="Backup model" onChange={(v) => void act(updateSettings({ fallbackModel: v || null }))}>
              <option value="">None</option>
              {desk.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </Select>
          </label>
        }
      >
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Provider</th>
                <th className="num">
                  Per 1M tokens <Hint text="In US dollars, input and output. Free plans cost nothing." />
                </th>
                <th>Who</th>
                <th>Daily limit, each</th>
                <th>On</th>
                <th>
                  <span className="sr-only">More</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {desk.models.map((m) => {
                const p = provider(m.provider);
                return (
                  <tr key={m.id} className={p?.status === "ok" ? undefined : "ai-model--idle"}>
                    <td>
                      {m.label} {m.isDefault && <Pill tone="gold">Default</Pill>}
                    </td>
                    <td>{p?.status === "ok" ? p.label : <Pill tone={STATUS[p?.status ?? "disconnected"].tone}>{STATUS[p?.status ?? "disconnected"].label}</Pill>}</td>
                    <td className="num">
                      {price(m.inputUsd)} / {price(m.outputUsd)}
                    </td>
                    <td>
                      <Select className="select select--sm" value={m.access} disabled={busy} aria-label={`Who can use ${m.label}`} onChange={(v) => void act(updateModel({ id: m.id, access: v }))}>
                        <option value="everyone">Everyone</option>
                        <option value="on_request">On request</option>
                      </Select>
                    </td>
                    <td>
                      <DailyLimit model={m} busy={busy} act={act} />
                    </td>
                    <td>
                      <Switch checked={m.enabled} disabled={busy} label={`${m.label} in the chat`} onChange={(enabled) => void act(updateModel({ id: m.id, enabled }))} />
                    </td>
                    <td>
                      <RowMenu
                        label={`More for ${m.label}`}
                        items={[
                          !m.isDefault && { label: "Make default", icon: "check", onSelect: () => void act(updateModel({ id: m.id, isDefault: true })) },
                          { label: "Correct the price", icon: "pen", onSelect: () => onPrice(m) },
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Block>
    </div>
  );
}

/** Saved when it loses focus, so stepping through numbers doesn't save each one. */
function DailyLimit({ model, busy, act }: { model: ModelRow; busy: boolean; act: (w: Promise<Result>) => Promise<boolean> }) {
  const [value, setValue] = useState(model.dailyLimit ?? NaN);
  const save = () => {
    const next = Number.isFinite(value) ? value : null;
    if (next !== model.dailyLimit) void act(updateModel({ id: model.id, dailyLimit: next }));
  };
  return (
    <span className="ai-admin__limit" onBlur={save}>
      <NumberField className="input input--sm" value={value} min={1} max={10000} allowEmpty disabled={busy} aria-label={`Messages a day per person on ${model.label}`} onChange={setValue} />
    </span>
  );
}

/* ---------- Usage ---------- */

interface Tally {
  name: string;
  messages: number;
  answered: number;
  general: number;
  tokens: number;
  cost: number;
}

function tally(rows: UsageRow[], by: (u: UsageRow) => string): Tally[] {
  const out = new Map<string, Tally>();
  for (const u of rows) {
    const name = by(u);
    const t = out.get(name) ?? { name, messages: 0, answered: 0, general: 0, tokens: 0, cost: 0 };
    t.messages += u.messages;
    if (u.outcome === "answered") t.answered += u.messages;
    if (u.outcome === "general") t.general += u.messages;
    t.tokens += u.inputTokens + u.outputTokens;
    t.cost += u.cost;
    out.set(name, t);
  }
  return [...out.values()].sort((a, b) => b.cost - a.cost || b.messages - a.messages);
}

function UsageTable({ title, rows, head }: { title: string; rows: Tally[]; head: string }) {
  return (
    <Block title={title}>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>{head}</th>
              <th className="num">Messages</th>
              <th className="num">From the Hub</th>
              <th className="num">General</th>
              <th className="num">Tokens</th>
              <th className="num">Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td className="num">{count(r.messages)}</td>
                <td className="num">{count(r.answered)}</td>
                <td className="num">{count(r.general)}</td>
                <td className="num">{compact(r.tokens)}</td>
                <td className="num">{usd(r.cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Block>
  );
}

const cell = (v: string | number) => `"${String(v).replaceAll('"', '""')}"`;

function Usage({ desk }: { desk: AssistantDesk }) {
  const [days, setDays] = useState("30");
  const rows = useMemo(() => within(desk.usage, Number(days), desk.now), [desk, days]);
  const exportCsv = () => {
    const head = ["Day", "Model", "Unit", "Role", "Outcome", "Messages", "Input tokens", "Output tokens", "Cost (USD)"];
    const body = rows.map((u) => [u.day, u.model, u.unit, u.role, u.outcome, u.messages, u.inputTokens, u.outputTokens, u.cost.toFixed(6)].map(cell).join(","));
    download(`ai-usage-last-${days}-days.csv`, [head.join(","), ...body].join("\n"));
  };
  return (
    <div className="adm-stack">
      <div className="ai-admin__tools">
        <Select className="select select--sm" value={days} aria-label="Period" onChange={setDays}>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </Select>
        <button type="button" className="btn btn--sm" disabled={!rows.length} onClick={exportCsv}>
          <Icon name="download" size={14} />
          Export
        </button>
      </div>
      {rows.length ? (
        <>
          <UsageTable title="By model" head="Model" rows={tally(rows, (u) => u.model)} />
          <div className="adm-cols">
            <UsageTable title="By unit" head="Unit" rows={tally(rows, (u) => u.unit)} />
            <UsageTable title="By role" head="Role" rows={tally(rows, (u) => u.role)} />
          </div>
        </>
      ) : (
        <EmptyNote icon="activity" title="No usage in this period" />
      )}
    </div>
  );
}

/* ---------- Sheets ---------- */

function ConnectSheet({ provider: p, desk, busy, act, onClose, confirm }: { provider: ProviderRow; desk: AssistantDesk; busy: boolean; act: (w: Promise<Result>) => Promise<boolean>; onClose: () => void; confirm: ReturnType<typeof useConsole>["confirm"] }) {
  const connected = p.status !== "disconnected";
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [nudged, setNudged] = useState(false);
  const keyInput = useRef<HTMLInputElement>(null);
  const keyBox = useRef<HTMLDivElement>(null);
  const locked = connected && !unlocked;

  // A click anywhere else dismisses the "unlock first" message.
  useEffect(() => {
    if (!nudged) return;
    const away = (e: PointerEvent) => {
      if (!keyBox.current?.contains(e.target as Node)) setNudged(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [nudged]);

  /*
   * A click on the locked field. Not the shared field warning: its triangle takes the rightmost slot and hides the
   * lock, and this message has to point at the lock. The field also has no failed constraint to report.
   */
  const nudgeLock = (target: Element) => {
    const box = keyBox.current;
    if (!locked || !box || target.closest("button")) return;
    setNudged(true);
    box.removeAttribute("data-shake");
    void box.offsetWidth; // restart the animation on a repeat click
    box.setAttribute("data-shake", "");
    setTimeout(() => box.removeAttribute("data-shake"), 420);
  };
  const [plan, setPlan] = useState(p.plan);
  const [account, setAccount] = useState(p.accountRef ?? "");
  const [budget, setBudget] = useState(p.budget ?? NaN);
  const [low, setLow] = useState(p.low);
  const needsAccount = p.id === "cloudflare" && !desk.accountKnown;

  const toggleLock = () => {
    setNudged(false);
    if (locked) {
      setUnlocked(true);
      requestAnimationFrame(() => keyInput.current?.focus());
    } else {
      setUnlocked(false);
      setKey("");
    }
  };
  const connect = async (e: FormEvent) => {
    e.preventDefault();
    if (locked) return;
    const ok = await act(connectProvider({ provider: p.id, key, plan, accountRef: account }));
    if (ok) onClose();
  };
  const saveLimits = async (e: FormEvent) => {
    e.preventDefault();
    await act(setProviderLimits({ provider: p.id, budget: Number.isFinite(budget) ? budget : null, low: Number.isFinite(low) ? low : 0 }));
  };
  const disconnect = async () => {
    const ok = await confirm({ title: `Disconnect ${p.label}?`, body: "Its key is deleted from the Hub, and its models leave the chat straight away.", confirm: "Disconnect", tone: "danger" });
    if (ok === null) return;
    if (await act(disconnectProvider(p.id))) onClose();
  };

  return (
    <Sheet open modal title={p.label} sub={connected ? `Connected ${fmtDate(p.connectedAt ?? undefined)}${p.connectedBy ? ` by ${p.connectedBy}` : ""}` : "Connect with an API key"} onClose={onClose}>
      <div className="adm-stack ai-admin__settings">
        <form id={`ai-connect-${p.id}`} className="adm-stack ai-admin__settings-form" onSubmit={(e) => void connect(e)}>
          <div className="ai-admin__get-key">
            <a className="btn btn--sm ai-admin__out" href={p.keyUrl} target="_blank" rel="noopener noreferrer">
              Get a key
              <Icon name="external" size={14} />
            </a>
            <ul className="adm-field__hint ai-admin__key-help">
              {PROVIDERS[p.id].keyHelp.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>

          <Field label="API Key">
            <div ref={keyBox} className="input-group ai-admin__key" data-nudged={nudged || undefined} onClick={(e) => nudgeLock(e.target as Element)}>
              <input ref={keyInput}type={showKey ? "text" : "password"} autoComplete="off" spellCheck={false} required disabled={locked} placeholder={locked ? "•".repeat(p.keyLength || 12) : connected ? "Paste the new key" : undefined} value={key} data-missing="Paste the key from the provider." onChange={(e) => setKey(e.target.value)} />
              {connected ? (
                <button type="button" className="ai-admin__reveal" aria-label={locked ? "Unlock to replace the key" : "Lock and keep the saved key"} onMouseDown={(e) => e.preventDefault()} onClick={toggleLock}>
                  <Icon name={locked ? "lock" : "lock-open"} size={16} />
                </button>
              ) : (
                <button type="button" className="ai-admin__reveal" aria-label={showKey ? "Hide the key" : "Show the key"} onMouseDown={(e) => e.preventDefault()} onClick={() => setShowKey((v) => !v)}>
                  <Icon name={showKey ? "eye-closed" : "eye"} size={16} />
                </button>
              )}
              {nudged && (
                <span className="ai-admin__unlock-tip" role="alert">
                  Unlock first to replace this key.
                </span>
              )}
            </div>
          </Field>

          {needsAccount && (
            <Field label="Account ID">
              <input className="input" required value={account} data-missing="Paste your Cloudflare account ID." onChange={(e) => setAccount(e.target.value)} />
            </Field>
          )}

          {p.hasFreePlan && (
            <fieldset className="ai-admin__plan">
              <legend className="adm-field__label">Plan on this key</legend>
              <label className="choice choice--inline">
                <input type="radio" name="ai-plan" checked={plan === "free"} disabled={locked} onChange={() => setPlan("free")} />
                Free
              </label>
              <label className="choice choice--inline">
                <input type="radio" name="ai-plan" checked={plan === "paid"} disabled={locked} onChange={() => setPlan("paid")} />
                Paid
              </label>
            </fieldset>
          )}

          {!connected && <div className="adm-actions">
            <button type="submit" className="btn btn--sm btn--dark" disabled={busy}>
              {busy ? "Testing…" : "Test and connect"}
            </button>
          </div>}
        </form>

        {connected && (
          <>
            <form id={`ai-limits-${p.id}`} className="adm-stack ai-admin__settings-form" onSubmit={(e) => void saveLimits(e)}>
              <div className="adm-form-grid">
                <Field label="Monthly budget, USD">
                  <NumberField value={budget} min={0} step={5} allowEmpty onChange={setBudget} aria-label="Monthly budget in US dollars" />
                </Field>
                <Field label="Warn below, USD">
                  <NumberField value={low} min={0} step={1} onChange={setLow} aria-label="Warn when credit falls below, in US dollars" />
                </Field>
              </div>
            </form>
            <div className="adm-actions adm-actions--split">
              <button type="button" className="btn btn--sm btn--danger" disabled={busy} onClick={() => void disconnect()}>
                Disconnect
              </button>
              <div className="adm-actions__end">
                <button type="submit" form={`ai-limits-${p.id}`} className="btn btn--sm" disabled={busy}>
                  Save limits
                </button>
                <button type="submit" form={`ai-connect-${p.id}`} className="btn btn--sm btn--dark" disabled={busy || locked}>
                  {busy ? "Testing…" : "Test and replace"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

function CreditSheet({ provider: p, busy, act, onClose }: { provider: ProviderRow; busy: boolean; act: (w: Promise<Result>) => Promise<boolean>; onClose: () => void }) {
  const [amount, setAmount] = useState(5);
  const [note, setNote] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await act(recordCredits({ provider: p.id, amount, note }))) onClose();
  };
  return (
    <Sheet open modal title={`Add credits: ${p.label}`} sub={p.left === null ? "Nothing recorded yet" : `About ${usd(Math.max(0, p.left))} left`} onClose={onClose}>
      <form className="adm-stack" onSubmit={(e) => void submit(e)}>
        <ol className="ai-admin__steps">
          <li>
            <a className="btn btn--sm ai-admin__out" href={p.billingUrl} target="_blank" rel="noopener noreferrer">
              Buy on {p.label}
              <Icon name="external" size={14} />
            </a>
          </li>
          <li>
            <Field label="Then record what you bought, USD">
              <NumberField value={amount} min={0.01} step={5} onChange={setAmount} aria-label="Amount bought, in US dollars" />
            </Field>
          </li>
        </ol>
        <Field label="Note">
          <input className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="adm-actions">
          <button type="submit" className="btn btn--sm btn--dark" disabled={busy}>
            Record
          </button>
        </div>
      </form>
    </Sheet>
  );
}

function PriceSheet({ model, busy, act, onClose }: { model: ModelRow; busy: boolean; act: (w: Promise<Result>) => Promise<boolean>; onClose: () => void }) {
  const [input, setInput] = useState(model.inputUsd);
  const [output, setOutput] = useState(model.outputUsd);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await act(updateModel({ id: model.id, inputUsd: input, outputUsd: output }))) onClose();
  };
  return (
    <Sheet open modal title={model.label} sub="US dollars per million tokens" onClose={onClose}>
      <form className="adm-stack" onSubmit={(e) => void submit(e)}>
        <div className="adm-form-grid">
          <Field label="Input">
            <NumberField value={input} min={0} step={0.05} onChange={setInput} aria-label="Input price" />
          </Field>
          <Field label="Output">
            <NumberField value={output} min={0} step={0.05} onChange={setOutput} aria-label="Output price" />
          </Field>
        </div>
        <div className="adm-actions">
          <button type="submit" className="btn btn--sm btn--dark" disabled={busy}>
            Save
          </button>
        </div>
      </form>
    </Sheet>
  );
}
