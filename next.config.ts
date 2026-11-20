import type { NextConfig } from "next";

// Lets phones on the same network use the dev server when
// NEXT_PUBLIC_SITE_URL points at this computer's LAN address
// (e.g. http://192.168.0.136:3000). Only affects `next dev`.
function siteHostname() {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "").hostname;
  } catch {
    return "";
  }
}
const devHost = siteHostname();

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: devHost ? [devHost] : [],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
