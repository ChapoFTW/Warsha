# WPS-021 acceptance evidence

| Field | Value |
| --- | --- |
| Branch | `feat/wps-021`, rooted on `main` at `eb426c0` |
| Migration | `202608060001_wps021_growth_referrals_promotions.sql` (local only) |
| Hosted push | **NOT EXECUTED** |
| Manual alpha | 62 cases, **0 executed** |

---

## 1. What was executed

| Gate | Result |
| --- | --- |
| `supabase db reset` (full chain, 36 migrations) | PASS |
| `supabase test db` | **24 files / 2,308 assertions — `Result: PASS`** |
| WPS-021 pgTAP suite | 138 assertions |
| `npm run test:wps021` | See §5 |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS, 0 errors 0 warnings |
| `npm run check:mojibake` | PASS |
| `git diff --check` | Clean |
| `npm run audit:secrets` | Clean |
| `npm run audit:migrations` | Clean |
| `npm run audit:environment` | Clean |
| `npm run audit:appearance` | Clean |
| `npm run audit:bundle` | Clean |
| Expo Doctor | 18/18 |
| Android / iOS / Web export | PASS (cache cleared) |
| `npm run audit:bundle` (3 exports) | Clean, 57 artefacts |
| `supabase migration list --linked` | Read-only, executed |
| `supabase db push --linked --dry-run` | Read-only, no mutation |

### The hosted ledger has moved since WPS-020

WPS-020's notes recorded three local-only migrations pending
(`202608030001`, `202608040001`, `202608050001`). An executed
`supabase migration list --linked` now shows **all three applied remotely**. The
hosted project is current through `202608050001`.

The pending chain is therefore **one migration**, confirmed by the dry run:

```
202608060001_wps021_growth_referrals_promotions.sql
```

This corrects the WPS-020 statement rather than repeating it. No hosted mutation
was performed by this session.

## 2. Preservation

All 23 pre-existing pgTAP suites pass with **no assertion edited**. WPS-021
added one suite and changed none.

The following were extended and none was replaced:

- `private.create_booking_price_snapshot` (WPS-007) — called, not reimplemented
- `private.record_trust_fraud_signal` (WPS-016) — the only fraud sink
- `private.consume_dual_control` (WPS-018) — the only approval mechanism
- `private.enforce_rate_limit` (WPS-018) — the only limiter
- `private.record_operational_event` (WPS-018) — the only analytics sink
- `private.record_staff_audit` (WPS-017) — the only staff audit trail
- `private.prepare_notification` (WPS-014) — the only notification pipeline
- `private.staff_feature_flags` / `staff_kill_switches` (WPS-017) — the only release controls

No existing table, function, policy, or grant was dropped or weakened.

## 3. Constraints honoured rather than widened

Three allowlists on already-applied migrations had no room for a `growth`
member. Each was honoured rather than altered:

| Allowlist | Owner | WPS-021's choice |
| --- | --- | --- |
| `operational_log_category_check` | WPS-018 | Log under `marketplace` |
| `staff_capabilities_domain_check` | WPS-017 | Capabilities in the `marketplace` domain |
| `trust_fraud_signals_key_check` | WPS-016 | Map growth abuse onto the existing ten keys |

pgTAP asserts the WPS-016 vocabulary was not widened.

## 4. Defects found and fixed during implementation

Recorded because each was a real defect, not a test artefact:

1. **Promotion inflated worker gross.** Writing only `price_breakdown.discount`
   left the customer paying full price and pushed `provider_gross_minor` to
   105,000 on a 100,000 booking — Warsha funding a bonus rather than a discount.
   WPS-007 treats `final_price_egp` as the *customer-facing* total, so the
   redemption now reduces it as well. Caught by a pgTAP assertion on worker
   gross; now asserted permanently.
2. **Missing grants.** RLS policies were written without `grant select`, so the
   owner-scoped tables were unreadable. Fixed with `revoke all` followed by an
   explicit `select`-only grant, so the final privilege set is stated rather
   than inherited from Supabase defaults.
3. **`anon` held default grants** on every new public table. Revoked explicitly.
4. **Fraud signal keys and severities** did not exist in the WPS-016 vocabulary.
   Mapped rather than widened.
5. **A second dormant scaffold was missed by the first audit pass.**
   `public.wallets` (carrying `balance_egp`) and `public.wallet_transactions`
   exist from day one. The Phase 1 audit searched the client source rather than
   the schema and reported no wallet system. A pgTAP assertion failed with
   `have: 2` and was correct. Both tables are now retired in place.

## 5. What the numbers mean

`Result: PASS` on 2,308 assertions is evidence that the server enforces what it
claims. It is **not** evidence that:

- anybody read the referral screen and understood it;
- a screen reader announced the code usefully;
- the Arabic reads naturally to an Egyptian speaker;
- the offer banner is comprehensible at the moment of payment.

Those are the 62 manual cases, and all 62 are **NOT RUN**.

## 6. Deployment posture

Local: **accepted**. Production: **blocked**, unchanged — the WPS-018 launch
blockers stand, and WPS-021 removes none of them. Both growth features ship
**disabled**, so applying the migration to a hosted project changes no customer
behaviour until somebody deliberately enables a flag and approves a campaign
through dual control.
