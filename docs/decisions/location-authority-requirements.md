# Decision — What Warsha requires of a professional's location

| Field | Value |
| --- | --- |
| Date | 2026-09-11 |
| Status | **Traced from the implementation**, not designed |
| Question | "What is the minimum trustworthy location representation required for a Professional to become operational?" |
| Invariant | **Map rendering may degrade. Location integrity may not.** |

## The answer

**Coordinates are required to complete the professional address step, and the
server is where that is enforced.**

`confirm_my_service_address` refuses without them:

```sql
if p_latitude is null or p_longitude is null
   or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
  raise exception 'A confirmed map pin is required' using errcode = '22023';
```

It also refuses a `p_pin_source` that is not one of `device_location`,
`address_search` or `manual_pin`. So a coordinate must exist *and* must say
where it came from.

**Therefore geocoding failure is a recoverable block, not a degraded path.** A
professional whose location cannot be established does not get a reduced
account; they get an honest explanation and a way to try again. Nothing in the
product may invent a coordinate to get past it — a plausible-looking wrong
coordinate sends somebody to the wrong building, which `location-provider.ts`
already says in its own words and fails closed to avoid.

## What was traced, and what each layer actually requires

| Layer | Requires coordinates? | Evidence |
| --- | --- | --- |
| `addresses` table | **No** | `governorate text not null`; `latitude`/`longitude` nullable |
| `provider_service_areas` | **No** | same shape: governorate not null, coordinates nullable |
| `confirm_my_service_address` | **Yes** | raises `A confirmed map pin is required` |
| Discoverability | **No** | `is_provider_publicly_discoverable` checks `is_verified`, vetting `approved`, `is_published`, `onboarding_status = 'approved'`, `deleted_at is null` — location is not in it |
| Distance / ranking | Only to *have* a distance | `distance_km` is `null` when either side lacks coordinates; a null distance does not exclude the provider from the result set |

The schema tolerating nulls is not permission to write them here. It is wider
than this path because other rows reach those tables by other routes; the RPC is
the authority for this one.

## The consequence worth knowing

A provider without coordinates would still be *discoverable* — they would simply
have no distance, so they could not be ranked by proximity or returned by a
distance-filtered search. That is a meaningfully worse marketplace position, and
it is a second reason not to treat "no coordinates" as an acceptable steady
state for a professional rather than a temporary failure to recover from.

## What this decision does NOT restrict

The map. A rendered map is how somebody CHECKS a location; it is not how Warsha
knows one. The coordinates come from the geocoder or the device, `address_search`
is a first-class `pin_source` the server accepts, and a renderer that cannot
paint tiles is a missing picture rather than a missing answer. That path is
implemented, certified on a real device, and is a separate matter from this one:
see the mapless-confirmation work of the same date.

Map failure and geocoding failure are different failures and get different
screens:

| Situation | What the product does |
| --- | --- |
| Coordinates resolved, map cannot draw | map route withdraws, resolved address is shown and confirmed in words, onboarding continues |
| Coordinates resolved, reverse geocode found no name | `lookupFailed`: "Location obtained, but address lookup failed. Complete the address below." |
| Map and search both unavailable | `providerUnavailable`: "Map and address search are unavailable right now. You can still enter the address and try current location." |
| No coordinates obtainable at all | recoverable block — see above; not implemented as a degraded completion, deliberately |
