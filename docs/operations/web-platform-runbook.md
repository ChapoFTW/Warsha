# Web platform

Warsha's web platform is a Next.js application in `web/`. It is a second client
of the same backend as the mobile application — not a second product, and not
the Expo application rendered in a browser.

## Why the Expo app did not move

The conventional monorepo shape puts both clients under `apps/`. That was
rejected, and the reason is worth recording because the tidier layout will keep
looking tempting.

Warsha is mid manual-alpha. The Expo application has a green release pipeline,
an OTA runtime pinned to `appVersion`, EAS project paths that resolve from the
repository root, and a `qa-release.mjs` export step that writes to `dist/qa-*`.
Moving it invalidates all four to buy a directory listing. So `web/` is a leaf
that reaches up into the platform-neutral half of `src/`, and nothing about the
mobile client moved.

That decision is reversible later, when the alpha is not the thing at risk.

## What is shared, and why that is the whole point

Of 180 modules in `src/`, **149 never import React Native or Expo**. Those are
importable from `web/` unchanged. The coupling that does exist is concentrated
in mock-mode local storage (`expo-sqlite/kv-store`, `expo-file-system`) rather
than in business rules.

`web/lib/warsha.ts` is the only seam. It re-exports:

| Shared module | Why it must not be duplicated |
| --- | --- |
| `src/legal/legal-corpus.ts` | An acceptance records the hash of the text shown. A second copy of the corpus would eventually record agreement to text nobody saw. |
| `src/legal/signup-legal.ts` | The documents a role must accept are the same on both clients, or web signup would bypass a requirement mobile enforces. |
| `src/i18n/translations.ts` | One vocabulary, two clients. |

Anything importing `react-native` or `expo-*` is **rebuilt for web**, never
shimmed. `scripts/web-platform.test.mts` asserts no such import reaches `web/`.

## Public site, app, and admin

The current deployment serves the public website only. The authenticated
surfaces are planned as:

| Host | Surface |
| --- | --- |
| `usewarsha.com` | Public website — marketing, discovery, legal, entry points |
| `app.usewarsha.com` | Authenticated customer and worker application |
| `admin.usewarsha.com` | Staff console |
| `mail.usewarsha.com` | Resend transactional email — **do not touch** |

### Separate hosts rather than route groups

Route groups on one host are simpler to deploy and were rejected anyway:

- **The admin console is a different threat model.** A separate origin means
  staff cookies are not same-origin with public pages, and a cross-site
  scripting flaw in a marketing page cannot reach a staff session. On one
  origin, `SameSite` is the only thing standing between them.
- **The public site should be static and cached at the edge; the app must never
  be.** One host means one cache policy argued over per route, and the failure
  mode of getting it wrong is serving one customer's dashboard to another.
- **They have different uptime obligations.** Marketing can be redeployed at
  will; the app cannot.

The cost is real — three deployments, three sets of environment variables, and
cross-subdomain auth needs cookies scoped to `.usewarsha.com`. That cost is
worth paying at the public/authenticated boundary. It is **not** worth paying
between customer and worker, which is why both share `app.` and are separated
by route and role rather than by host.

## Deployment

Vercel, using the existing authenticated account.

**One project setting must be made in the dashboard once**, because Vercel
detects the framework from the repository root — which is the Expo application
and has no `next` dependency. Adding `next` there to satisfy detection would
pollute the mobile dependency tree, so instead:

1. Vercel → the project → **Settings → General → Root Directory** → `web`.
2. Enable **Include source files outside of the Root Directory in the Build
   Step**. This is required: `web/` imports `../src/legal/**`, and without it
   the build fails with unresolved modules.

After that, `vercel deploy` from the repository root works unattended.

Recommended headers, once the project exists:

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
Permissions-Policy: geolocation=(self), camera=(), microphone=(), payment=()
```

## DNS, and what must not be broken

`mail.usewarsha.com` carries the Resend MX, SPF, and DKIM records that make
customer confirmation email work. **Nothing in this runbook touches it.**

Adding the web hosts needs records on `usewarsha.com`, `app`, and `admin` only.
Two rules:

- Never add or replace an `MX` record on the apex unless corporate mail on
  `@usewarsha.com` is being configured deliberately. A hosting provider's
  "point everything here" flow will happily do this.
- Never widen the apex `TXT` SPF record to include a web host. SPF authorises
  senders; a web server is not one.

## Environment

Everything targets `warsha-development`. The web client reads the same
publishable Supabase URL and key the mobile client ships. **No service role key
appears in web source**, and `scripts/web-platform.test.mts` fails the build if
one ever does.

## Tests

`npm run test:web-platform` — runs in `qa:validate`. It asserts the shared
corpus is imported rather than copied, no React Native import leaks in, no
service-role reference exists, focus is never suppressed, Arabic renders RTL,
the web palette equals the mobile tokens, the synthetic worker identity is never
revealed, and the public site claims no worker count, response time, or rating
it cannot support.

`npm run web:build` builds the site. It currently generates 41 static pages,
26 of which are legal documents rendered from the shared corpus.
