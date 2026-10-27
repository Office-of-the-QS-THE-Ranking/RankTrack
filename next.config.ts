import type { NextConfig } from "next";
import path from "node:path";

/** Sent with every response, pages and files alike. The Content Security Policy is set per request in src/proxy.ts. */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async redirects() {
    return [
      { source: "/admin/contribute", destination: "/admin/contributions", permanent: true },
      // Impact and Innovation became Publications; its stories are Stories & News.
      { source: "/impact/:slug*", destination: "/publications/stories/:slug*", permanent: true },
      { source: "/admin/impact", destination: "/admin/publications/stories", permanent: true },
      { source: "/publications", destination: "/publications/stories", permanent: false },
      { source: "/admin/publications", destination: "/admin/publications/stories", permanent: false },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  devIndicators: false,
  turbopack: { root: path.resolve(__dirname) },
  experimental: {
    // A workspace tab visited in the last 30 s opens from memory instead of rendering again. Every
    // change made through a server action revalidates the layout, which clears this cache.
    staleTimes: { dynamic: 30 },
  },
};

export default nextConfig;
