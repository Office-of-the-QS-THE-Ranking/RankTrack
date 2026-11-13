# Firewall

Command & Control › Firewall is the Hub's own firewall. It runs inside the Hub, not at the host, so it works the same
on Vercel, behind Cloudflare, or on a plain Node server. Changing hosts doesn't change how the Office inspects traffic.

## How it works

- **Where it runs.** `src/proxy.ts` calls `firewall()` (`src/lib/firewall/guard.ts`) before anything else, for every
  page, Server Function and API request. Build assets, images and `/media` are outside the proxy's matcher and aren't
  checked.
- **Rules in memory.** The settings and active rules come from Supabase (`firewall_config`) and are held for
  15 seconds, then refreshed in the background, so a check costs no database round trip. Changes apply within
  15 seconds on every server.
- **Recording.** Each request is written to `firewall_requests` (`firewall_log`) after the response is sent
  (`waitUntil`). Once an hour, each server deletes records older than the retention period (`firewall_purge`).
- **Failing open.** If Supabase can't be reached, requests go through unchecked and unrecorded. A database hiccup
  never takes the Hub down.

## What a request is checked against, in order

1. **Allow rules.** A match skips every other check. Use this for the campus network, so the Office can't be locked out.
2. **Block rules.** By address or CIDR range, two-letter country code, path prefix, or text in the user agent.
3. **Scanners and probes** (built-in rule, in Rules). Known attack tools, no user agent, and paths the Hub never serves
   (`/.env`, `/wp-login.php`, `*.php` …).
4. **Rate limit** (built-in rule, in Rules). Requests a minute per address, counted by each server instance on its own.
   A campus network shares one address, so keep it high, or allow the campus range.
5. **Lockdown** (setting). Only requests with a session cookie get through, plus `/signin`, `/auth`, `/api/auth`
   and `/api/cron`.
6. **Log rules.** Let the request through, but flag it.

Mode **Monitor** (the default) records what would have been refused as *Flagged* and blocks nothing. **Enforce**
refuses with 403, 429 or 503 and shows a reference code that matches the request in the log. **Off** checks and
records nothing.

## Safety

- The console refuses a block rule that would match the person making it, and refuses to block `/`, sign-in or the
  firewall page itself.
- `HUB_FIREWALL=off` switches the firewall off entirely. This is the way back in.
- Development servers share the production database, so the firewall is off on them until a Director switches on
  Settings › Run on development servers (or the banner's Turn on here). Their visits then go into the same log, with
  the host `localhost`. `HUB_FIREWALL_DEV=1` forces it on for one server.
- Viewing needs Privacy and security (view). Rules need edit. Mode and lockdown need manage. Every change goes into
  the audit trail (category Security).

## Hosting

| Setting | Vercel | Elsewhere |
| --- | --- | --- |
| Client address | `x-real-ip` (automatic) | `HUB_CLIENT_IP_HEADER`, e.g. `cf-connecting-ip` |
| Country / city | `x-vercel-ip-country` / `-city` (automatic) | `HUB_GEO_COUNTRY_HEADER` / `HUB_GEO_CITY_HEADER`, e.g. `cf-ipcountry` |

Only headers the host itself sets are trusted. Without a location header, no locations are recorded and country
rules never match.

## Privacy

Addresses are personal data under RA 10173. Records are kept for the retention period (default 30 days, set in
Firewall › Settings), then deleted. Only people with the Privacy and security module (Super Administrators) can see
them. The privacy notice should say that the Hub records addresses for security.

Tables: `firewall_settings`, `firewall_rules`, `firewall_requests` (migration `20261113120000_firewall.sql`), outside
the governance store and reachable only with the secret key.

## Console layout

- **Rules** contains the built-in scanner and rate-limit rules, custom allow/block/log rules, and their execution order.
  Built-in controls keep their existing settings storage and evaluation priority; enabling the rate limit starts at
  600 requests per minute per address, and its threshold can be saved from 60 to 100,000. Disabling it stores 0.
- **Settings** contains operating mode, lockdown, development-server enforcement, record retention, and connection details.
  Built-in rules and record retention require edit access; mode, lockdown and development-server controls require manage access.
