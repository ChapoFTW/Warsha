# Cross-platform parity

**A defect found on one Warsha surface is a defect on every surface that shares
the behaviour, until checked.**

This is a standing engineering requirement, not advice. It applies to every
change from 2026-08-11 onward.

## The rule

When you find a bug, a UX problem, a validation rule that is wrong, a
localization gap, a visual inconsistency, an authentication behaviour or any
shared product rule, **audit every other applicable Warsha surface for the same
issue before you close the work**, and fix it everywhere it applies.

The surfaces:

| | |
| --- | --- |
| Clients | public web · customer web · worker web · admin web · Android · iOS |
| Languages | English · Arabic (RTL) |
| Appearance | light · dark · system-derived |

Report the audit even when it finds nothing. "Checked Android and iOS; the
header does not exist there" is a useful sentence. Silence is not.

## Administration is web-only

**Operational administration exists only at `admin.usewarsha.com`. Android and
iOS must not contain a staff operations console.** This is a platform boundary,
decided 2026-08-12, not an oversight and not a parity violation.

| Capability | Where it lives |
| --- | --- |
| Customer and worker product functionality | mobile **and** web |
| Staff operations console | **admin web only** |

The distinction that keeps this correct, because it is easy to get wrong:

**A staff member may also be a customer or a worker.** Their staff role is real
backend authority and stays that way. Mobile treats that person normally
according to their *product* roles — they book work or do work like anybody
else. What mobile does not carry is the *staff operations* surface.

So:

- backend staff governance, capabilities, roles and audit are untouched;
- no staff role is removed from any account because of this rule;
- `get_staff_session()` remains the authorization authority everywhere;
- shared staff *types and backend concepts* may stay in `src/` where the
  product legitimately uses them;
- what was removed is the reachable console: `app/admin/**` and
  `components/warsha/AdminShell.tsx`.

Do not reintroduce a mobile admin console. `npm run test:wps017` asserts the
absence of every one of those screens by name, and that the mobile router
registers no `admin` surface, so bringing one back fails the build.

The admin origin must also always have a real signed-out entry. An
unauthenticated operator reaching `admin.usewarsha.com` — at any path — gets the
staff sign-in form, never a 404. `npm run test:web-navigation` asserts that
every navigation and redirect destination on that origin resolves to a route.

## What parity does and does not mean

**It does not mean identical layouts.** A bottom tab bar is right for a thumb
and wrong for a 1440px pointer surface. A worker's phone screen and an admin
console have different shapes for good reasons. Platform-appropriate
presentation is expected.

**It does mean these stay the same everywhere:**

- product rules and validation;
- identity and brand — one mark, one palette, one wordmark;
- localization, including direction, not only translated strings;
- authentication behaviour and what it asks of somebody;
- what the product claims to be true.

The test is: *would a person notice Warsha behaving differently about the same
thing?* Layout differences are fine. Warsha disagreeing with itself is not.

## Why this exists

Two concrete cases from the work that produced this document.

**Sign-in asked people to classify themselves.** Both the mobile screen and the
web page asked "customer or worker?" before authenticating, and the mobile one
then rejected valid worker credentials typed while the selector sat on
Customer. It was fixed on mobile; the web had the same defect, and would have
kept it if the audit had stopped at the platform where it was noticed.

**The web header used a generic rounded square as the logo.** The canonical
mark — a stroked frame containing a concealed W flow-trace — already existed in
`components/warsha/BrandMark.tsx` and shipped on Android and iOS. Nobody had to
draw anything; somebody had to look. An audit of "where else does the brand
appear" would have found it before it reached production.

## Doing the audit

1. Name the behaviour, not the screen. "Sign-in asks for a role", not "the
   sign-in button is wrong".
2. List which surfaces have that behaviour at all.
3. Check each one. Prefer running or rendering it over reading the source —
   the header wrapping in this work measured 122px at 1440px, and no amount of
   reading the CSS would have shown that.
4. Fix everywhere it applies, in one change where practical.
5. Report what you checked, what you found, and what you deliberately left
   alone.

## Assets and tokens are shared by default

Before creating a colour, an icon, a mark, a piece of copy or a preference key,
search for the existing one. Warsha already has:

| Thing | Authority |
| --- | --- |
| The mark and lockup | `components/warsha/BrandMark.tsx`; web mirrors the geometry in `web/components/brand-mark.tsx` |
| Colour | `constants/appearance.ts`; web restates the same values as tokens in `web/app/globals.css`, asserted equal by test |
| Language preference | `src/i18n/language-preference.ts` — keys `warsha:language:v1`, `warsha:language-explicit:v1` |
| Appearance preference | `src/appearance/appearance-types.ts` — keys `warsha:appearance:v1`, `warsha:appearance-explicit:v1` |
| Direction | `src/i18n/direction.ts` |
| Legal text | `src/legal/legal-corpus.ts` — one corpus, both clients, hashes bound to acceptances |

A second implementation of any of these is a defect even when it looks correct,
because the two will diverge and only one will be right.

## Enforcement

`npm run test:web-platform`, `test:rtl-direction`, `test:identity-signin` and
`test:web-bilingual` encode parts of this rule as assertions. They are not the
whole rule — a test cannot ask whether you checked iOS — but where a parity
requirement can be made mechanical, make it mechanical rather than remembered.
