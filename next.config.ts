import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  turbopack: { root: path.resolve(__dirname) },
  experimental: {
    // A workspace tab visited in the last 30 s opens from memory instead of rendering again. Every
    // change made through a server action revalidates the layout, which clears this cache.
    staleTimes: { dynamic: 30 },
  },
};

export default nextConfig;
