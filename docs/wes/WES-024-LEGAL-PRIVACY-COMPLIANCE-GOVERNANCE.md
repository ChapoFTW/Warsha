# WES-024 — Legal, Privacy, Compliance & Governance

| | |
| --- | --- |
| **Version** | 1.0 |
| **Status** | ENGINEERING BASELINE |
| **Implements** | WPS-024 |

---

## 1. What was built

One migration, one document corpus, four client modules, three screens, one
admin surface, two test suites.

| Artefact | Lines | Purpose |
| --- | ---: | --- |
| `supabase/migrations/202608090001_wps024_legal_compliance_governance.sql` | 1,940 | Registers, ledger, governance, provisional activation |
| `src/legal/legal-corpus-agreements.ts` | 1,080 | The four documents a person accepts |
| `src/legal/legal-corpus-conduct.ts` | 993 | Conduct and commerce, incorporated by reference |
| `src/legal/legal-corpus-registers.ts` | 1,061 | The three registers and the platform statements |
| `src/legal/legal-corpus-data.ts` | 818 | AI, OCR, location, processing, retention, cookies |
| `src/legal/legal-types.ts` | 221 | Contracts and pure materiality logic |
| `src/legal/legal-corpus.ts` | 221 | Assembly, hashing, audience filtering |
| `src/legal/legal-context.tsx` | 200 | Account-isolated state, fails closed |
| `src/legal/legal-copy.ts` | 186 | Interface strings, runtime-import-free |
| `src/legal/mock-legal-state.ts` | 181 | Mock, account-scoped, no network |
| `src/legal/legal-repository.ts` | 150 | Mock/Supabase isolation |
| `src/legal/legal-hash.ts` | 149 | SHA-256, portable across three runtimes |
| `src/legal/legal-staff-repository.ts` | 70 | Read-only governance |
| `src/legal/legal-translations.ts` | 31 | React binding for the copy |
| `app/legal/consent.tsx` | 233 | Re-consent and decline |
| `app/admin/legal.tsx` | 193 | Governance overview, counts only |
| `app/legal/document/[key].tsx` | 156 | Reader |
| `app/legal/index.tsx` | 139 | Legal centre |
| `supabase/tests/database/legal-compliance-governance.test.sql` | 596 | 116 assertions |
| `scripts/wps024-legal-compliance-governance.test.mts` | 720 | 451 checks |

---

## 2. The central design decision: where the text lives

**The text lives in the repository. The hash lives in the database.**

Thirty thousand words of legal prose inside a SQL migration would be
unreviewable, would diff uselessly, and would make correcting a comma a
database migration. So:

```
src/legal/legal-corpus-*.ts     the words
       │  sha256(canonicalText(...))
       ▼
public.legal_document_versions  content_hash_en / content_hash_ar
       │  compared on every acceptance
       ▼
public.legal_acceptances        rendered_hash + acceptance_hash
```

The client sends the hash of what **it** rendered. The server compares it with
the register. A client running a stale bundle cannot record an acceptance of a
version it never displayed, and that failure is loud rather than silent.

Three independent SHA-256 implementations have to agree for this to mean
anything — TypeScript in the app, Node in the test runner, Postgres in the
database. All three are pinned to the known digest of `"abc"` by test, in both
suites.

### 2.1 What the hash covers

Title, summary, headings, paragraphs and bullets — everything the reader sees.
Whitespace is normalised first, so reflowing a paragraph does not invalidate
every acceptance ever recorded. Words are not normalised: no case folding, no
punctuation stripping. **Changing a word changes the agreement, so it changes
the hash.**

Metadata is excluded. A version number changing is already recorded as a
version number changing; folding it into the hash would make every hash
trivially different and prove nothing about the words.

---

## 3. Materiality

`change_class` is a column, recorded at publication and immutable afterwards.
It decides whether a person is asked again.

| Class | Re-consent | May restrict on decline |
| --- | --- | --- |
| `initial` | yes | no |
| `editorial` | **no** | no |
| `non_material` | **no** | no |
| `material` | yes | yes |
| `urgent` | yes | yes |

Getting this wrong in either direction is a real failure. Not asking for a
change to identity processing is a consent failure. Asking for a fixed typo
trains everyone to tap past the ones that matter. So the publishing function
refuses a material change with no change summary, and the table refuses a
non-initial version that supersedes nothing.

---

## 4. Decline handling

`decision` is `accepted` or `declined`. There is no third value — nothing that
could be read as "probably agreed", and no timer that converts inaction into
consent. The regression suite asserts the absence of the machinery
(`set decision = 'accepted'`, `decision = case`, `interval '… days'`) rather
than the absence of words, because a policy note saying "we never do this"
would satisfy a search for the words.

`decline_legal_document` returns the consequences, and they come from the
class:

- `material` / `urgent` → the functionality the change is about;
- everything else → **an empty list**, because nothing may be restricted.

It also returns `alwaysAvailable`: records, export, support, appeals, account
closure. A screen that lists only losses is an argument, not a choice.

---

## 5. Provisional worker activation

This is the change with the largest blast radius, so it is worth being precise
about what it does and does not weaken.

**What is weakened.** A worker can take work before a human has looked at their
documents. That is a real reduction in assurance and a deliberate product
trade: making every honest worker wait days costs them income for no safety
benefit the review could not deliver a day later.

**What is not weakened.**

| Property | Before | After |
| --- | --- | --- |
| `system` can grant a capability | no | **yes** (`provisionally_active`) |
| `system` can reach `active` | no | no |
| `system` can reach `approved` | no | no |
| `system` can reach `rejected` / `suspended` | no | no |
| A worker can activate themselves | no | no |
| Activation requires gates | yes | yes (a smaller set) |
| Full activation requires a human | yes | yes |

The provisional gate set is built **by subtraction** from
`worker_activation_gates` — the full set minus the three that require a staff
decision, plus the WPS-024 legal gate. Writing a second list would mean a
future gate protecting full activation and silently not protecting provisional
activation, which is the more dangerous of the two.

Every WPS-023 state-machine assertion still passes **unedited**.

### 5.1 A note on a WPS-023 label

WPS-023 asserts `not worker_transition_allowed(null, 'active', 'system')` under
the label *"the system may only record account creation"*. The assertion is
still true. The label now under-describes the rule set, because WPS-024 adds
`system → provisionally_active`. This is a **documented supersession**, not a
silent one: WPS-024's suite asserts the new rule explicitly and re-asserts
every property the WPS-023 assertion was protecting. No WPS-023 assertion was
edited.

---

## 6. Integration with WPS-022 and WPS-023

**WPS-022.** `record_my_consent` and `privacy_consent_records` are untouched.
`accept_legal_document` moves the matching consent purpose to the accepted
version, so the privacy centre and the legal centre cannot disagree. The two
`document_key` values that pointed at documents which did not exist (`terms`,
`privacy`) now point at `customer_terms` and `privacy_policy`.

Both ledgers exist because they answer different questions. `privacy_consent_records`
answers *"did this person consent to this purpose"*; `legal_acceptances`
answers *"which exact text did this person agree to, in which language, and can
we prove it"*. A purpose outlives a dozen document versions; a version covers
several purposes.

**WPS-023.** `worker_activation_gates` is read, never restated.
`worker_capability_active` is amended in place rather than joined by a second
authorization answer. The activation kill switch governs both tiers.

---

## 7. Security posture

- Three new `public` tables, all RLS-enabled, all **select-only** for clients.
- `revoke all` before `grant select` on each. Supabase's default privileges
  hand new `public` tables everything including TRUNCATE, REFERENCES and
  TRIGGER; `grant select` is additive and would leave that in place. WPS-022's
  property assertion caught this.
- **Nothing is granted to `anon`.** The signed-out legal reader renders the
  bundled corpus and makes no call at all, so WPS-023's nine sanctioned
  signed-out reads stay nine.
- An acceptance is readable only by the person it is about. Staff reach counts
  through `staff_legal_governance_overview`, which cannot return an identity —
  asserted by searching its body for `user_id`, `email`, `phone`.
- `publish_legal_version` and `manage_subprocessors` carry dual control.
- No WPS-024 table is published to Realtime.

---

## 8. Honesty controls

The corpus is checked by test for claims Warsha has not earned:

- no certification or compliance finding;
- no claim that a penetration test was performed — and the **absence** is
  stated in the Incident Response and Security Disclosure policies rather than
  omitted;
- no WCAG conformance claim, at any level;
- no commission percentage or monetary amount, because
  `private.payment_configuration` ships with a null commission and a disabled
  gateway, and a figure in a binding document that no system enforces is worse
  than a mechanism that binds;
- no Ministry or government lookup;
- correct tense for OCR and Maps: *approved, not yet integrated*.

---

## 9. Known gaps

Each is disabled or reported honestly rather than half-built, and none is
claimed as working in any user-facing string.

1. **Google Cloud Vision is not integrated.** Registered as
   `approved_not_integrated`. Identity fields are entered by hand. Turning it
   on is a material change requiring three new document versions and renewed
   acceptance.
2. **Google Maps Platform is not integrated.** Registered as
   `approved_not_integrated`. Address search and device positioning report
   unavailable; manual pin placement is the working path.
3. **Expo Camera is selected but not installed.** WPS-024 records the decision;
   the dependency is absent and adding it needs a new dev-client build and
   device acceptance. `expo-image-picker`'s `launchCameraAsync` remains the
   capture path, so no document claims a framing overlay exists.
4. **No publish control in the admin surface.** `staff_publish_legal_version`
   is implemented, capability-checked, dual-control and covered by pgTAP. A
   button would produce a register row pointing at text that does not exist,
   because publishing means editing the corpus, recomputing the hash and
   shipping a migration.
5. **Re-consent enforcement ships off.** `reconsent_enforced = false`. Nobody
   has accepted a version that did not exist before this release, so enabling
   it without a migration path would block every account from booking and
   working at once.
6. **The reduced review copy is a policy commitment, not a pipeline.** The
   storage shape and the retention rule exist; nothing generates the reduced
   copy yet.
7. **No lawful basis is confirmed.** Every entry in the processing register is
   `pending`. This is a legal-review item, not an engineering one.

---

## 10. Corrections made during implementation

Recorded because each is a place where an assumption was wrong and the
resolution mattered.

| # | Finding | Resolution |
| --- | --- | --- |
| 1 | A column check and a table check on `decline_reason` collide on the auto-generated name | Folded into one named constraint |
| 2 | `enforced_by = 'database'` is not in the WPS-018 allowlist | `wps018_limiter` |
| 3 | No `operational` data classification exists | `aggregate_nonpersonal` / `operational_audit` |
| 4 | Three new `public` tables inherited TRUNCATE/REFERENCES/TRIGGER from default privileges | `revoke all` before `grant select` |
| 5 | Granting the register to `anon` broke WPS-023's signed-out property | Authenticated only; the signed-out reader uses the bundle |
| 6 | `pg_catalog.nullif` — `nullif` is a SQL construct, not a function | Unqualified |
| 7 | Corpus dated three days in the future, so no version was ever effective | Dated today |
| 8 | `legal_current_version` returned a composite, yielding one all-NULL row when nothing matched — inventing a phantom obligation nobody could satisfy | `returns setof` |
| 9 | **SHA-256 padded to `((len + 9) >> 6) + 1` blocks, which over-counts by one whenever `len ≡ 55 (mod 64)`** | `((len + 8) >> 6) + 1`; exhaustive 0–320 sweep added to the suite |
| 10 | The pgTAP suite ran as superuser, so RLS isolation assertions passed by not being tested | `set local role authenticated` |
| 11 | `legal-translations.ts` imported the localization hook, breaking the Node runner | Copy split into a runtime-import-free `legal-copy.ts` |
| 12 | A destructive-verb check tripped on a comment explaining that default privileges grant TRUNCATE | Read the comment-stripped SQL |

Finding 9 is the one worth dwelling on. `"abc"`, a thousand `a`s, and
twenty-five of the twenty-six documents all hashed correctly. Only
`version_history` landed on the boundary. Without a sweep across every input
length, a wrong hash would have shipped in the register — and the whole
acceptance chain would have been provably wrong for one document in twenty-six,
discovered only when somebody tried to prove what a person agreed to.
