/*
 * What an evidence link points at, read from the address alone: the Hub never opens it. THE rejects folders and
 * pages of links (each indicator takes one self-contained piece of evidence), and only counts public evidence.
 */

/** A web address the Hub keeps: https, at most 2,000 characters, no credentials. */
export function cleanUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s || s.length > 2000) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password) return null;
    if (!u.hostname.includes(".")) return null;
    u.protocol = "https:";
    return u.toString();
  } catch {
    return null;
  }
}

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

/** A folder or a listing rather than one item: Google Drive and OneDrive folders, Dropbox shared folders. */
export function isFolderLink(url: string): boolean {
  const h = host(url);
  if (h === "drive.google.com") return /\/drive\/(?:u\/\d+\/)?folders\//.test(url) || /[?&]id=.*&?.*folderview/.test(url) || /\/embeddedfolderview/.test(url);
  if (h.endsWith("sharepoint.com") || h === "1drv.ms" || h === "onedrive.live.com") return /\/:f:\//.test(url);
  if (h === "dropbox.com") return /\/(?:sh|scl\/fo)\//.test(url);
  try {
    return /\/folders?\//i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/** Stored in someone's Google Drive (and so private unless shared to anyone with the link). */
export const isDriveLink = (url: string) => ["drive.google.com", "docs.google.com"].includes(host(url));

/** The host and the start of the path, short enough for a list. */
export function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 30 ? `${u.pathname.slice(0, 29)}…` : u.pathname;
    return `${u.hostname.replace(/^www\./, "")}${path === "/" ? "" : path}`;
  } catch {
    return url;
  }
}

/** Every https address in a piece of text, in order, without repeats. */
export function urlsIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/https?:\/\/[^\s<>"'|]+/g)) {
    const u = cleanUrl(m[0].replace(/[),.;]+$/, ""));
    if (u && !out.includes(u)) out.push(u);
  }
  return out;
}
