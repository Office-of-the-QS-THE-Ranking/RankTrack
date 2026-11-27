# Firewall › Analytics

The Firewall page's Analytics tab is the Hub's own page analytics, next to the request log. It runs inside the Hub, like
the firewall, so it works the same on any host. It is off until a Director or Ranking Specialist presses **Enable** (or
switches on Settings › Analytics › Count visits). It is separate from the firewall's request log: page views come from
the browser, not the proxy, and keep no addresses.

## How it works

- **Collecting.** `<WebAnalytics />` (`src/components/ui/WebAnalytics.tsx`, mounted once in `src/app/layout.tsx`) sends one
  page view per route to `POST /api/pulse`, including client-side navigations. It also records two events by itself:
  **Download** (links to files or with `download`) and **Outbound link** (links to other sites).
- **Custom events.** `track("Name", { key: "value" })` from `src/lib/web-analytics/track.ts`, in any client component.
- **Recording.** `/api/pulse` answers 204 at once and writes after the response (`after`) through
  `web_analytics_record`. Nothing is written while collection is off, for bots and headless browsers, or on a development
  server unless Settings › Development servers is on (or `HUB_ANALYTICS_DEV=1`). Settings are held for 30 seconds.
- **Retention.** Each server purges records past the retention period (default 180 days) at most once an hour.

## Privacy

- No cookies or browser storage, and no addresses are stored.
- A visitor is an HMAC of the address, user agent and host with a salt that changes daily (UTC). One person counts once a
  day, and days can't be linked. Bounce rate is the share of those visitors who saw one page.
- Query strings are dropped, except `utm_source`, `utm_medium` and `utm_campaign`. Form links are recorded as `/f/[code]`,
  so secret links never reach the table. Referrers are kept as the referring host only.

## Console

Analytics tab: metric tabs (visitors, page views, bounce rate, each against the previous period) over one chart, then Pages
(pages, routes, hostnames), Sources (referrers, UTM), Countries, Devices, Browsers/OS and Events, then the latest events. The area switch splits
the public site, portals, forms and sign-in. The Firewall's Live switch also polls `/api/web-analytics` every 15 seconds while the tab is open. Collection, development servers, retention and deleting records are in Firewall › Settings › Analytics. Viewing needs Privacy and
security (view); retention needs edit; collection, development servers and deleting all records need manage. Changes are
audited (category Security).

Tables `web_analytics_settings` and `web_analytics_events` (migration `20261114120000_web_analytics.sql`) sit outside the
governance store and are reachable only with the secret key.
