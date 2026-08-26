/**
 * Where a signed-in person can go, and which of those places deserve to be on
 * the screen at all times.
 *
 * ## What was wrong
 *
 * This file already was the single authority — it replaced four inline lists,
 * which is why a route added to one page stopped going missing from the others.
 * What it never had was a notion of RANK. Every destination it knew about was
 * returned as one flat array, and `AppShell` rendered every element of that
 * array as a persistent top-level link. So the customer header carried nine:
 *
 *     Home · Find help · Requests · My jobs · Addresses · Notifications ·
 *     Support · Help · Account
 *
 * and the list only ever grew — eight at `bd0215f`, nine when `/help` was added
 * at `fdc841e`, never fewer. Nine persistent destinations is not navigation, it
 * is a sitemap: the two things a customer actually came to do are given the
 * same weight as the page where they change their password.
 *
 * The native client never had this problem. It offers three tabs — Home,
 * Orders, Profile — and keeps Help, Support, favourites, referrals and
 * appearance inside Profile, with notifications as a header action. So the fix
 * is not a new idea; it is web catching up to the information architecture the
 * product already shipped on the phone.
 *
 * ## The rule
 *
 * `primary` is for a destination somebody navigates to REPEATEDLY as part of
 * doing the thing this product is for. `account` is for everything else that
 * must remain reachable — settings, one-off configuration, help, and the
 * places you visit when something is wrong. Nothing is removed; the second tier
 * lives one click away behind the account control instead of competing for the
 * same row.
 *
 * A destination moving between tiers is a product decision and belongs here, in
 * one file, for every surface that renders navigation. `authenticated-navigation.test.mts`
 * asserts the primary tiers stay small and that the reclassified destinations
 * cannot drift back up.
 */

export type NavLink = { href: string; label: string };

export type RoleNavigation = {
  /** Persistent, always on screen. Kept deliberately short. */
  primary: NavLink[];
  /** Reachable in one click from the account control. Never removed. */
  account: NavLink[];
};

/** The most a role may keep in persistent navigation before it stops being navigation. */
export const PRIMARY_NAV_LIMIT = 4;

/**
 * The customer product.
 *
 * Primary is the shape of the job: land, find somebody, see what you asked for,
 * follow the work. `Find help` stays primary because starting a request is the
 * single most important thing a customer does here.
 *
 * Addresses, Notifications, Support, Help and Account move to the account tier.
 * Addresses is configuration a customer touches when they move house. Support
 * and Help are for when something is wrong — important, and not something to
 * put in front of somebody who is fine. Notifications is genuinely
 * time-sensitive, which is why the shell gives the account control an unread
 * indicator rather than leaving the destination unannounced.
 */
export function customerNavigation(words: Record<string, string>): RoleNavigation {
  return {
    primary: [
      { href: '/', label: words.navHome },
      { href: '/discover', label: words.navDiscover },
      { href: '/requests', label: words.navRequests },
      { href: '/jobs', label: words.navJobs },
    ],
    account: [
      { href: '/notifications', label: words.navNotifications },
      { href: '/addresses', label: words.navAddresses },
      { href: '/account', label: words.navAccount },
      { href: '/support', label: words.navSupport },
      { href: '/help', label: words.navHelp },
    ],
  };
}

/**
 * The worker product.
 *
 * Primary is the working day: where you start, what work is available, what you
 * have taken, and what you have earned. Those are the four a worker opens
 * repeatedly.
 *
 * Profile and Verification move to the account tier deliberately. Both matter
 * enormously — and both are things a worker completes and then rarely returns
 * to. Verification in particular is a one-time flow whose prompting belongs in
 * the worker's home dashboard, where the native client already puts it, rather
 * than as a permanent header link that keeps reminding a fully approved worker
 * of a step they finished months ago.
 */
export function workerNavigation(words: Record<string, string>): RoleNavigation {
  return {
    primary: [
      { href: '/worker', label: words.navHome },
      { href: '/worker/opportunities', label: words.navOpportunities },
      { href: '/worker/jobs', label: words.navJobs },
      { href: '/worker/earnings', label: words.navEarnings },
    ],
    account: [
      { href: '/notifications', label: words.navNotifications },
      { href: '/worker/profile', label: words.navProfile },
      { href: '/worker/verification', label: words.navVerification },
      { href: '/support', label: words.navSupport },
      { href: '/help', label: words.navHelp },
    ],
  };
}

/**
 * A worker who has not finished onboarding.
 *
 * Opportunities, jobs and earnings are real destinations that this worker
 * cannot use yet, and offering them is how somebody is sent to an empty page
 * and left to guess whether the product is broken or they are. So the primary
 * tier is the step they are on, and everything else stays reachable in the
 * account tier.
 *
 * This scoping already existed — as a hand-written array inside
 * `app/worker/onboarding/page.tsx`, the one page that bypassed this file. The
 * decision was right and the location was wrong: an inline list is invisible to
 * anybody auditing navigation, and it is what let the page drift out of step
 * with every other worker surface.
 */
export function workerOnboardingNavigation(words: Record<string, string>): RoleNavigation {
  const full = workerNavigation(words);
  return {
    primary: [{ href: '/worker/onboarding', label: words.navHome }],
    account: [
      { href: '/worker/verification', label: words.navVerification },
      ...full.account.filter((item) => item.href !== '/worker/verification'
        && item.href !== '/worker/profile'),
    ],
  };
}

/** Every destination a role can reach, both tiers, for reachability checks. */
export function allDestinations(navigation: RoleNavigation): NavLink[] {
  return [...navigation.primary, ...navigation.account];
}
