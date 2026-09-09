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
Production activation rather than discover it on a bill. Assumptions are stated
so they can be argued with: a 20-minute Cairo journey, a 5-second GPS sample
rate, and Routes API Compute Routes billed at the Essentials rate.

| | Calls per journey | 100 jobs/day | 1,000 jobs/day | 5,000 jobs/day |
| --- | --- | --- | --- | --- |
| One route call per GPS sample | 240 | $3,600/mo | $36,000/mo | $180,000/mo |
| Recalculated on triggers | 16 | $240/mo | $2,400/mo | $12,000/mo |

**A 93% reduction, and at realistic volume the difference between $2,400 and
$36,000 a month.** The triggered model recalculates on a 90-second ceiling, on
meaningful movement, on route deviation, and on ETA staleness — with an
allowance of two genuine reroutes per journey.

This is why the recalculation policy is not a refinement to add later. At one
call per sample, live tracking is the most expensive feature Warsha operates
and its cost scales with journey duration, so the worst bills come from the
journeys that went badly. The deviation test has to exist before the map does.

Two honest caveats: the per-call price must be re-checked against Google's
current published rate before activation rather than trusted from this table,
and the 16 calls assume a journey that mostly goes to plan. A pathological
journey — circling a district looking for an address — costs more, which is an
argument for the elapsed-time ceiling being a ceiling rather than a target.

## Not started

Everything below the audit. This note exists so the first line of code is
written against the architecture Warsha already has rather than beside it.
