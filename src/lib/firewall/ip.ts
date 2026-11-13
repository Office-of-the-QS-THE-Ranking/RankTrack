/*
 * Addresses for the Hub's firewall and rate limits: which header carries the client's address, and IPv4/IPv6
 * parsing with CIDR ranges. Pure functions, so the proxy, the server and the tests share them.
 */

/**
 * The request header that carries the client's address, set (and overwritten) by the proxy in front of the Hub:
 * Vercel's x-real-ip by default there, HUB_CLIENT_IP_HEADER elsewhere (cf-connecting-ip behind Cloudflare, for
 * one). A header the client itself can send is never trusted.
 */
export const CLIENT_IP_HEADER = (process.env.HUB_CLIENT_IP_HEADER ?? (process.env.VERCEL ? "x-real-ip" : "")).toLowerCase();

/** The client's address from a request's headers; without a trusted header, the nearest proxy's X-Forwarded-For entry. */
export function clientAddress(get: (name: string) => string | null | undefined): { address: string; trusted: boolean } {
  const trusted = CLIENT_IP_HEADER ? get(CLIENT_IP_HEADER)?.split(",")[0]?.trim() : undefined;
  if (trusted) return { address: trusted, trusted: true };
  return { address: get("x-forwarded-for")?.split(",").at(-1)?.trim() || "unknown", trusted: false };
}

/**
 * Headers the host sets with the client's country and city. Only the host's own are read, since a client can send any
 * header it likes: Vercel's by default there, HUB_GEO_COUNTRY_HEADER / HUB_GEO_CITY_HEADER elsewhere (cf-ipcountry
 * behind Cloudflare). With neither, the firewall records no location and country rules never match.
 */
export const GEO_COUNTRY_HEADER = (process.env.HUB_GEO_COUNTRY_HEADER ?? (process.env.VERCEL ? "x-vercel-ip-country" : "")).toLowerCase();
export const GEO_CITY_HEADER = (process.env.HUB_GEO_CITY_HEADER ?? (process.env.VERCEL ? "x-vercel-ip-city" : "")).toLowerCase();

export function clientPlace(get: (name: string) => string | null | undefined): { country: string | null; city: string | null } {
  const raw = GEO_COUNTRY_HEADER ? get(GEO_COUNTRY_HEADER)?.trim().toUpperCase() : undefined;
  const country = raw && /^[A-Z]{2}$/.test(raw) && raw !== "XX" ? raw : null;
  let city: string | null = null;
  const c = GEO_CITY_HEADER ? get(GEO_CITY_HEADER) : undefined;
  if (c) {
    try {
      city = decodeURIComponent(c).slice(0, 80);
    } catch {
      city = c.slice(0, 80);
    }
  }
  return { country, city };
}

export interface Ip {
  v: 4 | 6;
  n: bigint;
}

function parse4(s: string): bigint | null {
  const parts = s.split(".");
  if (parts.length !== 4) return null;
  let n = BigInt(0);
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = (n << BigInt(8)) | BigInt(v);
  }
  return n;
}

function parse6(s: string): bigint | null {
  let text = s;
  // An embedded IPv4 tail (::ffff:192.0.2.1) becomes two groups.
  const tail = text.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (tail) {
    const v4 = parse4(tail[2]);
    if (v4 === null) return null;
    text = `${tail[1]}${(v4 >> BigInt(16)).toString(16)}:${(v4 & BigInt(0xffff)).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 ? (halves[1] ? halves[1].split(":") : []) : null;
  const groups = rest === null ? head : [...head, ...Array(Math.max(0, 8 - head.length - rest.length)).fill("0"), ...rest];
  if (groups.length !== 8 || (rest !== null && head.length + rest.length > 7)) return null;
  let n = BigInt(0);
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
    n = (n << BigInt(16)) | BigInt(parseInt(g, 16));
  }
  return n;
}

const MAPPED = BigInt(0xffff) << BigInt(32);
const LOW32 = (BigInt(1) << BigInt(32)) - BigInt(1);

/** An address as a number; IPv4-mapped IPv6 addresses count as IPv4. */
export function parseIp(input: string): Ip | null {
  const s = input.trim().replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  if (!s) return null;
  if (!s.includes(":")) {
    const n = parse4(s);
    return n === null ? null : { v: 4, n };
  }
  const n = parse6(s);
  if (n === null) return null;
  if (n >> BigInt(32) === BigInt(0xffff) && (n & ~LOW32) === MAPPED) return { v: 4, n: n & LOW32 };
  return { v: 6, n };
}

export interface Range {
  v: 4 | 6;
  net: bigint;
  prefix: number;
}

/** "203.0.113.7", "203.0.113.0/24" or "2001:db8::/32". */
export function parseRange(input: string): Range | null {
  const [addr, bits, extra] = input.trim().split("/");
  if (extra !== undefined) return null;
  const ip = parseIp(addr);
  if (!ip) return null;
  const max = ip.v === 4 ? 32 : 128;
  const prefix = bits === undefined ? max : /^\d{1,3}$/.test(bits) ? Number(bits) : NaN;
  if (!(prefix >= 0 && prefix <= max)) return null;
  const shift = BigInt(max - prefix);
  return { v: ip.v, net: (ip.n >> shift) << shift, prefix };
}

export function inRange(ip: Ip, range: Range): boolean {
  if (ip.v !== range.v) return false;
  const shift = BigInt((ip.v === 4 ? 32 : 128) - range.prefix);
  return ip.n >> shift === range.net >> shift;
}

function format(r: Range) {
  if (r.v === 4) {
    const parts = [24, 16, 8, 0].map((s) => Number((r.net >> BigInt(s)) & BigInt(255)));
    return parts.join(".") + (r.prefix === 32 ? "" : `/${r.prefix}`);
  }
  const groups = Array.from({ length: 8 }, (_, i) => Number((r.net >> BigInt(112 - i * 16)) & BigInt(0xffff)).toString(16));
  // Compress the longest run of zero groups.
  let best = -1;
  let len = 0;
  for (let i = 0; i < 8; ) {
    if (groups[i] !== "0") {
      i++;
      continue;
    }
    let j = i;
    while (j < 8 && groups[j] === "0") j++;
    if (j - i > len && j - i > 1) {
      best = i;
      len = j - i;
    }
    i = j;
  }
  const text = best < 0 ? groups.join(":") : `${groups.slice(0, best).join(":")}::${groups.slice(best + len).join(":")}`;
  return text + (r.prefix === 128 ? "" : `/${r.prefix}`);
}

/** The canonical spelling of an address or range, or null if it isn't one. */
export function normalizeRange(input: string): string | null {
  const r = parseRange(input);
  return r ? format(r) : null;
}
