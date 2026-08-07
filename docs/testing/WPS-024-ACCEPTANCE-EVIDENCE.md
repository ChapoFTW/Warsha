# WPS-024 — Acceptance evidence

Authority: WPS-024. Every figure below was executed **from the completed tree**
after the session interruption, not carried over from before it.

---

## Automated gates

| Gate | Result |
| --- | --- |
| Clean local reset (41 migrations) | **PASS** |
| `supabase test db` | **27 files / 2,902 assertions / `Result: PASS`** |
| WPS-024 pgTAP suite | **195 assertions** |
| Pre-existing pgTAP suites | **26 files / 2,707 assertions, none edited** |
| `npm run test:wps024` | **659 checks** |
| Custom regression suites | **23 of 24 pass** |
| `npm run typecheck` | PASS |
| `npm run lint` | **0 errors, 0 warnings** |
| `npm run check:mojibake` | "No likely mojibake found." |
| `git diff --check` | clean |
| `audit:secrets` | clean — 594 tracked files, 46 commits |
| Untracked-file credential sweep | clean — **59 files, 0 findings** (see below) |
| `audit:migrations` | clean — 41 migrations, forward-only |
| `audit:environment` | clean — 5 variables, 33 routes, 6 assets, **0 open notes** |
| `audit:appearance` | clean — 257 files, 73 roles in both themes |
| `audit:bundle` (web + android + ios) | clean — **76 artefacts across 3 exports** |
| Google credential sweep of all three bundles | clean — **217 files, 0 hits** |
| `npx expo-doctor` | **18/18** |
| Cache-cleared Android / iOS / Web exports | **PASS** |
| `supabase db push --linked --dry-run` | exactly **three** pending, `dryRun: true`, **no mutation** |

### Why the untracked sweep is listed separately

`audit:secrets` scans `git ls-files` — **tracked** files only. WPS-024 is
entirely uncommitted, so its 59 new files were outside that scan. They were
swept separately with the same credential shapes plus `"type":"service_account"`
and `"private_key":`, and produced no findings.

This is worth stating rather than quietly relying on: a reader seeing
"`audit:secrets` clean" against work that is 100% untracked would be reading a
guarantee that did not cover it.

### The one regression failure

`npm run test:wps018` fails on *"over-the-air updates are not enabled"*.

**Proven pre-existing.** `git stash push -u` produced the identical failure on a
clean tree, and the stash restored intact. The `"updates"` block in `app.json`
predates WPS-024, which modified neither that file nor that assertion.

### The bundle audit on Hermes — no longer firing, and why that is not reassuring

**All three exports are clean in this build**, Hermes bytecode included: the
`.hbc` artefacts are scanned, not skipped.

The finding that fired in the previous build has not been fixed — it has moved.
The guard literal is still packed contiguously in the Hermes string table:

```
sb_secret_allocateCallbackTitleFontSizeformat-color-marker-cancelAnima…   (Android)
sb_secret_allocateCallbackTitleFontSize\x2d0a9133e39524f138be6d4db9f48…   (iOS)
```

The discriminator requires a **digit** inside the identifier-class run
immediately following the guard. Previously the neighbouring literals were
`help-with-circle-slice-4` and an icon hash, which supplied one. This build's
code changes reshuffled the string table, the digit-bearing neighbours moved,
and the same benign adjacency no longer matches.

That is worth writing down plainly: **the gate went green for a reason
unrelated to security**, and it can go red again on any build that reorders
string literals. The analysis below is retained in full because it will be
needed again.

The original evidence, in order of strength:

1. **The web bundle of identical source is clean.** In plain JS the literal is
   visible with its quotes intact:

   ```js
   e.startsWith("sb_secret_")
   ```

   That is `@supabase/functions-js`'s own guard string, terminated, with no
   value after it.

2. **The matched Hermes run is concatenated identifiers**, not key material.
   As it stood in the build that fired:

   ```
   sb_secret_ allocateCallback TitleFontSize category_verification
   help-with-circle-slice-4 ebc824ed5df082492eceb0969893ab7
   ```

3. `sb_secret_` **appears nowhere in Warsha source** except in the audit
   script's own explanatory comments.

4. `.env` and `.env.local` contain **no secret shape**.

5. `audit:environment` passes with **0 open notes**, and it forbids a secret
   behind an `EXPO_PUBLIC_` name — which the audit script itself names as the
   primary control.

`scripts/audit-bundle.mjs` documents this failure mode in its own header:
Hermes packs string literals contiguously, so the library guard runs into the
next literal. Its discriminator is *"real key values carry at least one digit"*;
here the adjacent literals supply digits (`slice-4`, an icon hash) and the
discriminator fails.

**The script was not modified.** Entropy was measured as a candidate
replacement discriminator and rejected: concatenated identifier runs reach
4.73 bits/char while random base64url keys fall as low as 4.62, so any
threshold between them would produce false negatives on real keys. Weakening a
security control's recall to make a gate green is the wrong trade, and
rewriting another specification's control on the strength of a string-table
coincidence is the wrong scope.

---

## What the pgTAP suite establishes

**Corpus integrity** — twenty-six documents registered; exactly one published
version each; no document has two published versions; every hash is a
well-formed SHA-256; no two documents share a hash in either language; no
document has identical English and Arabic text; **the server SHA-256 matches
the digest the client suite pins**.

**Acceptance binds to exact words** — an acceptance of text the client did not
display is refused; a version that does not exist is refused; the English hash
is refused for an Arabic acceptance; the correct hash is accepted and records
the version, the language, the role and a recomputable acceptance hash.

**A decline is a decline** — recorded as `declined`, leaves the obligation
outstanding rather than resolving it, cannot be rewritten into an acceptance,
and the response always lists what keeps working.

**Immutability** — the words, the materiality and the effective date of a
published version cannot be changed; a version somebody accepted cannot be
deleted; `status` may move forward but a superseded version cannot be
republished; a material change with no summary is refused; a non-initial
version must say what it supersedes.

**Isolation** — one account cannot read another's acceptances; a client cannot
insert its own acceptance; no client role holds anything but `SELECT`; `anon`
cannot read the ledger at all.

**The signed-out surface did not widen** — no legal function is
anon-executable, asserted as a property over the whole schema.

**Provisional activation** — the system may grant a provisional capability from
a submission state and **cannot** reach `active`, `approved`, `rejected` or
`suspended`; a worker cannot activate themselves; an account that submitted
nothing activates nothing; a rejected or suspended worker is not re-activated;
staff may review, correct, suspend and reject after activation; no provisional
gate requires a staff decision; the legal gate is a provisional gate;
activation is refused while any gate is unmet and the refusal changes nothing.

**Registers** — no processing activity is legally approved; no retention rule is
enabled or approved; both providers are `approved_not_integrated`; no in-use
subprocessor handles identity data without a training prohibition; **training
on identity data raises `23514`**; human confirmation cannot be switched off.

**Leakage** — the governance overview cannot return who accepted or declined;
the public register reads no acceptance; no notification carries a document
identifier, a hash or an offence; no WPS-024 table is published to Realtime.

**Capability roles** — every provider fills a declared role; a role resolves to
a provider and an unknown role resolves to nothing; **a second live provider for
a singular role raises `23505`**; a provider that draws no map cannot claim a
renderer; neither capability surface names a vendor.

**Health** — no health table holds an account, a document, an extracted value or
a credential; samples are append-only against both `UPDATE` and `DELETE`; the
surface is not anon-executable; counters, the consecutive-failure reset and the
exclusion of Warsha's own refusals are all exercised rather than described;
recording health for an unregistered provider is silent.

**Posture** — every WPS-024 surface ships disabled; re-consent enforcement is
off, so this migration locks nobody out; nothing has been observed, because no
provider has been called.

---

## Provider activation

WPS-024 activates Expo Camera, Expo Image Picker, Expo Document Picker, private
Supabase Storage and the staff vetting UI, and implements Google Cloud Vision
and Google Maps Platform behind server-side Edge Functions.

| Provider | Role | Implemented | Enabled | Why not |
| --- | --- | --- | --- | --- |
| Supabase (database, auth, private storage) | `platform` | yes | **yes** | — |
| Expo EAS | `build_delivery` | yes | **yes** | — |
| Expo Image Picker | `document_capture` | yes | **yes** | — |
| Expo Document Picker | `document_capture` | yes | **yes** | — |
| Expo Camera | `document_capture` | yes | no | Flag off until the framing overlay is seen on a device |
| Staff vetting UI | — | yes | **yes** | — |
| Google Cloud Vision | `identity_ocr` | yes | no | **No credential supplied to this environment** |
| Google Maps Platform | `location` | yes | no | **No credential supplied to this environment** |

Read back from the database after the reset, not transcribed from the migration.
`private.external_providers` records both Google services as
`implemented_awaiting_credential`, and `private.provider_enabled()` returns
false for each. The register describes what is true, not what is built.

### The abstraction

Neither vendor's name reaches business logic. `capability_role` records what a
provider is *for*; `private.provider_for_role()` answers which one fills it; the
Edge Functions resolve that key against a provider registry and call an
interface.

| Assertion | Where |
| --- | --- |
| The extraction function names no OCR vendor | regression |
| The location proxy names no map vendor | regression |
| Neither the OCR contract nor the field parser names a vendor | regression |
| Neither capability RPC names a vendor | pgTAP, word-boundary matched |
| The address surface imports no mapping library | regression |
| A second live provider for a singular role is refused | pgTAP, raises `23505` |
| The server renderer key and the client registration agree | regression, across both runtimes |
| The registry seeds the same renderer key | pgTAP |

The five files permitted to name a vendor are
`google-vision-provider.ts`, `google-maps-provider.ts`, the two composition
roots, and `GoogleMapRenderer.tsx(.web.tsx)`.

### Provider health

Latency, timeouts, failures, retries, availability, last success and version,
per provider, staff-only at **Admin → Governance → External providers**.

Exercised rather than described: pgTAP records a success, two failures and a
later success against the database and asserts the counters, the consecutive-
failure reset, and that availability excludes Warsha's own refusals. Recording
health for an unregistered provider is silent, because health recording must
never be the thing that fails a worker's request.

`private.provider_health_samples` is empty and pgTAP asserts it. **No provider
has been called, so no health has been observed.**

### Credential verification

Executed against all three cache-cleared exports:

| Check | Result |
| --- | --- |
| `GOOGLE_CLOUD_VISION_SERVICE_ACCOUNT` in any bundle | **absent** |
| `GOOGLE_MAPS_SERVER_KEY` in any bundle | **absent** |
| Any `AIza…` Google API key in any bundle | **absent** |
| Any `private_key` shape in any bundle | **absent** |
| Server secret behind an `EXPO_PUBLIC_` name | **none** |
| Maps render key in `app.json` | build-time placeholder, not a value |

The Maps **render** key is publishable by necessity — the native SDK reads it
from the app manifest — and is restricted by package name and signing
fingerprint, scoped to rendering only. Places and Geocoding use a separate
server key held in Edge Function secrets and reached only through
`location-proxy`.

### End-to-end validation

| Path | State |
| --- | --- |
| Camera capture | Implemented; **not executed** — needs a dev-client build on a device |
| Image and document upload | Implemented; **not executed** on a device |
| OCR extraction / confirmation | Implemented; **not executed** — no credential |
| Places Autocomplete / geocoding | Implemented; **not executed** — no credential |
| Private Storage upload | Implemented; **not executed** on a device |
| Staff review workflow | Implemented; **not executed** — needs a seeded case |

**No end-to-end provider test has been run**, and none is claimed. Every path
above is covered by structural and behavioural assertions in the two suites;
none has been exercised against a live provider or a physical device.

### OCR accuracy baseline

**NOT MEASURED.** See
[WPS-024-OCR-ACCURACY-BASELINE](./WPS-024-OCR-ACCURACY-BASELINE.md).

Executed, and this is its complete output when run with no sample set:

```
No sample set was supplied. Pass `--samples <dir>` containing `manifest.json`
and the images, with a human-transcribed ground truth for each.

No figures are recorded, and none are estimated. …
No row was written to `private.ocr_accuracy_runs`. …
Parser version at the time of this attempt: `eg-nid/1`.
```

Exit code 0. **Absence** of a sample set is not a fault and should not hold a
pipeline red for months; **invalidity** — a forbidden sample source, a missing
image, a manifest of only clean photographs, a readable sample with no ground
truth — exits non-zero, because that would produce a misleading figure. Both
refuse to invent anything.

`private.ocr_accuracy_runs` is empty and pgTAP asserts it.

### A parser defect the behavioural tests found

The Arabic-name extractor matched across line boundaries because `\s` includes
a newline, so a card reading

```
البطاقة الشخصية
محمد أحمد إبراهيم
```

produced the legal name *"Personal ID Card Mohamed Ahmed Ibrahim"*. A worker
skimming a pre-filled form would very plausibly have accepted it — precisely
the confident-and-wrong outcome the accuracy baseline measures separately from
accuracy. Fixed to match within a line, and covered by a test.

---

## Registration authentication correction

WPS-024 also corrects the authentication method. **Phone numbers are required
contact information; phone OTP verification is not required to register.**
Customers and workers authenticate with email and password, email verification
remains required, and Supabase Phone Auth stays disabled.

This was a defect, not a relaxation. Three server-side rules independently
required `auth.users.phone_confirmed_at`, which only an SMS code from an
unconfigured provider can set:

| Rule | Effect before the correction |
| --- | --- |
| `activate_provider_role` | Raised `Verified phone required` — no worker could be activated |
| `verified_phone` activation gate | No worker could complete onboarding |
| `is_provider_publicly_discoverable` | **No approved worker could ever appear in search** |

The third is the one worth dwelling on: a worker who completed onboarding,
passed staff review and was approved would simply never have appeared, with
nothing in the verification record to explain why.

### Proven, against the live schema

Every assertion below runs with Phone Auth disabled — the state production
launches in.

| Claim | Evidence |
| --- | --- |
| Customer registration succeeds with Phone Auth disabled | pgTAP, contact number stored |
| Worker registration succeeds with Phone Auth disabled | pgTAP, worker profile created without an SMS code |
| Required phone validation still applies | pgTAP — a malformed number is dropped, never stored |
| No OTP is sent during registration | `signUp` body asserted free of any OTP call and of the capability preflight |
| The phone number is not treated as verified | pgTAP — `phone_confirmed_at` null, no auth phone identity written |
| Explicit OTP flows still fail closed | `assertPhoneAuthAvailable` retained on confirm/change only |
| Uniqueness preserved | pgTAP — two accounts cannot share a contact number (`23505`) |
| Required contact information is still required | pgTAP — an account with no number is refused (`22023`) |
| No authentication or RLS authority weakened | No policy removed, no grant added, no capability relaxed |

`verified_phone` was **renamed** to `phone_number_provided` rather than
redefined. A gate whose name claims verification, passing for an unverified
number, is a lie the next reader would believe.

### What the suite caught

Two failures that were the tests doing their job, not noise:

1. **Four pgTAP fixtures set `auth.users.phone` after insert**, so
   `public.profiles.phone` stayed null and discovery broke. The fix was not to
   edit the fixtures — it exposed a real divergence, because
   `updateUser({ phone })` also updates `auth.users` without syncing the profile.
   `private.account_contact_phone` now reads both stores, and is the single
   definition all three call sites use.
2. **`repository-alignment` asserted the old error verbatim.** The behaviour
   under test — an account with no number cannot become a worker — is preserved;
   the assertion now names the authority that actually enforces it.

### Not claimed

No SMS provider was configured. Supabase Phone Auth was not enabled. The confirm
and change flows remain **unavailable** in every environment, and that refusal is
the correct behaviour rather than an outstanding defect.

Reasoning, alternatives and the reversal path:
[phone-verification-deferral](../decisions/phone-verification-deferral.md).

---

## Manual acceptance

**Not claimed.** 96 cases, 0 executed. See
[WPS-024-MANUAL-GOVERNANCE-SUITE](./WPS-024-MANUAL-GOVERNANCE-SUITE.md).

No physical device was used. No physical-device acceptance is claimed for any
part of WPS-024. No legal review of any document is claimed.

---

## Defects found and fixed during recovery

| # | Defect | How it was caught |
| --- | --- | --- |
| 1 | **SHA-256 padded one block too many whenever `len ≡ 55 (mod 64)`** | A boundary case in the new suite. `"abc"`, a thousand `a`s and 25 of 26 documents hashed correctly; `version_history` did not |
| 2 | Corpus dated three days ahead, so **no version was ever effective** and every acceptance was refused | A pgTAP `lives_ok` that did not live |
| 3 | `legal_current_version` returned a composite, yielding an all-NULL row and a **phantom obligation nobody could satisfy** | Exposed by fixing #2 |
| 4 | The pgTAP suite ran as superuser, so **RLS isolation assertions passed by not being tested** | Two isolation assertions returning 3 instead of 0 |
| 5 | Three new `public` tables inherited TRUNCATE/REFERENCES/TRIGGER from Supabase default privileges | WPS-022's property assertion |
| 6 | Granting the register to `anon` widened WPS-023's closed signed-out surface | WPS-023's property assertion |
| 7 | `pg_catalog.nullif` — a SQL construct, not a function | Migration failure |
| 8 | A column check and a table check on `decline_reason` collide on the auto-generated name | Migration failure |
| 9 | `enforced_by = 'database'` not in the WPS-018 allowlist | Constraint violation |
| 10 | No `operational` data classification exists | Foreign-key violation |
| 11 | The copy module imported the localization hook, breaking the Node runner | `ERR_MODULE_NOT_FOUND` |
| 12 | A destructive-verb check tripped on a comment explaining default privileges | Its own suite |
| 13 | **`btoa(String.fromCharCode(...bytes))` would have thrown `RangeError` on every real photograph** | Reading the code while extracting the provider interface |
| 14 | **Three columns the extraction path writes did not exist**, so every successful extraction would have failed at the insert | Same |
| 15 | The extraction capability RPCs still named `google_cloud_vision` and `google_maps_platform` | The abstraction work itself |
| 16 | `pg_catalog.coalesce` — a SQL construct, not a function | Migration authoring |
| 17 | A vendor-name check matched `here` inside `where` | Its own pgTAP assertion failing |
| 18 | `capability_role` became `NOT NULL`, so a device-secret constraint test began raising `23502` instead of `23514` | WPS-024's own pgTAP |

Defects 13 and 14 deserve a note. Both would have broken extraction for 100% of
users, and neither was visible to a test that reads source text. A `RangeError`
from an argument-count overflow passes every small fixture; an insert naming
three columns that do not exist looks correct until a row is written. They were
found by reading the code closely enough to extract an interface from it, which
is an argument for the refactor beyond the abstraction it produced.

Defect 1 is the one worth dwelling on. Without a sweep across every input
length, a wrong hash would have shipped in the register, and the acceptance
chain would have been provably wrong for one document in twenty-six —
discovered only when somebody tried to prove what a person had agreed to.

---

## Deployment

Pending hosted chain — **three** migrations, confirmed by dry run:

```
202608090001_wps024_legal_compliance_governance.sql
202608100001_wps024_provider_activation.sql
202608110001_wps024_provider_abstraction_health.sql
```

`dryRun: true`, no mutation. Local and hosted are otherwise in sync at 38
applied migrations.

Documented, **not executed**:

```
npx.cmd supabase db push --linked
```

Applying it changes no user-visible behaviour until somebody deliberately
enables a flag: `legal_centre`, `legal_reconsent` and
`provisional_worker_activation` all ship `enabled = false, audience = 'none'`,
and `reconsent_enforced` is `false`.
