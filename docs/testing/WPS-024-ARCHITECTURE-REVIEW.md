# WPS-024 — Architecture review

A review of WPS-024 against the constraint that gives it its shape: **extend
the existing architecture, do not build beside it.**

---

## 1. Did WPS-024 create a parallel system?

The specification names fourteen systems that must not be duplicated. Checked
one at a time against what was built.

| System | Owner | What WPS-024 did |
| --- | --- | --- |
| Authentication | WPS-001, WPS-023 | Nothing. Reads `auth.uid()`. |
| Profile | WPS-001 | Nothing. |
| **Consent** | WPS-022 | **Extended.** `record_my_consent` untouched; `privacy_consent_purposes.document_key` now points at documents that exist. |
| Verification | WPS-023 | Reads `worker_activation_gates`. Never restates a gate. |
| Marketplace / booking | WPS-004, WPS-008 | Nothing. |
| Worker dashboard | WPS-003 | Nothing. |
| Document storage | WPS-023 | Nothing. Governs it; stores nothing new. |
| Trust | WPS-016 | Read through the gates. |
| Support | WPS-019 | Nothing. |
| Privacy | WPS-022 | Registered seven objects in `data_inventory`; added one retention rule. |
| Staff review | WPS-017 | Three capabilities in the existing table; `AdminShell`; `record_staff_audit`. **No queue row.** |
| Notification | WPS-014 | Four events in the existing catalogue. |
| Audit | WPS-017 | `record_staff_audit`. |
| Mock | All | Followed the pattern; account-scoped; no network. |

**Verdict: no parallel system.** The one place WPS-024 could reasonably have
built its own — a consent ledger — instead extends WPS-022 and explains in both
the code and the architecture doc why *two* ledgers exist and why neither
subsumes the other.

---

## 2. Is the second ledger justified?

This is the sharpest architectural question in WPS-024, so it deserves a direct
answer rather than an assertion.

`privacy_consent_records` answers *"did this person consent to this purpose"*.
`legal_acceptances` answers *"which exact text did this person agree to, in
which language, and can we prove it"*.

They cannot be one table because the cardinality is wrong in both directions: a
purpose (`marketing_communication`) outlives a dozen document versions, and a
document version (Privacy Policy 1.0) covers several purposes. Forcing them
together means either denormalising the purpose onto every version row or
losing the ability to say which text a person read.

They are kept in step by `accept_legal_document` moving the matching purpose
forward, so the privacy centre and the legal centre cannot disagree.

**Verdict: justified, and the coupling is explicit rather than implied.**

---

## 3. Did WPS-024 weaken anything?

One thing, deliberately: **a worker can take jobs before a human has reviewed
their documents.**

That is a locked product decision, not an engineering choice, and the trade is
stated plainly in WES-024 §5 rather than buried. The mitigations are real: the
profile does not describe an unreviewed worker as verified, suspension after
review is immediate, and every gate except the three staff-decision gates still
applies.

What was **not** weakened is the part that matters most, and it is asserted
rather than asserted-to:

- `system` gained the ability to grant a **capability**;
- `system` gained no ability to make a **decision**;
- a worker still cannot move themselves anywhere near either state;
- full activation still requires a human.

The provisional gate set is derived **by subtraction** from the full set, so a
gate added to WPS-023 in future protects both tiers automatically. A hand-written
second list would eventually protect full activation and silently not protect
provisional activation — which is the more dangerous of the two, since a
provisionally active worker is already in somebody's home.

---

## 4. Were other specifications' inventories respected?

WPS-023 established the discipline: when a change breaks another
specification's validated inventory, back out rather than edit its assertions.

WPS-024 hit this once. Granting `get_legal_document_register()` to `anon` broke
WPS-023's *"no function outside the sanctioned read surface is anon executable"*.

The resolution was **not** to widen WPS-023's allowlist. It was to notice that
the signed-out reader needs nothing from the server at all, make the function
authenticated-only, and keep the nine sanctioned reads at nine. The signed-out
experience is strictly better as a result — full document text, offline, no
round trip.

Two other inventories were touched additively and correctly:

- `staff_capabilities` — three rows added; `staff_queues` untouched, following
  WPS-023's precedent of not disturbing WPS-017's asserted queue count;
- `notification_event_catalog` — four rows added, no existing row changed.

**No assertion in any prior suite was edited. All 2,707 pre-existing assertions
pass.**

---

## 5. Is the layering sound?

```
  app/legal/*            screens          — render, never decide
  src/legal/legal-context — state          — account-isolated, fails closed
  src/legal/legal-repository — I/O         — Mock | Supabase, no fallback
  src/legal/legal-corpus  — the words      — hashed
  src/legal/legal-types   — pure logic     — import-free, testable
  ─────────────────────────────────────────
  Postgres                — every decision
```

`legal-types.ts` is import-free by design, following `onboarding-types.ts`, so
the regression suite exercises materiality and audience rules without a React
tree or a network. `legal-copy.ts` is runtime-import-free for the same reason,
following `onboarding-copy.ts`.

Nothing in the client decides whether an acceptance is valid. The client's job
is to say honestly which text it rendered; the server's job is to decide
whether that is the current published version.

**One deviation worth naming:** `legal-corpus.ts` is both data and logic, and
it is large. It is a reasonable place to split later — the corpus files are
already separate — but splitting the assembly from the hashing would put the
hash function further from the text it covers, which is the wrong direction for
the thing that has to stay in step.

---

## 6. Is the failure behaviour right?

| Failure | Behaviour | Right? |
| --- | --- | --- |
| Obligations call fails | `satisfied = false` | Yes — fails closed |
| Governance overview fails | Empty + "you cannot see this" | Yes — never "nothing is registered" |
| Rendered hash mismatch | Loud refusal | Yes |
| Provisional gate unmet | Silent no-op | Yes — this is an opportunistic promotion, not a request; raising would turn "your certificate was uploaded" into an error because a profile field was blank |
| No effective version | Document drops out of obligations | Yes — after the `setof` fix. Before it, a phantom NULL obligation appeared that nobody could satisfy |
| Account changes mid-load | Response discarded | Yes — generation guard |

---

## 7. What a reviewer should push back on

Stated so it is not left to be discovered.

1. **`legal-corpus.ts` will grow.** Twenty-six documents is manageable; sixty
   would not be. The audience/acceptance filtering should move to the database
   before the corpus doubles.
2. **The change class is a human judgement with no second check.** The system
   enforces the *consequences* of a class but cannot tell whether the class is
   right. Dual control on `publish_legal_version` is the mitigation and it is a
   process control, not a technical one.
3. **The reduced review copy is a commitment without a pipeline.** The policy
   says it exists; nothing generates it yet. Recorded in WES-024 §9.
4. **Fourteen Arabic summaries.** Defensible, disclosed, and a real gap.
5. **Every lawful basis is pending.** Correct today; it cannot stay pending
   through a production launch.

---

## Verdict

WPS-024 extends the existing architecture without duplicating it, states its
one deliberate weakening plainly, and preserves every prior specification's
validated behaviour without editing a single existing assertion.
