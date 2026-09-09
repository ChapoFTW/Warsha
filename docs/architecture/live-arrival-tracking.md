# Live arrival tracking — what already exists, and what has to be built

Status: **audit complete, nothing built.** This is the design note that has to
exist before any of it is written, because the instruction was to reuse sound
architecture rather than create a second authority for anything — and Warsha
already owns most of the pieces.

## What already exists and must be reused

| Piece | Where | State |
| --- | --- | --- |
| Job lifecycle with a travelling state | `src/job-operations/job-operation-types.ts` | **complete.** `confirmed → traveling → arrived → started`, with `waiting_for_customer` between. Tracking must derive from this and must not invent a parallel status. |
| One Google map renderer | `components/warsha/GoogleMapRenderer.tsx` (+ `.web.tsx`) | **complete.** `react-native-maps` with `PROVIDER_GOOGLE`, resolved through the registry in `src/providers/map-renderers.ts`. It is the only file that imports `react-native-maps` and that rule holds. |
| Server-side Maps boundary | `supabase/functions/location-proxy` | **partial.** Holds the privileged server key and serves `autocomplete`, `place_details`, `reverse_geocode`, `forward_geocode`. **No routing.** |
| Private coordinate tables with RLS | `private.worker_matching_locations`, `private.marketplace_request_locations` | **complete as precedent.** Coordinates are already treated as private data behind `private.` and reached only through functions. |
| Realtime subscriptions | bookings, chat, marketplace, disputes repositories | **complete as precedent.** There is an established channel pattern; live tracking should use it rather than a new transport. |
| Publishable-vs-server key split | `app.config.js` | **complete.** The bundle carries only render keys, restricted by package name and scoped to the Maps SDK. Anything billed per request goes through `location-proxy`. |

## What does not exist

1. **A live position record.** Nothing stores a professional's current position
   during a journey. `worker_matching_locations` is a matching input — a coarse
   service-area coordinate — not a live feed, and must not be repurposed: it has
   different lifetime, different precision and different access rules.
2. **Routing.** `location-proxy` has no Routes API operation, so there is no
   polyline, distance, or traffic-aware ETA anywhere in Warsha.
3. **Background location on the professional side.** No foreground service, no
   background permission, no journey start/stop.
4. **Any tracking UI**, customer or professional.

## Consequences that shape the design

**The route call belongs in `location-proxy`, not the app.** Routes API is
billed per request and needs a server key, and the bundle must never carry one.
That boundary already exists and already holds the key — adding a `route`
operation to it is an extension of an authority, not a new one.

**Refresh cadence is a cost decision, not a UI decision.** A naive
implementation calls Routes API on every GPS sample. At a 5-second sample rate a
single 20-minute journey is 240 billed requests. The recalculation triggers have
to be elapsed time, meaningful movement, route deviation and ETA staleness —
which means the design needs a deviation test before it needs a map.

**Access control is the hard gate and cannot be a UI concern.** A live
coordinate must be readable by exactly the assigned professional, the customer
on that exact active job, and authorised staff — and by nobody else at any
lifecycle stage. That is an RLS problem with cross-tenant tests, and it has to be
proven before a marker is ever drawn, because a marker that works is not
evidence that a competitor cannot read the same row.

**Server-side expiry is required.** A crashed client must not leave a position
that looks live forever. Staleness has to be a property the server can assert,
not something the customer's app decides by looking at a timestamp.

**API 24 is the floor and stays the floor.** Background location behaviour
differs sharply across Android versions, and the compatibility matrix already
proves API 24 and 25 in CI. Whatever execution model is chosen has to work there
and must not raise `minSdk`.

## Decisions taken

These were open questions in the first draft of this note. They are now
answered, by the owner, and the answers are constraints rather than preferences.

**1. No position before "on the way".** The customer does not see the
professional's precise location while a job is merely `confirmed`. Visibility
begins at `traveling` and the copy must not imply otherwise beforehand. This
follows the lifecycle rather than fighting it: `confirmed → traveling` is
already the moment the professional declares they are moving.

**2. Latest position only — no movement history.** One row per active journey,
overwritten in place. **Do not persist a breadcrumb trail of coordinates.** A
history has no stated product or safety purpose here, and an unused trail of
where a named person was, minute by minute, is a liability that grows every day
it is kept. The record stops and expires on `arrived`, `cancelled`, `completed`,
revocation and logout — and **server-side expiry is mandatory regardless**,
because a client that crashes must not leave a position that reads as live.

**3. The minimum permission model, determined rather than assumed.** See below.

## The Android permission model, and why it is the smaller one

The instruction was to establish whether a foreground service alone can
truthfully deliver locked-phone tracking **before** reaching for
`ACCESS_BACKGROUND_LOCATION`. It can. Warsha does not need that permission.

Android's rule is that an app is accessing location "in the background" *unless*
an activity is visible **or the app is running a foreground service that has
declared the `location` foreground service type*. A location-typed foreground
service is therefore not background access by definition, and the platform asks
only for `ACCESS_FINE_LOCATION` (or coarse) when one is launched.

So the permission set is:

| Permission | Why |
| --- | --- |
| `ACCESS_FINE_LOCATION` | the position itself, granted while-in-use |
| `FOREGROUND_SERVICE` | to run the journey service at all |
| `FOREGROUND_SERVICE_LOCATION` | required from Android 14; `targetSdk` is 36 |

And `ACCESS_BACKGROUND_LOCATION` is **not** requested. Expo's SDK 54
documentation draws the same line: `FOREGROUND_SERVICE_LOCATION` is "to be able
to access location while the app is open but backgrounded", whereas
`ACCESS_BACKGROUND_LOCATION` is "while the app is backgrounded **or closed**".
Warsha's case is the first: a journey the professional deliberately started,
running with a persistent notification, ending when they arrive.

**The one constraint this imposes.** A location foreground service cannot be
*started* from the background without `ACCESS_BACKGROUND_LOCATION`. Warsha's
service is always started by a foreground tap — "On my way" — so the ordinary
path is fine. The consequence is that a journey service killed by the system
cannot silently restart itself while the app is backgrounded. That must surface
as an honest "tracking stopped" state rather than a silent gap, which is the
same requirement as decision 7 below: never draw a professional who is still
moving when the data says otherwise.

### What must be proven on a device before any of this is claimed

The permission determination above is a reading of the platform rules, and a
reading is not evidence. None of the following has been run, and none of it may
be described as working until it has been — on real devices, with rendered
proof, at the API levels the compatibility matrix already covers.

| Case | Status | What would count as proof |
| --- | --- | --- |
| App in the foreground | UNTESTED | position updates while the map is visible |
| App backgrounded | UNTESTED | updates continue with the app off-screen, notification present |
| Screen locked | UNTESTED | updates continue through a lock, which is the whole point |
| Process interrupted / killed | UNTESTED | tracking stops honestly and says so; no silent gap, no phantom position |
| Foreground-service restrictions by Android version | UNTESTED | API 24, 25 (the current floor legs) and a 14+ device, where `FOREGROUND_SERVICE_LOCATION` becomes mandatory |
| Permission denied / revoked mid-journey | UNTESTED | the journey degrades honestly rather than appearing to continue |
| Battery optimisation / doze | UNTESTED | behaviour under aggressive OEM power management, which is where Egypt's common devices differ most |

The fifth row is the one most likely to embarrass a confident claim: Android
changed foreground-service rules at 8, 10, 12 and 14, and "it worked on the
emulator I had" has never been evidence about that spread.

**What this avoids.** `ACCESS_BACKGROUND_LOCATION` triggers a Play Console
background-location declaration, a recorded justification, and a review that can
block a release. Not needing it is worth more than the effort saved — it means
Warsha can state plainly that it collects the professional's location only while
a journey is running and visible in the notification shade.

`minSdk` stays 24. Nothing here raises it.

**Still required before this ships:** the privacy policy, in-app disclosure and
Play data-safety declarations change the moment any location is collected, even
while-in-use. That review is **pending, not done**, and is not recorded here as
approved.

## What routing will cost, measured before it is switched on

The instruction was to establish expected call volume and cost **before**
Production activation rather than discover it on a bill.

### Pricing provenance — read this before trusting the table

| | |
| --- | --- |
| **SKU** | `Routes: Compute Routes Pro` — 02F7-1B55-DC90 |
| **Retrieved** | 2026-09-09, from `developers.google.com/maps/billing-and-pricing/pricing` |
| **Rates used** | $10.00 / 1,000 (0–100k), $8.00 (100k–500k), $6.00 (500k–1M), $3.00 (1M–5M), $0.75 (5M+) |
| **Free cap** | 5,000 events per month |
| **Region** | Global list price, not the India list |

**These numbers are a snapshot with a date on it, not a standing fact.** Google
re-tiers this pricing periodically. Anyone reading this after 2026 should
re-retrieve the SKU rate before quoting the figures below; an old number that
has quietly become permanent truth is worse than no number.

**Why Pro rather than Essentials.** A live arrival ETA is only useful if it is
traffic-aware, and a request carrying `TRAFFIC_AWARE` or `TRAFFIC_AWARE_OPTIMAL`
falls in the Pro category — twice the Essentials rate. The first version of this
estimate used the Essentials rate and a single flat band; both were wrong, in
opposite directions, and the corrected table is below.

### The comparison

Assumptions: a 20-minute Cairo journey, a 5-second GPS sample rate, 30 days.
Volume banding and the free cap are applied.

| Jobs/day | Journeys/mo | Naive — one call per GPS sample | Triggered — 16 calls/journey | Ratio |
| --- | --- | --- | --- | --- |
| 100 | 3,000 | 720,000 calls — **$5,490/mo** | 48,000 calls — **$430/mo** | 12.8x |
| 1,000 | 30,000 | 7,200,000 calls — **$20,846/mo** | 480,000 calls — **$4,000/mo** | 5.2x |
| 5,000 | 150,000 | 36,000,000 calls — **$42,446/mo** | 2,400,000 calls — **$11,385/mo** | 3.7x |

The ratio narrows as volume grows, because the naive model buys its way into the
cheap high-volume bands — which is a trap worth naming. It means the naive
approach looks *less* catastrophic per call exactly when the absolute bill is
largest, and at 1,000 jobs a day the difference is still roughly $17,000 a
month, every month.

### What this decides

Route recalculation stays **event-, movement-, deviation- and time-triggered,
never tied to a GPS sample.** The triggered model recalculates on a 90-second
ceiling, on meaningful movement, on route deviation, and on ETA staleness, with
an allowance of two genuine reroutes per journey.

The deviation test therefore has to exist before the map does. This is not a
refinement to add after launch: at one call per sample, live tracking becomes
the most expensive thing Warsha operates, and its cost scales with journey
duration — so the worst bills arrive from the journeys that went worst.

A pathological journey, circling a district hunting for an address, costs more
than 16 calls. That is an argument for the elapsed-time trigger being a ceiling
rather than a target.

## Built: the refresh policy, and what simulating it corrected

`src/tracking/route-refresh-policy.ts` is the first code written for this, and
it is the deviation test the section above says has to exist before the map
does. It is pure arithmetic — no network, no device, no clock it was not handed
— so `scripts/route-refresh-policy.test.mts` can simulate journeys sample by
sample and count what the policy would actually spend.

That simulation immediately falsified three things in the first draft, which is
the entire argument for writing it before the map:

**The movement trigger was setting the bill, not the ceiling.** At 250m it fired
far more often than the ninety-second ceiling, and a twenty-minute journey spent
25 requests rather than 16. Raised to 500m it still dominated above average
traffic speed — 30 requests for a 16km run. It is now 1,200m, which is ninety
seconds at roughly twice Cairo's average speed: a safety valve for progress that
genuinely outruns the ceiling, not a second freshness rule. The parameter meant
to prevent runaway cost was causing it.

**The staleness rule fired on every GPS sample near arrival.** It triggered at
`now >= eta - 60s`, which is not staleness — an ETA a minute away is one about
to be right. It made the last minute of every journey twelve billed requests.
It now fires only once the promised arrival has actually passed.

**There was no floor.** A ceiling bounds how stale an ETA may get and says
nothing about how often a request may be made, so any misjudged threshold could
bill every five seconds. There is now a 20-second floor beneath every trigger
except "no route at all", where waiting would mean a blank map.

### Measured, not estimated

| Journey | Requests |
| --- | --- |
| 20 min, 6.7km (Cairo average) | ≤ 16 — the figure the cost table above assumes |
| 20 min, 1.5km (crawling) | ≤ 16, carried entirely by the ceiling |
| 20 min, 16km (fast) | ≤ 18 |
| 20 min, 25km (ring road) | ≤ 24, and the movement valve opens |
| 20 min with fifteen wrong turns | ≤ 20, allowance spent and then bounded |
| 20 min whose ETA is wrong all the way | ≤ 24 |

Against 240 for one request per GPS sample, in every row.

## Not started

Everything else: the position record and its RLS, the `route` operation in
`location-proxy`, the foreground service, and any UI. This note exists so the
next line of code is written against the architecture Warsha already has rather
than beside it.
