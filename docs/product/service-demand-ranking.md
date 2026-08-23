# Service demand ranking

The order Warsha offers services in, where that order came from, and what has
to be true before it changes.

## The claim being made, and the one that is not

`service_categories.demand_rank` orders every customer-facing service chooser.
It is **a researched Egypt-specific prior**, not Warsha data. Warsha has no
meaningful request traffic, so there is nothing internal to rank by, and
inventing a popularity signal would be worse than saying so.

`demand_rank_source` carries `cold_start_research` and will carry `observed`
only when the transition below has actually happened. **Nothing in the product
may describe this order to a user as "most popular on Warsha".** Copy that
implies measured demand is a defect, not a wording preference.

This mirrors a promise already in the codebase: `get_search_suggestions` returns
*common* services — ranked by how many discoverable workers offer them, which is
a real fact — and its comment states that Warsha has no popularity data. That
promise still holds.

## What changed, and why it needed to

`sort_order` was curation order from the launch seed: effectively the order
somebody typed the categories in. That is fine for an admin table and wrong for
a customer choosing what to ask for. Two surfaces were worse than arbitrary:

- `get_search_suggestions` selected the top categories by `sort_order` and then
  re-aggregated them `order by entry->>'translationKey'` — alphabetically —
  discarding the ordering it had just computed and producing a different list in
  every language.
- `listProfessions()` sorted worker trades A-Z by localized label, so trade
  selection led with whatever began with A and differed between English and
  Arabic for no reason a worker could see.

`get_marketplace_catalog` also filtered to a hardcoded allowlist of the ten
launch categories, so any category added afterwards would have been invisible to
request creation and discovery while appearing everywhere else.

## Evidence (August 2026)

| Source | What it shows |
|---|---|
| FilKhedma, Egypt's largest home-services platform | Leads with A/C, then cleaning, plumbing, carpentry, electricity |
| YalaFix | Leads with plumbing, electrical, then cleaning, AC & appliances, painting, carpentry, general repairs |
| Egypt air-conditioner market | USD 1.12B (2024) → USD 1.65B (2030), 6.72% CAGR, against Cairo summers now exceeding 40°C |
| Cut Egypt | At-home barbering is an established Egyptian product — haircuts delivered to homes and offices |
| Blow and Glow, Toi to go | At-home women's hairdressing exists but is thinner than the salon trade |
| Style School Cairo | Personal styling is real but niche and event-driven (weddings, engagements, photo sessions) |

Two judgements worth stating plainly:

- **Plumbing leads rather than air conditioning.** Air conditioning has the
  single strongest claim — it leads FilKhedma and Egypt's climate evidence is
  unambiguous — but it is seasonal, where plumbing is urgent and year-round and
  sits top-three on both operators. A static annual rank should not encode
  August. Seasonal adjustment is a later refinement, not a cold-start decision.
- **The grooming services sit below every household trade.** They are a
  legitimate hyperlocal category and they are new. Neither is a reason to place
  them above the work Egyptian households actually call somebody out for.

Warsha has no Pest Control category; it exists only as a profession under
Cleaning, so there was nothing to rank.

## The order

| Rank | Category | |
|---|---|---|
| 1 | `plumbing` | |
| 2 | `electrical` | |
| 3 | `ac` | |
| 4 | `cleaning` | |
| 5 | `appliance-repair` | |
| 6 | `carpentry` | |
| 7 | `painting` | |
| 8 | `general-maintenance` | |
| 9 | `moving-help` | |
| 10 | `barber` | new |
| 11 | `hairdressing` | new |
| 12 | `satellite-tv-installation` | |
| 13 | `personal-styling` | new |

Ranks are unique among active categories, enforced by a partial unique index.
Ordering is `demand_rank, sort_order, id`, so an equally ranked pair still has a
stable curated order and `id` is the final tie-break. A category seeded by a
later build without a rank sorts after every ranked one and is never hidden.

`src/services/service-catalogue.ts` mirrors this for the clients, and
`scripts/service-catalogue.test.mts` asserts the two cannot drift.

## Taxonomy

Three top-level categories, not specializations. All ten existing categories are
household maintenance, so none can host personal services without distorting
what it means, and these are three different customer intents — barbering,
hairdressing, and fashion styling that involves no hair at all. Warsha has no
category-group authority and none was invented for this.

Terminology is chosen rather than translated. Arabic **كوافير** is the ordinary
Egyptian word, itself borrowed from *coiffeur*, and reads as hairdressing
without stating any restriction. French **Conseil en image** is the standard
term for personal styling; *styliste personnel* reads as a calque.

**There is no gender rule.** "Primarily women's hair services" is product
positioning. No gender eligibility, filter, matching input or authorization
exists for any service, and a regression test refuses to let one appear.

## Transition to observed demand

`public.marketplace_requests.category_id` already records the category of every
request, and the first-party reporting authority already aggregates counts per
category per window without exposing any customer. That is the source to use.

It is **staff-gated**, so it must never be called on a customer page load. The
transition is a periodic write, not a live query.

**Threshold.** Both must hold:

- a category has **≥ 200 valid customer requests in a trailing 90-day window**;
- **≥ 5 categories** clear that bar.

One category crossing alone is not a signal, it is a promotion campaign.

**Mechanism.** A staff-triggered job reads the trailing 90-day counts, writes
`observed_demand_rank`, and sets `demand_rank_source` to `observed`. Ordering
becomes `observed_demand_rank` first, with `demand_rank` as fallback for any
category below the bar and as the final tie-break. Rolling, not lifetime: a
lifetime count would freeze whatever was popular in Warsha's first months and
never let a growing category overtake it.

**What this is not.** Not a recommendation engine, not personalization, and not
per-request computation. Search results are unaffected in either regime —
relevance to the query outranks global popularity, and `search_providers` does
not consult `demand_rank` at all. Worker trade selection may use the order for
discoverability but never hides a less-asked-for trade.
