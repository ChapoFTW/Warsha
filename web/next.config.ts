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
  /*
   * NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are read
   * through Next's ordinary environment resolution — .env.local locally, the
   * project's environment variables on Vercel.
   *
   * They were briefly mapped here from the EXPO_PUBLIC_* names, which inlined
   * empty strings whenever those were absent from the build environment and
   * silently overrode .env.local. The client constructor then threw and every
   * authenticated page rendered blank. An explicit variable that is missing is
   * a loud error; a mapped one that is empty is a blank screen.
   */
};

export default nextConfig;
