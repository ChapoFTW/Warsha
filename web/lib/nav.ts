/**
 * The navigation each product offers.
 *
 * It lived inline in four pages, each with its own slightly different list, so
 * a route added to one was missing from the others — which is how somebody ends
 * up on a page with no way back to the thing they were doing. One list per
 * product, read by every page in it.
 *
 * Order is the order of a job: find somebody, ask, look at what came back,
 * follow the work, then everything else.
 */

export type NavLink = { href: string; label: string };

export function customerNav(words: Record<string, string>): NavLink[] {
  return [
    { href: '/', label: words.navHome },
    { href: '/discover', label: words.navDiscover },
    { href: '/requests', label: words.navRequests },
    { href: '/jobs', label: words.navJobs },
    { href: '/addresses', label: words.navAddresses },
    { href: '/notifications', label: words.navNotifications },
    { href: '/support', label: words.navSupport },
    { href: '/account', label: words.navAccount },
  ];
}

export function workerNav(words: Record<string, string>): NavLink[] {
  return [
    { href: '/worker', label: words.navHome },
    { href: '/worker/opportunities', label: words.navOpportunities },
    { href: '/worker/jobs', label: words.navJobs },
    { href: '/worker/earnings', label: words.navEarnings },
    { href: '/worker/profile', label: words.navProfile },
    { href: '/worker/verification', label: words.navVerification },
    { href: '/notifications', label: words.navNotifications },
    { href: '/support', label: words.navSupport },
  ];
}
