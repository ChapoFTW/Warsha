# WPS-015 Manual Alpha Plan — Production Payments, Payouts & Reconciliation

| Field | Value |
| --- | --- |
| Specification | WPS-015 v1.0 |
| Status | **NOT RUN** |
| Planned cases | 60 |
| Environment | Local Supabase + Expo development build |
| Prohibited | Real payments, real payouts, real refunds, live webhooks, hosted migration |

Every case below runs against a local database with `gateway_mode = 'disabled'`
or `'mock'`. No case authorizes live money movement. Physical-device acceptance
is **not** claimed by any automated evidence.

## A. Configuration and fail-closed behavior (WPS015-M01 – M10)

| ID | Case |
| --- | --- |
| WPS015-M01 | With no provider configured, the customer sees only cash and a clear explanation for online payment |
| WPS015-M02 | Capability projection reports `gatewayEnvironment: disabled` |
| WPS015-M03 | Setting a provider name without an activated account leaves the surface disabled |
| WPS015-M04 | Activating an account without a registered webhook secret leaves the gateway disabled |
| WPS015-M05 | Completing every requirement moves the surface to the configured mode |
| WPS015-M06 | Maintenance mode immediately hides online methods and shows the maintenance explanation |
| WPS015-M07 | Cash remains available while online is disabled |
| WPS015-M08 | Cash is hidden with the correct reason when the worker exceeds EGP 500 cash debt |
| WPS015-M09 | Exactly EGP 500 cash debt still permits cash |
| WPS015-M10 | Disabling a single method hides only that method |

## B. Mock mode isolation (WPS015-M11 – M17)

| ID | Case |
| --- | --- |
| WPS015-M11 | Mock mode labels online payment as development-only |
| WPS015-M12 | Mock mode never claims a licensed provider |
| WPS015-M13 | Mock performs no network call to any provider |
| WPS015-M14 | Mock customer and Mock worker accounts stay isolated |
| WPS015-M15 | Switching accounts clears the previous payment state |
| WPS015-M16 | Switching customer/worker mode clears mode-specific state |
| WPS015-M17 | A simulated failure never writes a paid state |

## C. Checkout lifecycle (WPS015-M18 – M28)

| ID | Case |
| --- | --- |
| WPS015-M18 | Preparing state is visible before the checkout opens |
| WPS015-M19 | Awaiting-customer state is distinct from processing |
| WPS015-M20 | Returning from checkout shows "confirming", not "paid" |
| WPS015-M21 | A success redirect alone never marks the payment paid |
| WPS015-M22 | Cancellation return shows the cancelled state and offers retry |
| WPS015-M23 | Failure return shows the failed state and offers retry |
| WPS015-M24 | An expired checkout resolves to expired deterministically |
| WPS015-M25 | Double-tapping pay does not open two checkouts |
| WPS015-M26 | Retry is blocked while an attempt is pending |
| WPS015-M27 | Retry after a terminal failure creates exactly one new attempt |
| WPS015-M28 | The requires-review state is shown without blaming the customer |

## D. Amounts, promotions and receipts (WPS015-M29 – M36)

| ID | Case |
| --- | --- |
| WPS015-M29 | The charged amount always equals the immutable snapshot |
| WPS015-M30 | Price components, promotion and total are shown before confirmation |
| WPS015-M31 | A Warsha-funded promotion reduces the customer total only |
| WPS015-M32 | Worker gross and commission are unchanged by a promotion |
| WPS015-M33 | Commission is exactly 10%, floored at the piastre boundary |
| WPS015-M34 | The receipt shows method, status, reference and refunded amount |
| WPS015-M35 | Amounts render correctly in EGP with Arabic digits in Arabic |
| WPS015-M36 | No amount is ever displayed from a floating-point conversion |

## E. Worker earnings and payouts (WPS015-M37 – M46)

| ID | Case |
| --- | --- |
| WPS015-M37 | The worker view answers only the seven permitted questions |
| WPS015-M38 | Available, pending and paid-out are clearly separated |
| WPS015-M39 | Six-hour eligibility is shown on pending earnings |
| WPS015-M40 | The UI states that automatic release is not running |
| WPS015-M41 | The EGP 200 minimum and zero fee are stated |
| WPS015-M42 | A payout destination shows only a masked value |
| WPS015-M43 | An untokenized destination fails closed with a clear message |
| WPS015-M44 | Withdrawals are unavailable with a clear explanation while disabled |
| WPS015-M45 | No bank-balance, wallet-balance or employment language appears |
| WPS015-M46 | A customer cannot see any worker payout data |

## F. Refunds, chargebacks and disputes (WPS015-M47 – M52)

| ID | Case |
| --- | --- |
| WPS015-M47 | Refund states render without an instant-refund promise |
| WPS015-M48 | A partial refund shows the correct cumulative amount |
| WPS015-M49 | A failed refund shows a review state, not a completed state |
| WPS015-M50 | A chargeback shows an under-review state and never blames the worker |
| WPS015-M51 | A WPS-013 dispute hold still blocks release |
| WPS015-M52 | No chargeback alters visible ranking or reputation |

## G. Localization, RTL and accessibility (WPS015-M53 – M60)

| ID | Case |
| --- | --- |
| WPS015-M53 | Every payment surface is complete in English |
| WPS015-M54 | Every payment surface is natural Egyptian Arabic |
| WPS015-M55 | RTL layout is correct on every payment surface |
| WPS015-M56 | Screen readers announce status, amount and actions |
| WPS015-M57 | Dynamic type does not truncate amounts or actions |
| WPS015-M58 | Touch targets meet the minimum size |
| WPS015-M59 | Status is distinguishable without relying on colour |
| WPS015-M60 | The active motto is exactly `YOUR WORK, OUR MISSION` / `شغلك مهمتنا` and is not misused in payment copy |

## Execution status

All 60 cases: **NOT RUN**.
