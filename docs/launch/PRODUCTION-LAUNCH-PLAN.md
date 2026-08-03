# Production Launch Plan

Authority: Warsha Constitution → WPS-018.
Status: **NOT SCHEDULED.** Production is NO-GO on 21 of 22 criteria.

Production launch follows a completed private beta. This plan exists so the
decisions are made in advance, calmly, rather than under launch pressure.

## Sequence

```
private beta (6 weeks)
   └─ review ─► fix what the beta found ─► public beta (city-wide, still cash)
        └─ review ─► online payments ─► payouts ─► production
```

Each arrow is a separate Go/No-Go. Nothing is bundled: activating online payments
and expanding coverage in the same week means an incident has two candidate
causes and no clean rollback.

## Phase gates

### Public beta

- Every private beta stop condition unhit for the final two weeks
- Success metrics met or the misses explained and accepted
- Terms, privacy policy, and worker terms published and legally reviewed
- Store builds accepted and available through public testing tracks
- Staging load tests executed at public-beta dataset sizes
- Support staffed for the larger cohort

Still off: online payments, payouts, push, call relay, Emergency, Rescue Mode.

### Online payments

- Provider selected, contracted, and recorded in
  `docs/decisions/payment-provider-selection.md` — currently **DEFERRED**
- Credentials issued and bound to the production environment only
- Webhook endpoint deployed, with signature, replay, environment, and amount
  verification exercised against real provider traffic
- Reconciliation run against real settlement data, with the exception queue
  worked by a named person
- Refund path exercised end to end with a real payment
- Chargeback liability accepted in writing
- Tax, invoicing, and receipts confirmed by an accountant

### Payouts

- Marketplace disbursement licensing established — currently **unresolved**
- Payout provider contracted and destination tokenization verified
- Worker identity and tax position confirmed by an accountant
- The six-hour release scheduler has somewhere to run
- A payout failure has been exercised and recovered on staging

### Production

Everything above, plus every production criterion in `GO-NO-GO-CRITERIA.md`.

## Web deployment

Undecided. The options, honestly compared:

| Option | For | Against |
| --- | --- | --- |
| Expo web on Vercel | Mature, easy previews, good headers and redirects | Another vendor, another set of credentials |
| EAS Hosting | One vendor with the build pipeline, worker support | Newer, less control over headers |
| Separate marketing site | Marketing can move without touching the app | Two deployments, two domains to keep consistent |
| Separate admin deployment | Removes admin code from the customer bundle | Duplicates session handling — rejected in the admin architecture for that reason |

Whatever is chosen must define, before launch:

- **Customer-facing vs admin-only.** The staff surface is served with
  `EXPO_PUBLIC_ADMIN_SURFACE` unset on any customer-facing deployment. Admin is
  **never** protected by an unguessable path; the server authorizes every action
  by capability regardless of where the page is served from.
- **Environment variables** per deployment, with no secret ever bundled.
- **Build command and output** directory.
- **Security headers**: HSTS, `X-Content-Type-Options`, `Referrer-Policy`,
  frame denial.
- **A content security policy** that permits only the Supabase project origin
  and forbids inline script.
- **Cache policy**: immutable for hashed assets, no-store for HTML.
- **Redirects** for the marketing paths.
- **Auth callback URLs** matching the Supabase project exactly.
- **Deep links**: universal and app links need a verified domain, which Warsha
  does not yet control. Until then only the `warsha://` scheme works, and that is
  a recorded blocker, not something to configure against an unverified domain.
- **Robots and indexing**: the customer site indexed, the staff surface never.
- **Privacy policy and terms URLs**, reachable and stable, because the stores
  require them.

## Communications

| Audience | When | What |
| --- | --- | --- |
| Beta participants | Before each phase | What is changing and what it means for them |
| Workers | Before payments change | Exactly how and when they get paid, in Egyptian Arabic |
| Customers | At each phase | What is new, plainly, with no claim Warsha cannot keep |
| Support | Before every deployment | The window and what to watch |

No launch communication claims a capability that is switched off. The motto is
**YOUR WORK, OUR MISSION / شغلك مهمتنا** and it is used as-is or not at all.

## Scale readiness

Before production, on staging with production-shaped data:

- Every surface within its budget at p95
- Marketplace matching measured at ten times the beta request rate
- Analytics dashboards measured at a year of data
- A reconciliation run measured at a month of settlements

Detail: `docs/testing/WPS-018-LOAD-TEST-PLAN.md`. **No load test has been
executed.**

## The rule that governs all of it

The Constitution says Warsha finishes work safely at a fair price. A launch that
outruns the team's ability to keep that promise is not a launch, it is a breach
of it with better marketing. Every gate above exists to keep the promise
truthful at the size we are actually operating.
