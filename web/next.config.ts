import type { NextConfig } from 'next';

/**
 * The Expo application stays exactly where it is, at the repository root.
 *
 * Moving it into `apps/mobile` is the conventional monorepo shape and it is
 * the wrong trade here: Warsha is mid manual-alpha with a green release
 * pipeline, an OTA runtime pinned to appVersion, and EAS paths that resolve
 * from the root. A restructure would invalidate all three to buy a tidier
 * directory listing.
 *
 * So the web application is a leaf that reaches up into the platform-neutral
 * half of `src/` rather than a sibling that required moving anything. The 149
 * of 180 `src/` modules that never import React Native are usable from here
 * unchanged, which is what makes one backend and one set of business rules
 * real rather than aspirational.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
  typedRoutes: true,
  eslint: { ignoreDuringBuilds: true },
  env: {
    // The web client talks to the same Supabase project as mobile. These are
    // the publishable values the mobile client already ships; no service role
    // key is ever referenced in browser code.
    NEXT_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
  },
};

export default nextConfig;
