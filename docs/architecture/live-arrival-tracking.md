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

## Open questions that are product decisions, not engineering ones

- **Does the customer see the professional's position before "on the way"?** The
  lifecycle says `confirmed → traveling`, so the honest answer is no, and the
  copy must not imply otherwise while a job is merely confirmed.
- **Is a movement history retained at all?** A latest-position model is smaller,
  cheaper and much easier to defend. History needs a stated product or safety
  reason, and none has been given.
- **Privacy disclosure and Play data declarations** change the moment background
  location ships. That is a legal review, and it is recorded here as required
  rather than assumed done.

## Not started

Everything below the audit. This note exists so the first line of code is
written against the architecture Warsha already has rather than beside it.
