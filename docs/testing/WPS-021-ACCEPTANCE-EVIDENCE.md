# WPS-021 acceptance evidence

| Field | Value |
| --- | --- |
| Version | 1.1 — after the referral-model correction |
| Branch | `feat/wps-021`, rooted on `main` at `eb426c0` |
| Migration | `202608060001_wps021_growth_referrals_promotions.sql` (local only) |
| Hosted push | **NOT EXECUTED** |
| Manual alpha | 68 cases, **0 executed** |

---

## 1. The correction

Version 1.0 coupled referral rewards to a later admin campaign through an inert
entitlement. That put a human in the loop **per referral**: somebody whose
friend completed a real job held something labelled "earned" that paid nothing
until an unrelated administrative act.

Version 1.1 moves the human decision to where it belongs — approving the
**programme**, once, in advance — and grants rewards automatically thereafter.

| | v1.0 | v1.1 |
| --- | --- | --- |
| Human approves | Each campaign, then a link per reward | The programme, once |
| Qualification produces | An inert entitlement | An available, redeemable reward |
| Usable | After an unrelated admin act | Immediately |
| Coupling to campaigns | Required | None |

`referral_reward_entitlements`, `campaign_eligibility_grants`, and
`growth_campaigns.requires_grant` are gone; pgTAP asserts all three no longer
exist so the coupling cannot silently return.

## 2. Migration corrected **in place**

`202608060001` was confirmed absent from the remote ledger before any edit:

```
{"local":"202608060001","remote":"","time":"202608060001"}
```

It is local-only, unpushed, and uncommitted, so correcting it in place is the
smallest forward-safe change. **No remotely applied migration was edited.** The
hosted project is current through `202608050001`.

## 3. What was executed

| Gate | Result |
| --- | --- |
| `supabase db reset` (clean, full 36-migration chain) | **PASS** |
| `supabase test db` | **24 files / 2,329 assertions — `Result: PASS`** |
| WPS-021 pgTAP suite | **159 assertions** |
| `npm run test:wps021` | **363 checks** |
| Regression suites | **21 / 22** — see §5 |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS**, 0 errors 0 warnings |
| `npm run check:mojibake` | **PASS** |
| `git diff --check` | Clean |
| `npm run audit:secrets` | Clean — 512 tracked files, 43 commits |
| `npm run audit:migrations` | Clean — 36 migrations |
| `npm run audit:environment` | Clean — 5 vars, 25 routes, 6 assets, 0 notes |
| `npm run audit:appearance` | Clean — 225 files, 73 roles in both themes |
| `npm run audit:bundle` | Clean — 57 artefacts across 3 exports |
| Expo Doctor | **18/18** |
| Android / iOS / Web export | **PASS** (cache cleared); `referrals.html` and `admin/campaigns.html` present |
| `supabase migration list --linked` | Read-only — `202608060001` remote empty |
| `supabase db push --linked --dry-run` | Read-only — exactly one pending, no mutation |

## 4. The fixture defect that blocked the suite

The first execution of the rewritten suite failed at the booking `…0004` fixture
with `Booking action is not available` from `private.record_booking_status()`.

It was **not** a state-machine violation. `reset role` after the
programme-activation block restores the session role but **not** the JWT claims,
which `pg_temp.act_as` sets through `set_config(…, is_local := true)` —
transaction scope, not role scope. The actor was therefore still the staff
member who had just activated the referral programme, and
`record_booking_status` correctly refused a booking created on somebody else's
behalf.

Two functions raise that identical string, which is what makes it read like a
transition fault:

| Function | Errcode | Fires on |
| --- | --- | --- |
| `private.record_booking_status()` | `42501` | Actor is neither customer nor provider |
| `private.enforce_booking_transition()` | `22023` | Illegal status edge |

The correction was one `act_as` / `act_as_nobody` pair around the fixture,
matching the pattern the other six booking mutations already used. **No
authority was weakened.** `record_booking_status`, `enforce_booking_transition`,
the `job_started → completed` edge, every RLS policy, and every grant are
unchanged. The guard did its job; the fixture was wrong.

A WinNAT reservation over port `54322` had separately delayed execution; it was
cleared outside this session. For the record, the recovery sequence is:

```
net stop winnat
net start winnat
npx.cmd supabase start
npx.cmd supabase db reset
npx.cmd supabase test db
```

## 5. Preservation

All 23 pre-existing pgTAP suites pass with **no assertion edited**. WPS-021 adds
one suite and changes none. The only regression failure is `test:wps018`, on an
assertion that over-the-air updates are not enabled — pre-existing, and WPS-021
does not touch `app.json`.

The following were extended and none replaced: `create_booking_price_snapshot`
(WPS-007), `record_trust_fraud_signal` (WPS-016), `consume_dual_control` and
`enforce_rate_limit` and `record_operational_event` (WPS-018),
`record_staff_audit` and the flag and kill-switch tables (WPS-017),
`prepare_notification` (WPS-014). No existing table, function, policy, or grant
was dropped or weakened.

## 6. Constraints honoured rather than widened

| Allowlist | Owner | WPS-021's choice |
| --- | --- | --- |
| `operational_log_category_check` | WPS-018 | Log under `marketplace` |
| `staff_capabilities_domain_check` | WPS-017 | Capabilities in the `marketplace` domain |
| `trust_fraud_signals_key_check` | WPS-016 | Map growth abuse onto the existing ten keys |

## 7. Defects found and fixed

Each was a real defect, not a test artefact:

1. **Design defect: per-referral human approval.** Corrected as §1.
2. **Promotion inflated worker gross.** Writing only `price_breakdown.discount`
   left the customer paying full price and pushed `provider_gross_minor` to
   105,000 on a 100,000 booking — Warsha funding a bonus rather than a discount.
   WPS-007 treats `final_price_egp` as the customer-facing total, so redemption
   reduces it as well.
3. **Missing grants.** RLS policies without `grant select` made owner-scoped
   tables unreadable. Fixed with `revoke all` then an explicit `select`-only
   grant, so the privilege set is stated rather than inherited.
4. **`anon` held Supabase default grants** on every new table. Revoked.
5. **Fraud keys and severities** outside the WPS-016 vocabulary. Mapped, not
   widened.
6. **A second dormant scaffold missed by the first audit.** `public.wallets`
   (with `balance_egp`) and `public.wallet_transactions` exist from day one; the
   audit searched the client source rather than the schema. A pgTAP assertion
   failed with `have: 2` and was correct. Both retired in place.
7. **`pg_catalog.extract(day from …)` is a syntax error.** EXTRACT's grammar is
   special and valid only unqualified — the same defect WPS-014 hit on a hosted
   push. Replaced with `pg_catalog.date_part`.
8. **Mock lost the campaign percentage cap.** `StaffCampaign` dropped
   `maxDiscountMinor` during the rewrite, so Mock computed 10,000 where the
   server computes 5,000. Caught by the client suite; field and cap restored.

## 8. What the numbers mean

2,329 pgTAP assertions prove the server enforces what it claims — including that
qualification grants a reward with no staff action, that no per-referral
approval appears in the audit trail, that the two systems read none of each
other's state, and that worker gross is untouched. 363 client checks prove the
client's contracts hold and that the corrected model's absences really are
absent.

They do **not** prove:

- that anybody read the referral screen and understood it;
- that a screen reader announced the reward and its expiry usefully;
- that the Arabic reads naturally to an Egyptian speaker;
- that the benefit banner is comprehensible at the moment of payment.

Those are the 68 manual cases, and all 68 are **NOT RUN**.

## 9. Deployment posture

Local: **accepted**. Every automated gate passes from a clean reset of the
corrected tree.

Production: **blocked**, unchanged. The WPS-018 launch blockers stand and
WPS-021 removes none of them.

Both systems ship **disabled**, so applying this migration changes no customer
behaviour until somebody deliberately enables a flag and approves a programme or
campaign through dual control.
