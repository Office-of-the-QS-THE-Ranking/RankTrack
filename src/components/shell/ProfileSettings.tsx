"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearCookiesAndSignOut, exportMyData, loadDevices, loadLogs, loadOverview, loadPrivacy, saveNotificationPrefs, saveProfile, saveSessionPrefs, signOutDevice, signOutOtherDevices, type DeviceRow, type LogRow, type PrivacyInfo } from "@/app/actions/profile";
import { useReference } from "@/components/reference/ReferenceProvider";
import type { Badge, OverviewStats } from "@/lib/governance/account-overview";
import { idleChoices } from "@/lib/governance/session-limits";
import { NOTIFY_KINDS, prefKey, type NotifyChannel, type NotifyKind } from "@/lib/governance/notification-prefs";
import { signOut } from "@/app/actions/session";
import type { Viewer } from "@/lib/governance/viewer";
import { Face } from "@/components/ui/Face";
import { Icon } from "@/components/ui/Icon";
import { InfoTooltip } from "@/components/ui/interactive";
import { Select } from "@/components/ui/pickers";
import { toast } from "@/components/ui/toast";

type Section = "overview" | "profile" | "access" | "security" | "devices" | "logs" | "notifications" | "privacy" | "language" | "support" | "settings";
type IconName = Parameters<typeof Icon>[0]["name"];

const SECTIONS: { key: Section; label: string; icon: IconName }[] = [
  { key: "overview", label: "Overview", icon: "grid" },
  { key: "profile", label: "Edit profile", icon: "user" },
  { key: "access", label: "Roles & access", icon: "key" },
  { key: "security", label: "Sign-in & security", icon: "shield-check" },
  { key: "devices", label: "Devices", icon: "server" },
  { key: "logs", label: "Logs", icon: "activity" },
  { key: "notifications", label: "Notifications", icon: "bell" },
  { key: "privacy", label: "Data & privacy", icon: "shield" },
  { key: "language", label: "Language", icon: "globe" },
  { key: "support", label: "Support", icon: "help" },
  { key: "settings", label: "Settings", icon: "settings" },
];

const DATE_FMT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** The account window the sidebar profile opens: a section list on the left, the chosen section on the right. */
export function ProfileSettings({
  viewer,
  open,
  onClose,
  theme,
  onToggleTheme,
  links,
  workspace,
}: {
  viewer: Viewer;
  open: boolean;
  onClose: () => void;
  theme: "light" | "dark";
  onToggleTheme: (from?: HTMLElement | null) => void;
  /** Other places this person can go: the other workspace, the public view. */
  links: { href: string; label: string; icon: IconName }[];
  /** The workspace the window opened in, for its help links. */
  workspace: "office" | "portal";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [section, setSection] = useState<Section>("overview");

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setSection("overview");
      d.showModal();
      document.documentElement.style.overflow = "hidden";
    } else if (!open && d.open) {
      d.close();
    }
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onDialogClose = () => {
      document.documentElement.style.overflow = "";
      onClose();
    };
    d.addEventListener("close", onDialogClose);
    return () => d.removeEventListener("close", onDialogClose);
  }, [onClose]);

  const close = () => ref.current?.close();

  return (
    <dialog
      ref={ref}
      className="pfm"
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <button type="button" className="pfm__close" onClick={close} aria-label="Close account settings">
        <Icon name="close" size={16} />
      </button>
      <div className="pfm__shell">
        <h2 id={titleId} className="sr-only">Account settings</h2>

        <nav className="pfm__nav" aria-label="Account settings">
          <ul>
            {SECTIONS.map((s) => (
              <li key={s.key}>
                <button type="button" className="pfm__tab" aria-current={section === s.key ? "page" : undefined} onClick={() => setSection(s.key)}>
                  <Icon name={s.icon} size={16} />
                  <span>{s.label}</span>
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                role="switch"
                aria-checked={theme === "dark"}
                className="pfm__tab pfm__tab--switch"
                onClick={(e) => onToggleTheme(e.currentTarget)}
              >
                <Icon name="moon" size={16} />
                <span>Dark mode</span>
                <span className="pfm__switch" aria-hidden="true" />
              </button>
            </li>
          </ul>
          <div className="pfm__nav-sep" />
          <ul>
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="pfm__tab">
                  <Icon name={l.icon} size={16} />
                  <span>{l.label}</span>
                  <Icon name="arrow-up-right" size={13} />
                </Link>
              </li>
            ))}
          </ul>
          <div className="pfm__nav-sep" />
          <form action={signOut}>
            <button type="submit" className="pfm__tab pfm__tab--out">
              <Icon name="logout" size={16} />
              <span>Sign out</span>
            </button>
          </form>
        </nav>

        <div className="pfm__body">
          {section === "overview" && <Overview viewer={viewer} />}
          {section === "profile" && <EditProfile key={viewer.name + viewer.title} viewer={viewer} onDiscard={close} />}
          {section === "access" && <Access viewer={viewer} />}
          {section === "security" && <Security viewer={viewer} />}
          {section === "devices" && <Devices />}
          {section === "logs" && <Logs />}
          {section === "notifications" && <Notifications viewer={viewer} />}
          {section === "privacy" && <Privacy />}
          {section === "language" && <Language />}
          {section === "support" && <Support workspace={workspace} onOpen={close} />}
          {section === "settings" && <Settings viewer={viewer} />}
        </div>
      </div>
    </dialog>
  );
}

function Banner({ viewer, children }: { viewer: Viewer; children?: ReactNode }) {
  return (
    <div className="pfm__hero">
      <div className="pfm__cover" aria-hidden="true">
        <span className="pfm__blob pfm__blob--a" />
        <span className="pfm__blob pfm__blob--b" />
        <span className="pfm__blob pfm__blob--c" />
        <Image className="pfm__seal" src="/brand/ust-seal-reverse.png" alt="" width={120} height={119} />
      </div>
      <span className="pfm__avatar" aria-hidden="true">
        <Face src={viewer.avatar}>{viewer.initials}</Face>
      </span>
      <div className="pfm__hero-side">{children}</div>
    </div>
  );
}

function EditProfile({ viewer, onDiscard }: { viewer: Viewer; onDiscard: () => void }) {
  const router = useRouter();
  const saving = useRef(false);
  const [pending, setPending] = useState(false);

  return (
    <form
      className="pfm__form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (saving.current) return;
        const data = new FormData(event.currentTarget);
        saving.current = true;
        setPending(true);
        try {
          const result = await saveProfile({ name: String(data.get("name") ?? ""), title: String(data.get("title") ?? "") });
          toast(result.message, result.ok ? "ok" : "error");
          if (result.ok) router.refresh();
        } catch {
          toast("Your profile could not be saved. Try again in a moment.", "error");
        } finally {
          saving.current = false;
          setPending(false);
        }
      }}
      onReset={onDiscard}
    >
      <Banner viewer={viewer}>
        {viewer.external ? (
          <span className="pfm__pill pfm__pill--static">Sponsored guest</span>
        ) : (
          <a className="pfm__pill" href="https://myaccount.google.com/personal-info" target="_blank" rel="noreferrer">
            Change photo in Google <Icon name="arrow-up-right" size={12} />
          </a>
        )}
      </Banner>

      <fieldset disabled={pending}>
        <label className="pfm__field">
          <span className="pfm__label">Full name</span>
          <span className="pfm__control">
            <Icon name="user" size={16} />
            <input
              className="input"
              name="name"
              autoComplete="name"
              placeholder="Your full name"
              defaultValue={viewer.name}
              required
              minLength={3}
              maxLength={160}
              title=""
              onInput={(event) => event.currentTarget.setCustomValidity(event.currentTarget.value.trim().length < 3 ? "Enter a full name with at least 3 characters." : "")}
            />
          </span>
        </label>
        <label className="pfm__field">
          <span className="pfm__label">Position / title</span>
          <span className="pfm__control">
            <Icon name="tag" size={16} />
            <input className="input" name="title" autoComplete="organization-title" placeholder="Your position" defaultValue={viewer.title} maxLength={160} title="" />
          </span>
        </label>
        <div className="pfm__field">
          <span className="pfm__label">Organizational unit</span>
          <span className="pfm__control pfm__control--read">
            <Icon name="building" size={16} />
            <span>{viewer.unitName}</span>
            <InfoTooltip label="About your organizational unit">
              Your email, unit and roles are managed by the Office.
            </InfoTooltip>
          </span>
        </div>
        <div className="pfm__field">
          <span className="pfm__label">Email</span>
          <span className="pfm__control pfm__control--read">
            <Icon name="mail" size={16} />
            <span>{viewer.email}</span>
            <InfoTooltip label="About your email">
              Your email, unit and roles are managed by the Office.
            </InfoTooltip>
          </span>
        </div>
        <div className="pfm__actions">
          <button type="reset" className="btn">Discard</button>
          <button type="submit" className="btn btn--primary">{pending ? "Saving…" : "Save changes"}</button>
        </div>
      </fieldset>
    </form>
  );
}

function Access({ viewer }: { viewer: Viewer }) {
  return (
    <div className="pfm__panel">
      <Banner viewer={viewer}>
        <b className="pfm__who">{viewer.name}</b>
        <p className="pfm__note">{viewer.roleName} · {viewer.unitName}</p>
      </Banner>
      <h3 className="pfm__label">Your roles</h3>
      <ul className="pfm__rows">
        {viewer.roles.map((r) => (
          <li key={r.id + r.scope}>
            <Icon name="key" size={16} />
            <span>
              <b>{r.name}</b>
              <span>{r.scope}</span>
            </span>
            {r.expires && <em>Until {DATE_FMT.format(new Date(r.expires + "T00:00:00Z"))}</em>}
            <InfoTooltip label={`About your ${r.name} role`}>
              Ask the Office to change your roles or unit.
            </InfoTooltip>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Security({ viewer }: { viewer: Viewer }) {
  const s = viewer.session;
  const rows: { icon: IconName; label: string; value: string }[] = [
    { icon: "mail", label: "Sign-in account", value: viewer.email },
    { icon: "lock-keyhole", label: "Sign-in method", value: viewer.external ? "Sponsored guest" : "Google Workspace" },
    { icon: "shield-check", label: "2-step verification", value: s.mfa ? "Verified this session" : "Not used this session" },
    { icon: "clock", label: "Session started", value: DATE_FMT.format(new Date(s.startedAt)) },
    { icon: "history", label: "Automatic sign-out", value: s.idleMinutes ? `After ${s.idleMinutes} min idle or ${s.absoluteHours} h` : `After ${s.absoluteHours} h (you stay signed in while idle)` },
  ];
  return (
    <div className="pfm__panel">
      <Banner viewer={viewer}>
        <b className="pfm__who">{viewer.name}</b>
        <p className="pfm__note">{viewer.email}</p>
      </Banner>
      <h3 className="pfm__label">This session</h3>
      <ul className="pfm__rows">
        {rows.map((r) => (
          <li key={r.label}>
            <Icon name={r.icon} size={16} />
            <span>
              <b>{r.label}</b>
              <span>{r.value}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const NUM = new Intl.NumberFormat("en-PH");

const duration = (minutes: number) => (minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60 ? `${minutes % 60} min` : ""}`.trim());

type Loaded = { stats: OverviewStats; badges: Badge[]; memberSince: string; lastLogin?: string };

/** The person's activity at a glance and the badges it has earned, counted from the audit trail. */
function Overview({ viewer }: { viewer: Viewer }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    loadOverview()
      .then((r) => {
        if (!live) return;
        if (r.ok) setData(r);
        else {
          setFailed(true);
          toast(r.message, "error");
        }
      })
      .catch(() => {
        if (!live) return;
        setFailed(true);
        toast("Your overview could not be loaded. Try again in a moment.", "error");
      });
    return () => {
      live = false;
    };
  }, []);

  const s = data?.stats;
  const tiles: { icon: IconName; label: string; value: string; hint: string }[] = s
    ? [
        { icon: "check-circle", label: "Files reviewed", value: NUM.format(s.reviews), hint: "Evidence you accepted or sent back for revision." },
        { icon: "upload", label: "Submissions", value: NUM.format(s.submissions), hint: "Evidence and data you submitted." },
        { icon: "send", label: "Published", value: NUM.format(s.published), hint: "Posts, stories and reports you published." },
        { icon: "logout", label: "Sign-ins", value: NUM.format(s.signIns), hint: "Times you signed in to the Hub." },
        { icon: "calendar", label: "Days active", value: NUM.format(s.daysActive), hint: "Days with at least one action in the Hub." },
        { icon: "clock", label: "Average visit", value: s.avgMinutes === null ? "—" : duration(s.avgMinutes), hint: s.avgMinutes === null ? "Shown after your first session ends." : `Across your sessions, ${duration(s.totalMinutes)} in all.` },
      ]
    : [];

  return (
    <div className="pfm__panel">
      <Banner viewer={viewer}>
        <b className="pfm__who">{viewer.name}</b>
        <p className="pfm__note">
          {viewer.roleName} · {viewer.unitName}
          {data && <> · Member since {DATE_FMT.format(new Date(data.memberSince))}</>}
        </p>
      </Banner>

      <h3 className="pfm__label">Activity</h3>
      <ul className="pfm__stats" aria-busy={!data && !failed}>
        {data
          ? tiles.map((t) => (
              <li key={t.label}>
                <span className="pfm__stat-head">
                  <Icon name={t.icon} size={14} />
                  {t.label}
                  <InfoTooltip label={`About ${t.label.toLowerCase()}`}>{t.hint}</InfoTooltip>
                </span>
                <b className="num">{t.value}</b>
              </li>
            ))
          : Array.from({ length: 6 }, (_, i) => <li key={i} className="pfm__stat--skeleton" aria-hidden="true" />)}
      </ul>

      <h3 className="pfm__label">Badges</h3>
      <ul className="pfm__badges">
        {data
          ? data.badges.map((b) => (
              <li key={b.id} className={`pfm__badge${b.tier ? ` pfm__badge--${b.tier.toLowerCase()}` : " pfm__badge--locked"}`}>
                <span className="pfm__medal" aria-hidden="true">
                  <Icon name={b.tier ? "spark" : "lock"} size={16} />
                </span>
                <span className="pfm__badge-text">
                  <b>{b.name}</b>
                  <span>{b.tier ?? "Locked"}{b.next !== null ? ` · ${NUM.format(b.value)}/${NUM.format(b.next)}` : " · Top tier"}</span>
                  {b.next !== null && (
                    <span className="pfm__bar" role="progressbar" aria-label={`${b.name} progress`} aria-valuemin={0} aria-valuemax={b.next} aria-valuenow={Math.min(b.value, b.next)}>
                      <span style={{ width: `${Math.min(100, (b.value / b.next) * 100)}%` }} />
                    </span>
                  )}
                </span>
                <InfoTooltip label={`How to earn ${b.name}`}>{b.next !== null ? `${b.how} to reach the next tier.` : "You reached the top tier."}</InfoTooltip>
              </li>
            ))
          : Array.from({ length: 6 }, (_, i) => <li key={i} className="pfm__badge pfm__stat--skeleton" aria-hidden="true" />)}
      </ul>
    </div>
  );
}

const clearBrowserStorage = async () => {
  try {
    localStorage.clear();
  } catch {}
  try {
    sessionStorage.clear();
  } catch {}
  try {
    if ("caches" in window) await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
  } catch {}
};

/** Session choices within the Office's policy, and clearing what this browser keeps. */
function Settings({ viewer }: { viewer: Viewer }) {
  const router = useRouter();
  const s = viewer.session;
  const [idle, setIdle] = useState(String(s.prefIdleMinutes ?? s.policyIdleMinutes));
  const [stay, setStay] = useState(s.stay);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const save = async (next: { idle: string; stay: boolean }) => {
    setBusy("session");
    try {
      const r = await saveSessionPrefs({ idleMinutes: Number(next.idle), stay: next.stay });
      toast(r.message, r.ok ? "ok" : "error");
      if (r.ok) router.refresh();
      else {
        setIdle(String(s.prefIdleMinutes ?? s.policyIdleMinutes));
        setStay(s.stay);
      }
    } catch {
      setIdle(String(s.prefIdleMinutes ?? s.policyIdleMinutes));
      setStay(s.stay);
      toast("Your session settings could not be saved. Try again in a moment.", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="pfm__panel">
      <section className="pfm__group" aria-labelledby="pfm-session">
        <h3 id="pfm-session" className="pfm__group-title">Session</h3>
        <ul className="pfm__list">
          <li className="pfm__item">
            <span className="pfm__item-icon" aria-hidden="true">
              <Icon name="clock" size={15} />
            </span>
            <span className="pfm__item-text">
              <b>Sign out when idle</b>
              <span>{stay ? `Stays on when idle or after closing the browser, up to ${s.absoluteHours} h` : `Up to ${duration(s.policyIdleMinutes)}, set by the Office`}</span>
            </span>
            <Select
              className="select select--sm pfm__item-control"
              aria-label="Sign out when idle"
              value={stay ? "stay" : idle}
              disabled={busy !== null}
              onChange={(v) => {
                const nextStay = v === "stay";
                const nextIdle = nextStay ? idle : v;
                setIdle(nextIdle);
                setStay(nextStay);
                void save({ idle: nextIdle, stay: nextStay });
              }}
            >
              {idleChoices(s.policyIdleMinutes).map((m) => (
                <option key={m} value={String(m)}>
                  After {duration(m)}
                </option>
              ))}
              <option value="stay">Keep me signed in</option>
            </Select>
          </li>
        </ul>
      </section>

      <section className="pfm__group" aria-labelledby="pfm-device">
        <h3 id="pfm-device" className="pfm__group-title">This device</h3>
        <ul className="pfm__list">
          <li className="pfm__item">
            <span className="pfm__item-icon" aria-hidden="true">
              <Icon name="sliders" size={15} />
            </span>
            <span className="pfm__item-text">
              <b>Clear saved preferences</b>
              <span>Appearance, sidebar layout and other choices in this browser</span>
            </span>
            <button
              type="button"
              className="btn btn--sm pfm__item-control"
              disabled={busy !== null}
              onClick={async () => {
                await clearBrowserStorage();
                toast("Saved preferences cleared on this device. They reset the next time a page loads.", "ok");
              }}
            >
              Clear
            </button>
          </li>
          <li className="pfm__item pfm__item--danger">
            <span className="pfm__item-icon" aria-hidden="true">
              <Icon name="trash" size={15} />
            </span>
            <span className="pfm__item-text">
              <b>Clear cookies and sign out</b>
              <span>Removes the Hub&rsquo;s cookies and saved data from this browser</span>
            </span>
            <button
              type="button"
              className="btn btn--sm btn--danger pfm__item-control"
              disabled={busy !== null}
              onBlur={() => setConfirmClear(false)}
              onClick={async () => {
                if (!confirmClear) return setConfirmClear(true);
                setBusy("clear");
                await clearBrowserStorage();
                await clearCookiesAndSignOut();
              }}
            >
              {confirmClear ? "Confirm" : "Clear"}
            </button>
          </li>
        </ul>
      </section>
    </div>
  );
}

const AGO = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const STAMP = new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

/** "5 minutes ago", "yesterday", or the date once it is more than a week back. */
function ago(iso: string) {
  const s = Math.round((Date.parse(iso) - Date.now()) / 1000);
  const a = Math.abs(s);
  if (a < 60) return "just now";
  if (a < 3600) return AGO.format(Math.round(s / 60), "minute");
  if (a < 86_400) return AGO.format(Math.round(s / 3600), "hour");
  if (a < 7 * 86_400) return AGO.format(Math.round(s / 86_400), "day");
  return STAMP.format(new Date(iso));
}

/** Load a section's rows once it opens; a failure is a toast and an empty list. */
function useLoad<T>(load: () => Promise<({ ok: true } & T) | { ok: false; message: string }>, fallback: string) {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    load()
      .then((r) => {
        if (!live) return;
        if (r.ok) setData(r);
        else {
          setFailed(true);
          toast(r.message, "error");
        }
      })
      .catch(() => {
        if (!live) return;
        setFailed(true);
        toast(fallback, "error");
      });
    return () => {
      live = false;
    };
  }, [load, fallback, tick]);
  return { data, failed, reload: () => setTick((t) => t + 1) };
}

function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <ul className="pfm__list" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="pfm__item">
          <span className="pfm__item-icon pfm__stat--skeleton" />
          <span className="pfm__item-text">
            <span className="pfm__line pfm__stat--skeleton" />
            <span className="pfm__line pfm__line--short pfm__stat--skeleton" />
          </span>
        </li>
      ))}
    </ul>
  );
}

function Empty({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <div className="pfm__empty">
      <Icon name={icon} size={18} />
      <p>{children}</p>
    </div>
  );
}

/** Devices: where this account is signed in, and a way out of each. */
function Devices() {
  const { data, failed, reload } = useLoad<{ devices: DeviceRow[] }>(loadDevices, "Your devices could not be loaded. Try again in a moment.");
  const [busy, setBusy] = useState<string | null>(null);
  const others = data?.devices.filter((d) => !d.current) ?? [];

  const end = async (id: string | "others") => {
    setBusy(id);
    try {
      const r = id === "others" ? await signOutOtherDevices() : await signOutDevice(id);
      toast(r.message, r.ok ? "ok" : "error");
      if (r.ok) reload();
    } catch {
      toast("That device could not be signed out. Try again in a moment.", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="pfm__panel">
      <section className="pfm__group" aria-labelledby="pfm-devices">
        <div className="pfm__group-head">
          <h3 id="pfm-devices" className="pfm__group-title">Signed in</h3>
          {others.length > 0 && (
            <button type="button" className="btn btn--sm btn--ghost" disabled={busy !== null} onClick={() => void end("others")}>
              {busy === "others" ? "Signing out…" : "Sign out of all others"}
            </button>
          )}
        </div>
        {!data ? (
          failed ? <Empty icon="server">Your devices could not be loaded.</Empty> : <Skeleton rows={2} />
        ) : (
          <ul className="pfm__list">
            {data.devices.map((d) => (
              <li key={d.id} className="pfm__item">
                <span className="pfm__item-icon" aria-hidden="true">
                  <Icon name="globe" size={15} />
                </span>
                <span className="pfm__item-text">
                  <b>
                    {d.device || "Unknown device"}
                    {d.current && <span className="pfm__tag">This device</span>}
                  </b>
                  <span>
                    Signed in {ago(d.startedAt)} · {d.current ? "Active now" : `Last active ${ago(d.lastSeen)}`}
                    {d.mfa ? " · 2-step verified" : ""}
                  </span>
                </span>
                {!d.current && (
                  <button type="button" className="btn btn--sm pfm__item-control" disabled={busy !== null} onClick={() => void end(d.id)}>
                    {busy === d.id ? "Signing out…" : "Sign out"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Plain words for the audit trail's action codes; anything unlisted reads from its code. */
const ACTIONS: Record<string, string> = {
  "session.signin": "Signed in",
  "session.signout": "Signed out",
  "session.timeout": "Signed out automatically",
  "session.preferences": "Changed session settings",
  "session.signout-others": "Signed out of other devices",
  "notify.preferences": "Changed notification settings",
  "profile.update": "Updated profile",
  "evidence.submit": "Submitted evidence",
  "evidence.resubmit": "Replied to a review",
  "evidence.accept": "Accepted evidence",
  "evidence.revise": "Requested a revision",
  "evidence.map": "Changed indicator mapping",
  "data.submit": "Submitted data",
  "post.create": "Created a post",
  "post.update": "Edited a post",
  "post.draft": "Saved a draft",
  "post.publish": "Published a post",
  "post.unpublish": "Unpublished a post",
  "post.delete": "Deleted a post",
  "story.propose": "Proposed a story",
  "story.publish": "Published a story",
  "report.publish": "Published a report",
  "request.approve": "Approved a request",
  "request.review": "Started a review",
};
const actionText = (code: string) => ACTIONS[code] ?? code.replace(/[._-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const LOG_ICON: Record<string, IconName> = { session: "lock-keyhole", profile: "user", evidence: "evidence", data: "data", post: "pen", story: "pen", report: "reports", request: "workflow" };

/** Logs: this person's latest entries in the audit trail, grouped by day. */
function Logs() {
  const { data, failed } = useLoad<{ logs: LogRow[] }>(loadLogs, "Your activity log could not be loaded. Try again in a moment.");
  const days = new Map<string, LogRow[]>();
  for (const l of data?.logs ?? []) {
    const d = DATE_FMT.format(new Date(l.at));
    days.set(d, [...(days.get(d) ?? []), l]);
  }
  return (
    <div className="pfm__panel">
      {!data ? (
        failed ? <Empty icon="activity">Your activity log could not be loaded.</Empty> : <Skeleton rows={5} />
      ) : !data.logs.length ? (
        <Empty icon="activity">Nothing yet. What you do in the Hub is recorded here.</Empty>
      ) : (
        [...days].map(([day, rows]) => (
          <section key={day} className="pfm__group">
            <h3 className="pfm__group-title">{day}</h3>
            <ul className="pfm__list">
              {rows.map((l) => (
                <li key={l.seq} className={`pfm__item pfm__item--log${l.outcome !== "Success" ? " pfm__item--danger" : ""}`}>
                  <span className="pfm__item-icon" aria-hidden="true">
                    <Icon name={l.outcome !== "Success" ? "alert" : LOG_ICON[l.action.split(".")[0]] ?? "activity"} size={15} />
                  </span>
                  <span className="pfm__item-text">
                    <b>
                      {actionText(l.action)}
                      {l.outcome !== "Success" && <span className="pfm__tag pfm__tag--danger">{l.outcome}</span>}
                    </b>
                    <span>{[l.label, l.detail].filter(Boolean).join(" · ")}</span>
                  </span>
                  <time className="pfm__time" dateTime={l.at}>
                    {new Date(l.at).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}
                  </time>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

/** One on/off switch in a settings row. */
function Toggle({ on, label, disabled, onChange }: { on: boolean; label: string; disabled?: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className="pfm__toggle" disabled={disabled} onClick={() => onChange(!on)}>
      <span className="pfm__switch" aria-hidden="true" />
    </button>
  );
}

/** Notifications: email on or off, and which kinds reach this person in the Hub and by email. */
function Notifications({ viewer }: { viewer: Viewer }) {
  const router = useRouter();
  const [prefs, setPrefs] = useState(viewer.notify);
  const [busy, setBusy] = useState(false);

  const save = async (next: { email: boolean; off: string[] }) => {
    const before = prefs;
    setPrefs(next);
    setBusy(true);
    try {
      const r = await saveNotificationPrefs(next);
      toast(r.message, r.ok ? "ok" : "error");
      if (r.ok) router.refresh();
      else setPrefs(before);
    } catch {
      setPrefs(before);
      toast("Your notification settings could not be saved. Try again in a moment.", "error");
    } finally {
      setBusy(false);
    }
  };

  const isOn = (kind: NotifyKind, channel: NotifyChannel) => kind.required || !prefs.off.includes(prefKey(kind.key, channel));
  const flip = (kind: NotifyKind, channel: NotifyChannel, on: boolean) => {
    const key = prefKey(kind.key, channel);
    void save({ ...prefs, off: on ? prefs.off.filter((k) => k !== key) : [...prefs.off, key] });
  };

  return (
    <div className="pfm__panel">
      <section className="pfm__group" aria-labelledby="pfm-delivery">
        <h3 id="pfm-delivery" className="pfm__group-title">Delivery</h3>
        <ul className="pfm__list">
          <li className="pfm__item">
            <span className="pfm__item-icon" aria-hidden="true">
              <Icon name="bell" size={15} />
            </span>
            <span className="pfm__item-text">
              <b>In the Hub</b>
              <span>Shown in the bell at the top of each page</span>
            </span>
            <Toggle on label="In the Hub" disabled onChange={() => {}} />
          </li>
          <li className="pfm__item">
            <span className="pfm__item-icon" aria-hidden="true">
              <Icon name="mail" size={15} />
            </span>
            <span className="pfm__item-text">
              <b>
                Email
                <span className="pfm__tag">Coming soon</span>
              </b>
              <span>Sent to {viewer.email}</span>
            </span>
            <Toggle on={prefs.email} label="Receive notifications by email" disabled={busy} onChange={(on) => void save({ ...prefs, email: on })} />
          </li>
        </ul>
      </section>

      <section className="pfm__group" aria-labelledby="pfm-kinds">
        <div className="pfm__group-head">
          <h3 id="pfm-kinds" className="pfm__group-title">Notify me about</h3>
          <span className="pfm__toggles pfm__toggles--head" aria-hidden="true">
            <span>Hub</span>
            <span>Email</span>
          </span>
        </div>
        <ul className="pfm__list">
          {NOTIFY_KINDS.map((k) => (
            <li key={k.key} className="pfm__item">
              <span className="pfm__item-text">
                <b>{k.label}</b>
                <span>{k.required ? `${k.hint}. Always on.` : k.hint}</span>
              </span>
              <span className="pfm__toggles">
                <Toggle on={isOn(k, "hub")} label={`${k.label} in the Hub`} disabled={busy || k.required} onChange={(on) => flip(k, "hub", on)} />
                <Toggle on={prefs.email && isOn(k, "email")} label={`${k.label} by email`} disabled={busy || k.required || !prefs.email} onChange={(on) => flip(k, "email", on)} />
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** Support: how to reach the Office, and where help lives. */
function Support({ workspace, onOpen }: { workspace: "office" | "portal"; onOpen: () => void }) {
  const { office } = useReference();
  const base = workspace === "office" ? "/admin" : "/portal";
  const help: { href: string; icon: IconName; title: string; text: string }[] = [
    ...(workspace === "portal" ? [{ href: "/portal/assistance", icon: "help" as IconName, title: "Request assistance", text: "Ask the Office for help with a requirement or submission" }] : []),
    { href: `${base}/knowledge`, icon: "knowledge" as IconName, title: "Knowledge Center", text: "Guides, templates and ranking methodology" },
    { href: `${base}/about`, icon: "info", title: "About the Office", text: "Who we are, and what each team looks after" },
  ];
  const keys: [string, string][] = [
    ["⌘ K", "Search the Hub"],
    ["/", "Search from anywhere outside a field"],
    ["Esc", "Close a window or clear a search"],
  ];
  return (
    <div className="pfm__panel">
      <section className="pfm__group" aria-labelledby="pfm-contact">
        <h3 id="pfm-contact" className="pfm__group-title">Contact the Office</h3>
        <ul className="pfm__list">
          <li className="pfm__item">
            <span className="pfm__item-icon" aria-hidden="true">
              <Icon name="mail" size={15} />
            </span>
            <span className="pfm__item-text">
              <b>Email</b>
              <span>{office.email}</span>
            </span>
            <a className="btn btn--sm pfm__item-control" href={`mailto:${office.email}?subject=${encodeURIComponent("Hub support")}`}>
              Write
            </a>
          </li>
          {office.phone && (
            <li className="pfm__item">
              <span className="pfm__item-icon" aria-hidden="true">
                <Icon name="comment" size={15} />
              </span>
              <span className="pfm__item-text">
                <b>Phone</b>
                <span>{office.phone}</span>
              </span>
            </li>
          )}
          <li className="pfm__item">
            <span className="pfm__item-icon" aria-hidden="true">
              <Icon name="pin" size={15} />
            </span>
            <span className="pfm__item-text">
              <b>{office.name}</b>
              <span>
                {[office.location, `University of Santo Tomas, ${office.street}, ${office.city}`].filter(Boolean).join(" · ")}
              </span>
            </span>
          </li>
        </ul>
      </section>

      <section className="pfm__group" aria-labelledby="pfm-help">
        <h3 id="pfm-help" className="pfm__group-title">Help</h3>
        <ul className="pfm__list">
          {help.map((h) => (
            <li key={h.href} className="pfm__item">
              <Link href={h.href} className="pfm__item-link" onClick={onOpen}>
                <span className="pfm__item-icon" aria-hidden="true">
                  <Icon name={h.icon} size={15} />
                </span>
                <span className="pfm__item-text">
                  <b>{h.title}</b>
                  <span>{h.text}</span>
                </span>
                <Icon name="chevron" size={14} />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="pfm__group" aria-labelledby="pfm-keys">
        <h3 id="pfm-keys" className="pfm__group-title">Keyboard shortcuts</h3>
        <ul className="pfm__list">
          {keys.map(([k, t]) => (
            <li key={k} className="pfm__item pfm__item--compact">
              <span className="pfm__item-text">
                <b>{t}</b>
              </span>
              <kbd className="pfm__kbd">{k}</kbd>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}


/** The public website's policies, titled as the site titles them. */
const POLICIES: { href: string; icon: IconName; title: string; text: string }[] = [
  { href: "/terms", icon: "scroll", title: "Terms of use", text: "The rules for using the Hub and its content" },
  { href: "/privacy", icon: "shield", title: "Data privacy notice", text: "What personal data the Hub collects, why, and your rights" },
  { href: "/cookies", icon: "clipboard", title: "Cookie policy", text: "The cookies the Hub sets and what each one does" },
];

/** Data and privacy: a copy of everything the Hub keeps, the policies that govern it, and who to ask. */
function Privacy() {
  const { data, failed } = useLoad<PrivacyInfo>(loadPrivacy, "Your privacy details could not be loaded. Try again in a moment.");
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const r = await exportMyData();
      if (!r.ok) return toast(r.message, "error");
      const url = URL.createObjectURL(new Blob([r.file], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = r.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast("Your data is downloading.", "ok");
    } catch {
      toast("Your data could not be prepared. Try again in a moment.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pfm__panel">
      <section className="pfm__group" aria-labelledby="pfm-data">
        <h3 id="pfm-data" className="pfm__group-title">Your data</h3>
        <ul className="pfm__list">
          <li className="pfm__item">
            <span className="pfm__item-icon" aria-hidden="true">
              <Icon name="download" size={15} />
            </span>
            <span className="pfm__item-text">
              <b>Download your data</b>
              <span>Profile, roles, devices, notifications and activity, as one JSON file</span>
            </span>
            <button type="button" className="btn btn--sm pfm__item-control" disabled={busy} onClick={() => void download()}>
              {busy ? "Preparing…" : "Download"}
            </button>
          </li>
        </ul>
      </section>

      <section className="pfm__group" aria-labelledby="pfm-policies">
        <h3 id="pfm-policies" className="pfm__group-title">Policies</h3>
        <ul className="pfm__list">
          {POLICIES.map((p) => (
            <li key={p.href} className="pfm__item">
              <a href={p.href} className="pfm__item-link" target="_blank" rel="noreferrer">
                <span className="pfm__item-icon" aria-hidden="true">
                  <Icon name={p.icon} size={15} />
                </span>
                <span className="pfm__item-text">
                  <b>{p.title}</b>
                  <span>{p.text}</span>
                </span>
                <Icon name="arrow-up-right" size={14} />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="pfm__group" aria-labelledby="pfm-officer">
        <h3 id="pfm-officer" className="pfm__group-title">Privacy officer</h3>
        {!data ? (
          failed ? <Empty icon="shield">Your privacy details could not be loaded.</Empty> : <Skeleton rows={1} />
        ) : (
          <ul className="pfm__list">
            <li className="pfm__item">
              <span className="pfm__item-icon" aria-hidden="true">
                <Icon name="shield-check" size={15} />
              </span>
              <span className="pfm__item-text">
                <b>{data.officer}</b>
                <span>
                  {data.email} · Privacy notice updated {DATE_FMT.format(new Date(data.noticeUpdated + "T00:00:00Z"))}
                </span>
              </span>
              <a className="btn btn--sm pfm__item-control" href={`mailto:${data.email}?subject=${encodeURIComponent("Privacy question")}`}>
                Write
              </a>
            </li>
          </ul>
        )}
      </section>
    </div>
  );
}

/** Language: what the Hub is written in, and the region its dates and deadlines follow. */
function Language() {
  const now = new Date();
  const rows: { icon: IconName; title: string; text: string; value: string }[] = [
    { icon: "clock", title: "Time zone", text: "Deadlines and times follow Manila time", value: "UTC+8" },
    { icon: "calendar", title: "Dates", text: "Day, month, year", value: DATE_FMT.format(now) },
    { icon: "hash", title: "Numbers", text: "Comma for thousands, point for decimals", value: NUM.format(12345.6) },
  ];
  return (
    <div className="pfm__panel">
      <section className="pfm__group" aria-labelledby="pfm-lang">
        <h3 id="pfm-lang" className="pfm__group-title">Language</h3>
        <ul className="pfm__list">
          <li className="pfm__item">
            <span className="pfm__item-icon" aria-hidden="true">
              <Icon name="globe" size={15} />
            </span>
            <span className="pfm__item-text">
              <b>Display language</b>
              <span>The Hub is written in English. Your browser can translate any page for you.</span>
            </span>
            <span className="pfm__value">English</span>
          </li>
        </ul>
      </section>
      <section className="pfm__group" aria-labelledby="pfm-region">
        <h3 id="pfm-region" className="pfm__group-title">Region · Philippines</h3>
        <ul className="pfm__list">
          {rows.map((r) => (
            <li key={r.title} className="pfm__item">
              <span className="pfm__item-icon" aria-hidden="true">
                <Icon name={r.icon} size={15} />
              </span>
              <span className="pfm__item-text">
                <b>{r.title}</b>
                <span>{r.text}</span>
              </span>
              <span className="pfm__value">{r.value}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
