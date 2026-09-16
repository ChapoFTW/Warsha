# Distance ranks privately and is never told

Status: **decided by the owner, implemented in
`202609160001_marketplace_reaches_professionals.sql`, proved locally by
`supabase/tests/database/marketplace-matching-anchor.test.sql`.** Production
state is not verified here; see [What is not verified](#what-is-not-verified).

This record began as a queue item — *"Null-distance reachability: prove
unreachable by design, or treat as defect"* — and the trace turned it into a
marketplace P0.

## The finding

### Discovery distance was always null

`provider_service_areas.latitude` and `.longitude` were never populated by any
product path. Every insert passed `null, null` or omitted the columns:

| migration | what it inserts |
| --- | --- |
| `202607200008_provider_foundation.sql:120` | columns omitted |
| `202607310001_repository_alignment.sql:510` | columns omitted |
| `202608010004_wps010…:505` | `…, null, null, area_radius` |
| `202608250006_catalogue_consumer_authority.sql:216` | `…, null, null, area_radius` |
| `202608260001_worker_trade_authority.sql:597` | `…, null, null, area_radius` |

Only `seed-discovery-fixture.sql` wrote them, *"so distance is testable"*.
Discovery measured against exactly those columns, so in the product
`distanceKm` was null for every Professional in every search.

### Matching invited nobody

The same emptiness was a much larger defect one layer down.
`private.worker_matching_locations` is WES-008's canonical matching anchor
(§5.2, *"Canonical matching locations"*). Its only writer was the WES-008
backfill, which copied the always-null service-area coordinates, so it held no
rows. Its reader was `private.create_marketplace_wave`, which built every
candidate pool with an **inner join** on it and then required
`distance_km <= allowed_radius`.

`202608250004_marketplace_request_readiness.sql` turned the marketplace on. From
then on, wherever that migration is applied, every Get Quotes and Emergency
request was matched against an empty pool and expired having invited nobody.
The matching suite never noticed because it inserted anchor rows by hand.

### The work-location step could not fix it, and failed for some people

The Professional's "Your work location" step (native
`app/onboarding/address.tsx`, web `web/components/worker-location.tsx`) confirmed
its pin with `confirm_my_service_address` — the address-book writer, which
touches no anchor. It also saved the address with `is_default = true`. A
Customer who already had a default Home hit `one_default_address_per_customer`
and could not complete the step. And they were rarely asked: both clients show
the step only while `current_address_provided` is false, and that gate passed on
*any* confirmed address, so a Customer who became a Professional skipped it.

### Rounding does not protect a location

The discovery card returned `distanceKm: round(p_distance_km)` beside the
comment *"A rounded scalar cannot be trilaterated back to a home address."* It
can. The query point was `p_filters.latitude/longitude`, chosen freely by the
caller. `round(d)` changes at a known radius, so probing along a line finds a
circle of known radius around the anchor, and three circles fix the point. A
maximum-distance filter is the same yes/no question. A distance *sort* is a
comparison oracle: it says which of two Professionals is nearer a point the
caller chose. So was the Customer's "Closest" quote sort, from a request address
the Customer chooses. None of this mattered while the value was null. Connecting
the anchor would have made each one a way to find where a Professional lives.

## The decision

Owner decisions, 2026-09-11 and 2026-09-16.

**Canonical rule**

| request | eligibility | proximity |
| --- | --- | --- |
| Planned (`get_quotes`, `browse_worker`, `rescue`, `comeback`) | the declared service area; **no radius cap** | private ranking only |
| Emergency (`flow_kind = 'emergency'`) | the declared service area **and** the emergency radius | private ranking within the eligible set |

- Proximity never expands eligibility beyond the declared service area.
- Distance is internal ranking data. No client receives an anchor coordinate, an
  exact distance, a rounded distance, a distance band, or a distance-ordered
  list.
- The anchor is where a Professional is based for work, established by the
  existing "Your work location" step. It is not a live position, a travel
  origin or a dispatch location, and nothing may call it one
  (`docs/architecture/live-arrival-tracking.md`).
- A personal default address is not the anchor authority. It is used only to
  infer anchors for Professionals who predate the writer, and recorded as
  inferred.

## What was built

**Anchor model.** `worker_matching_locations.address_id` names the confirmed
address the anchor mirrors. `source` is `verified_profile` (the Professional
confirmed it through the work-location step), `inferred_confirmed_address`
(backfill) or `operations` (reserved; no writer). Address-backed sources must
name their address. `verified_service_area` is retired with the columns it came
from.

**Writer.** `public.confirm_my_work_location` confirms the pin exactly as
`confirm_my_service_address` does and upserts the anchor in the same
transaction. It returns no coordinate. Both clients call it, and save the work
location with `is_default = false`. The address book keeps calling
`confirm_my_service_address`, which never moves the anchor.

**Lifecycle.** A trigger on `addresses` drives the anchor from its one address,
and only through the columns that mean location:

| change to the anchor's address | anchor |
| --- | --- |
| re-pinned (`confirm_my_service_address`) | follows, `verified` |
| pin unconfirmed or cleared | `stale` — kept, excluded from proximity |
| soft-deleted | deleted |
| hard-deleted | deleted (`on delete cascade`) |
| `is_default` changed, another address added or re-pinned | untouched |

Running the work-location step again moves the anchor to the new address.

**Gate.** `current_address_provided` now means a non-rejected anchor exists. The
key name is unchanged because both clients and staff vetting read it; the web
label reads "Confirm your work location". Deleting the work-location address
makes the step read as not done, so the worker journey returns to it.

**Backfill.** `private.infer_missing_matching_anchors()` gives every
non-deleted Professional with a confirmed address and no anchor one: an address
labelled `Work location`, else their default, else their most recently
confirmed. It reports a count per rule, never replaces an anchor, and is safe to
re-run. Its population is exactly the population the old gate passed, so no
Professional who had completed the step loses it.

**Matching.** The pool left-joins the anchor and requires a service area whose
governorate matches the request and whose district matches or is absent (an
area without a district covers its governorate). Only Emergency applies the
radius. Unknown proximity scores the neutral midpoint (0.5 × 0.27), so a
Professional without an anchor ranks between known-near and known-far rather
than last by accident of a NULL; it is recorded as `distanceBand: 'unknown'`.
Without an anchor, Emergency travel cannot be bounded, so Emergency is not
offered.

**Discovery.** `search_providers` computes no distance, refuses the `distance`
sort and `maximumDistanceKm` by name, and ignores caller coordinates.
`discovery_provider_card` lost its distance parameter and key.
`get_discovery_filters` no longer offers the sort. `get_customer_quotes` lost
"Closest"; "Fastest arrival" stays, because it orders by the arrival time each
Professional declared in their own quote. The native app lost the distance sort
and filter, the "km away" copy and Mock's invented distances; native and web
both lost "Closest".

**Privacy.** Anonymization deletes the anchor as its own logged step, before
addresses are soft-deleted. The export includes `matching_location` with its
source and state. `private.data_inventory` declares the table
(`account_private`, deleted on account deletion or anonymization, exported).
Deactivation keeps it, because deactivation is reversible and nothing matches a
deactivated account.

**Retired authority.** `provider_service_areas.latitude/longitude` carry a
`NOT VALID` check that refuses any new value. They are deprecated, not dropped:
dropping is irreversible, and there is no restore point to undo it with.

## Proof

`marketplace-matching-anchor.test.sql` drives every anchor through the product
writers — an RLS insert then `confirm_my_work_location` — and every request
through `create_marketplace_request`, which matches synchronously. It never
writes an anchor directly. It covers:

| | case |
| --- | --- |
| A | inside the area and near → eligible |
| B | inside the area, 38 km away → eligible for planned work |
| C | outside the area, near → excluded |
| D | no anchor → planned-eligible, `unknown`, ranked at the midpoint; not offered Emergency |
| E | Emergency, inside area and radius → eligible, dispatched |
| F | Emergency, inside area, outside radius → excluded |
| G | Emergency, inside radius, outside area → excluded |
| H | no client-callable function returns or reads anchor coordinates |
| I | no client-callable function touches distance or candidate scores |
| J | the work-location step creates a `verified_profile` anchor, not a default |
| K | re-pinning another address leaves the anchor alone |
| L | an existing Customer is shown the step and can complete it |
| M | re-running the step moves the anchor; re-pinning follows; unconfirming goes stale |
| N | changing the default leaves the anchor alone |
| O | deletion removes it and reopens the step; anonymization removes and logs it; export includes it |
| P | a planned request invites at least one eligible Professional |

Plus the backfill's three rules, its idempotence and its skip of deleted
profiles, and the provenance constraints.

Run against the previous `create_marketplace_wave`, cases B, C, D, E, G and
P's outside-area check fail. Writing the suite also found a defect in the first draft of the fix:
`coalesce(greatest(0, NULL), 0.5)` is `0`, because `GREATEST` ignores NULL, so
"neutral" was silently "last".

## What is not verified

- **Production.** Whether `202608250004` is applied there, how many requests
  expired with no invitation, how many Professionals have confirmed addresses,
  and what the backfill would infer are all unknown. None of it is inferred from
  repository history. Verification needs authorized Production access and
  should report aggregates only.
- **District names.** Eligibility compares governorate and district text. Both
  clients store the CAPMAS English names from the same dataset, but a
  Professional whose service area predates that dataset may carry a name no
  request will match. Worth a Production aggregate before rollout.
- **Liquidity.** The worker editors let a Professional declare one district.
  District-level eligibility is what they declared, and it may be narrower than
  they intend. That is a product question, not something matching should widen
  on its own.
