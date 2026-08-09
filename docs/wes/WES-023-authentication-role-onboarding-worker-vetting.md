# WES-023 — Authentication, Role-Based Onboarding & Worker Vetting

```
WES-023
Version: 1.0
Status: ENGINEERING BASELINE
Implements: WPS-023
```

Subordinate to the Warsha Constitution and to WPS-001 through WPS-023.

---

## 1. Migration

`supabase/migrations/202608080001_wps023_authentication_role_onboarding_worker_vetting.sql`
— 2,210 lines, forward-only, applies after `202608070001`.

### §0 Signed-out reachability repair

A `DO` block revokes `EXECUTE` from `PUBLIC` on every `public` function that is
currently anon-executable, is not in the nine-name allowlist, and already holds
an explicit `authenticated` grant of its own (checked via `aclexplode`, so a
function reaching `authenticated` only through `PUBLIC` is left alone rather
than broken).

Self-maintaining by construction: it targets what `anon` can actually reach, so
a future function that repeats WPS-022's mistake is caught by the same block on
the next apply — and by the pgTAP assertion that bounds the surface regardless.

Measured effect: 24 anon-executable functions → 9.

### §1–§16 summary

| § | Contents |
| --- | --- |
| 1 | `public.account_onboarding`, `public.worker_onboarding_events`, `private.worker_onboarding_evidence` |
| 2 | `public.addresses` extended: `building`, `floor`, `apartment`, `landmark`, `service_notes`, `pin_confirmed_at`, `pin_source` + three check constraints |
| 3 | `provider_verification_documents` extended: `capture_source`, `content_hash`, `quality_flags`, `page_side`; `private.worker_identity_extractions`; `provider_verification_identities` extended with `legal_name`, `date_of_birth`, `id_expiry_date`, `confirmed_at`, `confirmed_by`, `extraction_reviewed` |
| 4 | `worker-criminal-records` bucket, `public.worker_criminal_record_submissions`, `private.worker_criminal_record_review` |
| 5 | `private.worker_vetting_policies` + seeded `wps023-v1` (`pending`) |
| 6 | `private.worker_activation_gates`, `private.worker_capability_active` |
| 7 | `private.worker_transition_allowed`, `private.worker_transition`, immutability trigger |
| 8 | `select_my_account_role`, `get_my_onboarding_state`, `accept_my_worker_agreements` |
| 9 | `confirm_my_service_address` |
| 10 | `record_my_identity_capture`, `get_my_identity_candidates`, `confirm_my_identity_fields`, `submit_my_identity_for_review` |
| 11 | `submit_my_criminal_record` |
| 12 | `staff_worker_vetting_queue`, `staff_worker_vetting_decision`, `staff_worker_document_reference`, `staff_record_certificate_outcome` |
| 13 | `submit_my_vetting_appeal`, `worker_appeal_reviewer_is_independent`, `staff_decide_vetting_appeal` |
| 14 | `is_provider_publicly_discoverable` restated **unchanged**; `private.require_active_worker` |
| 15 | RLS, grants, storage policies, triggers |
| 16 | Capabilities, role mappings, notifications, flags, kill switches, grandfathering, WPS-022 registry entries |

### Constructs that cannot be schema-qualified

`exists`, `nullif`, `least`, `greatest`, `coalesce`, `current_date` are SQL
constructs, not functions. `pg_catalog.exists(...)` is a lookup error. `found`
is a PL/pgSQL variable. `right()` must be quoted when qualified:
`pg_catalog."right"(...)`. `digest()` lives in `extensions`, so hashing uses
`pg_catalog.sha256(pg_catalog.convert_to(...))`, which needs no extension.

### Registry shapes honoured, not invented

Five inserts were written against assumed column names and corrected against the
live schema: `data_classifications` (`label_en`/`label_ar`/`personal`, not
`display_name`/`sensitivity`), `data_inventory` (`schema_name`/`object_name`/
`object_kind`, with `deletion_treatment` from a five-value allowlist),
`storage_bucket_lifecycle`, `privacy_retention_rules`, and
`privacy_consent_purposes` (which is `public`, not `private`).

`privacy_retention_rules.retention_rule_key` is a real FK from
`storage_bucket_lifecycle`, so the rules insert had to be **ordered before** the
bucket insert.

`proposed_days` is `NOT NULL`. The column is named for what it holds — a
proposal, not an approved period. WPS-022 established the honest shape: a number
a lawyer can replace, an `authority` string stating there is no statutory basis,
`legal_review_status = 'pending'`, `enabled = false`. WPS-023 follows it exactly.

---

## 2. Three corrections where WPS-023 was reaching into another spec's inventory

Each surfaced as a failing assertion in an existing suite, and each was resolved
by backing out rather than by editing the assertion.

**`is_provider_publicly_discoverable`** — see WPS-023 §14. Fifty-two assertions
across nine suites. Predicate restored unchanged; gate moved to
`private.require_active_worker()` and to the activation path that sets
`is_published`.

**`public.staff_queues`** — WPS-017 asserts exactly eighteen queues. WPS-023 adds
**no row**. Reviewers reach their work through `staff_worker_vetting_queue`,
which is capability-checked and access-logged exactly like every WPS-017
surface, and which reuses WPS-017's capability model rather than its queue
table.

**`private.observability_retention_policy`** — WPS-018 asserts that no declared
log stream contains personal data. Vetting history, staff evidence and
certificate assessments are decision records about a named person, not logs.
Registering them there would have been true in the shape of the row and false in
the meaning of the table, forcing either a lie in `contains_personal_data` or
the loss of a WPS-018 invariant. They are registered in `private.data_inventory`
instead — the register WPS-022 built for exactly this.

---

## 3. Client modules

`src/onboarding/` — nine files.

| File | Role |
| --- | --- |
| `onboarding-types.ts` | Import-free contracts + pure functions: `routeFor`, `canUseCustomerMode`, `showsCustomerModeAction`, `isAwaitingReview`, `needsWorkerAction`, `canAppeal`, `isActionableGate`, `actionableGates`, `gateProgress`, `normalizeNationalId`, `isValidNationalId`, `maskNationalId`, `isValidCoordinate`, `isAcceptedDocument`, `captureWarnings` |
| `mock-onboarding-state.ts` | Account-scoped Mock. Type-only imports so it loads under `--experimental-strip-types` |
| `onboarding-repository.ts` | One method per RPC, Mock branch each. **No approve, activate or reject verb exists** |
| `onboarding-copy.ts` | 106 keys × EN / Egyptian Arabic |
| `onboarding-translations.ts` | `useOnboardingText()`; unknown gates fall back to a sentence, never a raw slug |
| `onboarding-context.tsx` | Generation-guarded provider; fails closed |
| `onboarding-staff-types.ts` | Separate module; `StaffVettingCase` carries `subjectRef` only |
| `onboarding-staff-repository.ts` | Read + decision RPCs; Mock returns an empty queue, never a fabricated case |
| `location-provider.ts` · `identity-extraction.ts` | Provider-neutral, fail-closed boundaries |

### Why Mock uses type-only imports

The regression suite runs modules under `node --experimental-strip-types`, which
requires explicit `.ts` extensions on runtime imports. The rest of the codebase
does not use them. A type-only import is erased, so `mock-onboarding-state.ts`
restates its blank state locally rather than importing `emptyOnboardingState` —
the same pattern `src/privacy/mock-privacy-state.ts` uses.

### Mock parity

Mock enforces the same rules the server does, because a Mock that is easier to
satisfy than production teaches the wrong thing to everyone who demos against
it. It refuses to activate a worker with outstanding gates, refuses a
certificate before the identity review asks for one, refuses a malformed
identifier, refuses an out-of-range coordinate and an unknown pin source,
requires both document sides, and returns only the last four digits.

Mock makes no Supabase call and is never a fallback after a Supabase failure —
both asserted structurally.

---

## 4. Screens and routing

| Route | Purpose |
| --- | --- |
| `app/welcome.tsx` | Signed-out gateway |
| `app/sign-in.tsx` | Customer email/password or worker phone/password through the trusted identity broker |
| `app/create-account.tsx` | Role question, then registration |
| `app/legal/[topic].tsx` | Static Help / Privacy / Terms, no network |
| `app/onboarding/address.tsx` | Customer address + pin confirmation |
| `app/onboarding/worker.tsx` | Worker application hub and pending home |
| `app/onboarding/identity.tsx` | ID capture, one side at a time |
| `app/onboarding/certificate.tsx` | Model A certificate submission |
| `app/worker-home.tsx` | Active worker default home |
| `app/admin/vetting.tsx` | Staff queue, read-only |
| `components/warsha/AuthGate.tsx` | Authentication-first entry |

`AuthGate` replaces rather than pushes, so there is no back door into a
protected screen. It leaves every route other than entry alone: it decides
entry, not navigation.

`app/admin/vetting.tsx` carries **no decision control**. Recording an adverse
decision needs a reason, evidence, a fresh session and — for a rejection — a
second person; a half-built control that lets somebody start that without
finishing it is worse than no control. The RPCs exist and are tested; the
surface is read-only until the decision UI has been designed against the
runbooks. Recorded as a gap in §9.

---

## 5. Test evidence

**pgTAP** — `supabase/tests/database/authentication-role-onboarding-vetting.test.sql`,
870 lines, **160 assertions**. Total: **26 files / 2,707 assertions / `Result: PASS`**
from a clean reset of the 38-migration chain. All 25 pre-existing suites pass
with **no assertion edited**.

**Client** — `scripts/wps023-authentication-onboarding-vetting.test.mts`,
**521 checks**, `npm run test:wps023`.

### Two checks that were testing prose, and were corrected

Four structural checks initially failed because the module's own explanatory
comment satisfied the check for the thing it was explaining. All four now run
through `codeOf()`, which strips comments first.

The fifth is worth recording separately. `!/automatic(ally)? reject/i` against
the migration failed — because the seeded policy `notes` say *"No automatic
rejection rule is implemented"*, and that sentence satisfied the check for the
thing it described. **A string asserting an absence is not evidence of that
absence, exactly as a comment is not.**

It was replaced with checks for the machinery such a rule would need: no
`interval '<n> month'` arithmetic anywhere in the vetting path, no comparison
deriving an outcome from how recent a document is, and a positive assertion that
every write of `'rejected'` sits inside a function that opens with
`require_staff_capability` and refuses without recorded evidence.

---

## 6. Security posture

| Threat | Control |
| --- | --- |
| Signed-out route access | `AuthGate` + RLS + `auth.uid()` checks in every RPC |
| Signed-out RPC reach | §0 PUBLIC revoke; bounded to nine allowlisted reads, asserted |
| Client-forged worker role | `intended_role` is not an authorization fact; gates never read it |
| Onboarding-state bypass | `worker_transition` is the sole writer; no client grant |
| Direct RPC escalation | `require_staff_capability` per decision weight |
| IDOR on documents | Path ownership checked in the RPC **and** the storage policy |
| Signed-URL leakage | 300-second expiry, issued only after an audited authorization call |
| Public storage exposure | Certificate bucket private; `review_criminal_records` required |
| MIME / size spoofing | Bucket allowlist, RPC validation, client validation |
| Duplicate document reuse | `content_hash` recorded for a reviewer, never auto-actioned |
| OCR manipulation | Extraction cannot approve; worker confirms; server validates format |
| Adverse-decision abuse | Evidence required; dual control on rejection; audited |
| Appeal self-review | `worker_appeal_reviewer_is_independent` enforced in SQL |
| Stale session / revoked role | Server-authoritative refresh; generation guard discards late responses |
| Cross-account leakage | Owner-scoped RLS; context never renders another account's state |
| Privacy-export exposure | No sensitive vetting record is export-included |
| Logging leakage | No offence, identifier or filename in any notification or log |

**No penetration testing was performed and none is claimed.**

---

## 7. Accessibility

Accessible headings on every screen; role choice is a `radiogroup` of `radio`
elements with selected state; the certificate acknowledgement is a `checkbox`;
progress is announced through `accessibilityRole="progressbar"` with min/max/now;
capture results are announced; state is carried by badge **labels**, not colour
alone; touch targets are ≥ 44pt; **no typed confirmation phrase anywhere** — a
typed phrase is inaccessible to screen-reader and switch users and is not
stronger than a deliberate tap.

Manual accessibility acceptance is **not** claimed.

---

## 8. Localization

106 copy keys, English and Egyptian Arabic, asserted at exact key parity with no
untranslated duplicates. The certificate is called الفيش والتشبيه, the name
people actually use.

Two prohibitions are asserted in both languages: no string claims Warsha obtains
the certificate or has government access, and no string promises a review
turnaround.

RTL reverses reading order only. The logo is never mirrored — asserted across
all ten screens and the gate.

---

## 9. Known gaps

1. **No live camera framing overlay.** `expo-image-picker` captures; guidance is
   text and a static frame. A live overlay needs `expo-camera`, a new dev-client
   build and device acceptance.
2. **No map or geocoding provider.** Device location and address search are
   reported unavailable; manual pin is the working path.
3. **No extraction provider.** Candidates come only from manual entry today.
4. **No staff decision UI.** The queue is read-only; the decision RPCs are
   implemented, granted, capability-checked and tested, but unreachable from the
   admin surface.
5. **No certificate file upload wired to storage.** `submit_my_criminal_record`
   records metadata and a path; the binary upload to `worker-criminal-records`
   is not yet performed by the client.
6. **Quality heuristics are dimension-only.** `sharpness` and `brightestFraction`
   are accepted by `captureWarnings` but nothing computes them.

All six are disabled or reported honestly rather than half-built, and none is
claimed as working in any user-facing string.

---

## 10. Deployment

Pending hosted chain: **one** migration — `202608080001`. Local and hosted are
otherwise in sync at 37 applied migrations.

Documented, unexecuted: `npx.cmd supabase db push --linked`

Applying it changes no user-visible behaviour until somebody deliberately
enables a flag: all four WPS-023 flags ship `enabled = false, audience = 'none'`.
