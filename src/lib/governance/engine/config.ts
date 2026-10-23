/*
 * System configuration: ranking bodies, reporting periods and academic years, uploads, notification
 * templates, dashboard defaults, feature availability and feature flags.
 */
import { RANKINGS } from "@/lib/data";
import type { Command, CommandResult } from "../commands";
import { bodyOfRanking } from "../derive";
import { accountById, can, clean, cleanText, deny, invalid, isDay, log, ok, unitById, type Ctx } from "./core";

const SETTING = (id: string, label: string) => ({ type: "Setting", id, label });

const ALLOWED_TYPES = ["PDF", "XLSX", "XLS", "CSV", "DOCX", "DOC", "PPTX", "PNG", "JPG", "JPEG", "ZIP", "TXT"];

function guard(ctx: Ctx, action: string, id: string, label: string, manage = false): CommandResult | null {
  if (!can(ctx, "config", manage ? "manage" : "edit")) return deny(ctx, action, "Configuration", SETTING(id, label), manage ? "This setting needs configuration management rights." : "Your role cannot change system configuration.");
  return null;
}

export function configure(ctx: Ctx, cmd: Extract<Command, { type: `config.${string}` }>): CommandResult {
  const c = ctx.state.config;
  switch (cmd.type) {
    case "config.body": {
      const b = c.bodies.find((x) => x.key === cmd.key);
      if (!b) return invalid("Unknown ranking body.");
      const g = guard(ctx, "config.body", b.key, b.name);
      if (g) return g;
      if (b.enabled === cmd.enabled) return ok("No changes.");
      b.enabled = cmd.enabled;
      const n = RANKINGS.filter((r) => bodyOfRanking(r.slug) === b.key).length;
      log(ctx, "config.body", "Configuration", SETTING(b.key, b.name), "Success", `${cmd.enabled ? "Supported" : "Not supported"} · ${n} rankings`);
      return ok(
        cmd.enabled
          ? `${b.name} is supported again.`
          : `${b.name} is switched off: ${n === 1 ? "its ranking leaves" : `its ${n} rankings leave`} the workspaces and the public website, and its evidence stops counting toward readiness. Nothing is deleted.`,
      );
    }
    case "config.bodyAdd": {
      const g = guard(ctx, "config.bodyAdd", "new", cmd.name, true);
      if (g) return g;
      const name = clean(cmd.name, 80);
      const short = clean(cmd.short, 20);
      if (name.length < 3 || short.length < 2) return invalid("Give the body a name and a short name.");
      if (!/^https:\/\/[^\s]+\.[^\s]+$/.test(cmd.website.trim())) return invalid("Give the body's website, starting with https://");
      if (c.bodies.some((b) => b.name.toLowerCase() === name.toLowerCase())) return invalid(`${name} is already listed.`);
      const key = short.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "BODY";
      c.bodies.push({ key, name, short, enabled: false, website: cmd.website.trim() });
      log(ctx, "config.bodyAdd", "Configuration", SETTING(key, name), "Success", "Added as planned (not yet supported)");
      return ok(`${name} added.`);
    }
    case "config.ranking": {
      const r = c.rankings.find((x) => x.slug === cmd.slug);
      const meta = RANKINGS.find((x) => x.slug === cmd.slug);
      if (!r || !meta) return invalid("Unknown ranking.");
      const g = guard(ctx, "config.ranking", r.slug, meta.name);
      if (g) return g;
      const changes: string[] = [];
      if (cmd.enabled !== undefined && cmd.enabled !== r.enabled) {
        r.enabled = cmd.enabled;
        changes.push(cmd.enabled ? "tracked" : "not tracked");
      }
      if (cmd.public !== undefined && cmd.public !== r.public) {
        r.public = cmd.public;
        changes.push(cmd.public ? "shown on the public website" : "hidden from the public website");
      }
      if (cmd.deadline !== undefined && cmd.deadline !== r.deadline) {
        if (!isDay(cmd.deadline)) return invalid("Enter the data collection deadline as a date.");
        changes.push(`deadline ${r.deadline} → ${cmd.deadline}`);
        r.deadline = cmd.deadline;
      }
      if (!changes.length) return ok("No changes.");
      log(ctx, "config.ranking", "Configuration", SETTING(r.slug, meta.name), "Success", changes.join("; "));
      return ok(`${meta.short}: ${changes.join("; ")}.`);
    }
    case "config.cycle": {
      const cy = c.cycles.find((x) => x.id === cmd.id);
      if (!cy) return invalid("Unknown cycle.");
      const g = guard(ctx, "config.cycle", cy.id, `Cycle ${cy.id}`);
      if (g) return g;
      if (cy.status === cmd.status) return ok("No changes.");
      if (cy.status === "Current" && cmd.status !== "Current") return invalid("Make another cycle current first.");
      if (cmd.status === "Current") for (const x of c.cycles) if (x.status === "Current") x.status = "Open";
      const from = cy.status;
      cy.status = cmd.status;
      log(ctx, "config.cycle", "Configuration", SETTING(cy.id, `Cycle ${cy.id}`), "Success", `${from} → ${cmd.status}`);
      return ok(`Cycle ${cy.id} is ${cmd.status.toLowerCase()}.`);
    }
    case "config.cycleAdd": {
      const g = guard(ctx, "config.cycleAdd", cmd.id, `Cycle ${cmd.id}`);
      if (g) return g;
      const id = cmd.id.trim().replace("-", "–");
      if (!/^\d{4}–\d{4}$/.test(id)) return invalid("Cycles are written like 2027–2028.");
      const [a, b] = id.split("–").map(Number);
      if (b !== a + 1) return invalid("A cycle spans two consecutive years.");
      if (c.cycles.some((x) => x.id === id)) return invalid(`Cycle ${id} already exists.`);
      c.cycles = [{ id, status: "Open" as const }, ...c.cycles].sort((x, y) => y.id.localeCompare(x.id));
      log(ctx, "config.cycleAdd", "Configuration", SETTING(id, `Cycle ${id}`), "Success", "Added as open");
      return ok(`Cycle ${id} added.`);
    }
    case "config.year": {
      const y = c.academicYears.find((x) => x.id === cmd.id);
      if (!y) return invalid("Unknown academic year.");
      const g = guard(ctx, "config.year", y.id, `Academic year ${y.id}`);
      if (g) return g;
      for (const x of c.academicYears) x.current = x.id === y.id;
      log(ctx, "config.year", "Configuration", SETTING(y.id, `Academic year ${y.id}`), "Success", "Set as current");
      return ok(`Academic year ${y.id} is current.`);
    }
    case "config.yearAdd": {
      const g = guard(ctx, "config.yearAdd", cmd.id, `Academic year ${cmd.id}`);
      if (g) return g;
      const id = cmd.id.trim().replace("-", "–");
      if (!/^\d{4}–\d{4}$/.test(id)) return invalid("Academic years are written like 2027–2028.");
      if (c.academicYears.some((x) => x.id === id)) return invalid(`${id} already exists.`);
      c.academicYears = [{ id, current: false }, ...c.academicYears].sort((x, y) => y.id.localeCompare(x.id));
      log(ctx, "config.yearAdd", "Configuration", SETTING(id, `Academic year ${id}`), "Success");
      return ok(`Academic year ${id} added.`);
    }
    case "config.period": {
      const p = c.periods.find((x) => x.id === cmd.id);
      if (!p) return invalid("Unknown reporting period.");
      const g = guard(ctx, "config.period", p.id, p.label);
      if (g) return g;
      const changes: string[] = [];
      if (cmd.accepting !== undefined && cmd.accepting !== p.accepting) {
        if (!cmd.accepting && c.periods.filter((x) => x.accepting).length <= 1) return invalid("Keep at least one reporting period open for submissions.");
        p.accepting = cmd.accepting;
        changes.push(cmd.accepting ? "accepting submissions" : "closed to submissions");
      }
      if (cmd.label !== undefined && clean(cmd.label, 60) !== p.label) {
        if (clean(cmd.label, 60).length < 4) return invalid("Label the period.");
        changes.push(`label “${p.label}” → “${clean(cmd.label, 60)}”`);
        p.label = clean(cmd.label, 60);
      }
      if (cmd.note !== undefined && clean(cmd.note, 120) !== p.note) {
        p.note = clean(cmd.note, 120);
        changes.push("note");
      }
      if (!changes.length) return ok("No changes.");
      log(ctx, "config.period", "Configuration", SETTING(p.id, p.label), "Success", changes.join("; "));
      return ok(`${p.label}: ${changes.join("; ")}.`);
    }
    case "config.periodAdd": {
      const g = guard(ctx, "config.periodAdd", "new", cmd.label);
      if (g) return g;
      const label = clean(cmd.label, 60);
      if (label.length < 4) return invalid("Label the period, for example Calendar year 2026.");
      if (c.periods.some((p) => p.label.toLowerCase() === label.toLowerCase())) return invalid(`${label} already exists.`);
      const id = label.replace(/[^A-Za-z0-9]/g, "").slice(0, 12).toUpperCase() + c.periods.length;
      c.periods.push({ id, label, note: clean(cmd.note, 120), accepting: true });
      log(ctx, "config.periodAdd", "Configuration", SETTING(id, label), "Success", "Accepting submissions");
      return ok(`${label} added and accepting submissions.`);
    }
    case "config.uploads": {
      const g = guard(ctx, "config.uploads", "uploads", "Upload limits");
      if (g) return g;
      const v = cmd.value;
      const types = [...new Set(v.types.map((t) => t.trim().toUpperCase().replace(/^\./, "")).filter(Boolean))];
      if (v.maxFileMB < 1 || v.maxFileMB > 200) return invalid("Files can be 1 to 200 MB.");
      if (v.maxFiles < 1 || v.maxFiles > 50) return invalid("Allow 1 to 50 files per submission.");
      if (!types.length) return invalid("Allow at least one file type.");
      const bad = types.filter((t) => !ALLOWED_TYPES.includes(t));
      if (bad.length) return invalid(`${bad.join(", ")} cannot be accepted. Choose from ${ALLOWED_TYPES.join(", ")}.`);
      const before = c.uploads;
      c.uploads = { maxFileMB: Math.round(v.maxFileMB), maxFiles: Math.round(v.maxFiles), types };
      log(ctx, "config.uploads", "Configuration", SETTING("uploads", "Upload limits"), "Success", `${before.maxFileMB} → ${c.uploads.maxFileMB} MB · ${before.maxFiles} → ${c.uploads.maxFiles} files · ${types.join(", ")}`);
      return ok("Upload limits saved.");
    }
    case "config.template": {
      const t = c.templates.find((x) => x.id === cmd.id);
      if (!t) return invalid("Unknown template.");
      const g = guard(ctx, "config.template", t.id, t.name);
      if (g) return g;
      const changes: string[] = [];
      if (cmd.subject !== undefined && clean(cmd.subject, 160) !== t.subject) {
        if (!clean(cmd.subject, 160)) return invalid("Give the message a subject.");
        t.subject = clean(cmd.subject, 160);
        changes.push("subject");
      }
      if (cmd.body !== undefined && cleanText(cmd.body, 1000) !== t.body) {
        if (cleanText(cmd.body).length < 10) return invalid("Write the message body.");
        t.body = cleanText(cmd.body, 1000);
        changes.push("body");
      }
      if (cmd.enabled !== undefined && cmd.enabled !== t.enabled) {
        t.enabled = cmd.enabled;
        changes.push(cmd.enabled ? "switched on" : "switched off");
      }
      if (!changes.length) return ok("No changes.");
      log(ctx, "config.template", "Configuration", SETTING(t.id, t.name), "Success", changes.join(", "));
      return ok(`${t.name} saved.`);
    }
    case "config.dashboard": {
      const g = guard(ctx, "config.dashboard", "dashboard", "Dashboard preferences");
      if (g) return g;
      const v = cmd.value;
      if (v.deadlineWarningDays !== undefined && (v.deadlineWarningDays < 3 || v.deadlineWarningDays > 90)) return invalid("Warn 3 to 90 days before a deadline.");
      c.dashboard = { ...c.dashboard, ...v };
      log(ctx, "config.dashboard", "Configuration", SETTING("dashboard", "Dashboard preferences"), "Success", Object.entries(v).map(([k, x]) => `${k}: ${x}`).join("; "));
      return ok("Dashboard preferences saved.");
    }
    case "config.feature": {
      const f = c.features.find((x) => x.id === cmd.id);
      if (!f) return invalid("Unknown feature.");
      const g = guard(ctx, "config.feature", f.id, f.name);
      if (g) return g;
      if (f.enabled === cmd.enabled) return ok("No changes.");
      f.enabled = cmd.enabled;
      log(ctx, "config.feature", "Configuration", SETTING(f.id, f.name), "Success", `${f.area}: ${cmd.enabled ? "available" : "unavailable"}`);
      return ok(`${f.name} turned ${cmd.enabled ? "on" : "off"}.`);
    }
    case "config.flag": {
      const f = c.flags.find((x) => x.id === cmd.id);
      if (!f) return invalid("Unknown feature flag.");
      const g = guard(ctx, "config.flag", f.id, f.name);
      if (g) return g;
      if (cmd.accounts?.some((a) => !accountById(ctx, a))) return invalid("One of the accounts no longer exists.");
      if (cmd.units?.some((u) => !unitById(ctx, u))) return invalid("One of the units no longer exists.");
      const mode = cmd.mode ?? f.mode;
      const accounts = cmd.accounts ?? f.accounts;
      const units = cmd.units ?? f.units;
      if (mode === "Selected" && !accounts.length && !units.length) return invalid("Choose who sees the experiment, or switch it off.");
      f.mode = mode;
      f.accounts = [...new Set(accounts)];
      f.units = [...new Set(units)];
      f.updatedAt = ctx.iso;
      const who = mode === "Selected" ? `${f.units.length} units, ${f.accounts.length} people` : mode;
      log(ctx, "config.flag", "Configuration", SETTING(f.id, f.name), "Success", who);
      return ok(`${f.name}: ${mode === "Selected" ? `on for ${f.units.length ? `${f.units.length} ${f.units.length === 1 ? "unit" : "units"}` : ""}${f.units.length && f.accounts.length ? " and " : ""}${f.accounts.length ? `${f.accounts.length} ${f.accounts.length === 1 ? "person" : "people"}` : ""}` : mode === "Everyone" ? "on for everyone" : "off"}.`);
    }
    case "config.site": {
      const g = guard(ctx, "config.site", "site", "Public website notice");
      if (g) return g;
      const notice = cmd.notice !== undefined ? cleanText(cmd.notice, 240) : c.site.notice;
      const on = cmd.noticeOn ?? c.site.noticeOn;
      if (on && notice.length < 6) return invalid("Write the notice before switching it on.");
      c.site = { ...c.site, notice, noticeOn: on };
      log(ctx, "config.site", "Configuration", SETTING("site", "Public website notice"), "Success", on ? `On: “${notice}”` : "Off");
      return ok(on ? "The notice now shows across the public website and the workspaces." : "Notice saved and hidden.");
    }
  }
}
