# WPS-024 — Decision log

Decisions taken during implementation, with the reasoning, so a future reader
can tell which were forced and which were chosen.

---

## D-01 — The text lives in the repository, the hash lives in the database

**Chosen.** `src/legal/legal-corpus-*.ts` holds the words;
`public.legal_document_versions` holds `content_hash_en` / `content_hash_ar`.

**Rejected:** storing the document bodies in the migration. Thirty thousand
words of legal prose in a SQL file is unreviewable, diffs uselessly, and makes
correcting a comma a database migration.

**Rejected:** storing bodies in the database and serving them to the reader.
That creates two copies of every document — the served one and the bundled one
— which can disagree. The hash would then bind a thing the reader might not
have seen.

**Cost accepted:** the corpus and the register can drift. Paid for by a test
that fails when they do.

---

## D-02 — SHA-256 implemented in TypeScript rather than taken from a platform API

**Forced.** The hash must be computable in three runtimes that share nothing:
the app, the Node test runner, and Postgres.

- `expo-crypto` is not installed, and adding a native module means a new
  dev-client build.
- `crypto.subtle` is async and absent on some React Native runtimes.
- `node:crypto` does not exist in the app.

A hundred lines of arithmetic that behave identically everywhere is cheaper
than any of those. All three implementations are pinned to the known digest of
`"abc"` by test, in both suites.

**Cost:** we own an implementation of a cryptographic primitive, which is
exactly the kind of thing that is subtly wrong. **It was.** See D-03.

---

## D-03 — Exhaustive length sweep in the regression suite

**Forced, by a defect.** The first implementation computed padded length as
`((len + 9) >> 6) + 1` blocks. That equals `ceil((len + 9) / 64)` except when
`len + 9` is an exact multiple of 64 — where it appends an extra empty block
and produces a wrong digest. That is `len ≡ 55 (mod 64)`: one input length in
sixty-four.

`"abc"` hashed correctly. A thousand `a`s hashed correctly. Twenty-five of the
twenty-six legal documents hashed correctly. `version_history` did not.

Without a sweep across every input length, a wrong hash would have shipped in
the register, and the acceptance chain would have been provably wrong for one
document in twenty-six — discovered only when somebody tried to prove what a
person had agreed to.

The suite now checks every length from 0 to 320 against `node:crypto`.

---

## D-04 — Four documents accepted, twenty-two incorporated by reference

**Chosen.** Customer: Customer Terms, Privacy Policy. Worker: Worker Terms,
Privacy Policy, Worker Verification Policy.

**Rejected:** requiring explicit acceptance of all twenty-six. Twelve
acceptance screens produce twelve unread documents, not twelve informed
decisions. Incorporation by reference is standard, honest, and stated plainly
in both agreements.

---

## D-05 — Twelve full Arabic texts, fourteen Arabic summaries

**Chosen, with a bright line:** text a person is asked to **agree** to is
published in full in both languages; text that **explains how a system works**
carries a complete Arabic summary with English named authoritative.

All four acceptance-required documents have full parallel Arabic.

**Rejected:** full Arabic for all twenty-six. Roughly thirty thousand words of
legal translation at a quality that would bind people. Machine-quality legal
Arabic could create obligations that differ from the English, which is worse
than a clearly-labelled summary.

**Rejected:** English only. Most Warsha users read Arabic, and an English-only
agreement is not meaningfully consented to.

**Disclosed:** `arabicIsSummary` is a corpus field, a database column, and a
line on the reader. Never a footnote. Full translation of the remaining
fourteen is a legal-review item.

---

## D-06 — Provisional activation amends the WPS-023 state machine

**Forced** by WPS-024's locked decision that a worker does not wait for staff.

**Chosen shape:** add `provisionally_active`, let `system` reach it from the
submission states, let staff review from it. Two capability tiers, computed
from two gate sets.

**Rejected:** a parallel "capability" field outside the state machine. That is
exactly the parallel system the specification forbids, and the worker's status
screen has to show *provisionally active* anyway.

**Property preserved and asserted:** `system` gains the ability to grant a
**capability** and gains no ability to make a **decision**. It still cannot
reach `active`, `approved`, `rejected` or `suspended`. Every WPS-023
state-machine assertion passes unedited.

**Documented supersession:** WPS-023 asserts
`not worker_transition_allowed(null,'active','system')` under the label *"the
system may only record account creation"*. The assertion remains true; the
label now under-describes the rule set. WPS-024's suite asserts the new rule
explicitly and re-asserts every property that assertion protected. **No WPS-023
assertion was edited.**

---

## D-07 — Provisional gates by subtraction, not by a second list

**Chosen.** `worker_provisional_gates` = `worker_activation_gates` minus the
three gates that require a staff decision, plus the WPS-024 legal gate.

**Rejected:** writing the provisional gate list out. A gate added to WPS-023
later would then protect full activation and silently not protect provisional
activation — the more dangerous of the two, since a provisionally active worker
is already in somebody's home.

---

## D-08 — Nothing granted to `anon`

**Chosen**, after the first draft granted `get_legal_document_register()` to
`anon` and WPS-023's property assertion failed.

A signed-out person can still read every document in full: the corpus is
bundled, so the reader renders it from the device with no call. What they do
not get is the register — version numbers, dates, hashes — which matters only
for deciding what somebody owes, and nobody owes anything without an account.

WPS-023 section 0 closed the signed-out surface after finding fifteen `public`
functions reachable through a residual `PUBLIC` grant. Reopening it to serve
data the client already has would have spent a real security property on
nothing. **The nine sanctioned signed-out reads stay nine.**

---

## D-09 — No number that has not been configured

**Chosen.** `private.payment_configuration` ships with a null commission and a
disabled gateway, so no document states a commission percentage, a cancellation
fee, a wasted-visit charge or a payout period.

The agreements bind the **mechanism**: the rate is displayed before you accept
a job, changing it is a material change, and it never applies retroactively.

A figure in a binding document that no system enforces is worse than a
mechanism that binds. Asserted:
`!/\b\d{1,2}\s?%\s*(commission|fee|of the)/i` over the whole corpus.

---

## D-10 — Every lawful basis recorded as pending

**Chosen.** All eleven processing activities are
`legal_review_status = 'pending'`.

**Rejected:** asserting settled bases. Egyptian data protection law and its
executive regulations continue to develop, and no advice has been obtained.
Asserting a characterisation would be a compliance claim dressed as a
description, and a reader could not tell the difference.

Asserted by pgTAP so the honest state cannot drift into a confident one.

---

## D-11 — OCR and Maps written in the correct tense

**Forced by honesty.** Both are approved; neither is integrated. Every document
says *approved, not yet in use*, names the governance that turns it on, and
states that switching it on is a material change requiring renewed acceptance.

A privacy document written in the present tense about processing that does not
happen is a false statement about personal data. That it would become true
later does not make it true now.

---

## D-12 — Training prohibition as a CHECK constraint

**Chosen.** `check (not (covers_identity_data and permitted_for_training))`.

**Rejected:** a policy note, a configuration flag, a code comment. Each can be
changed by one person in one sitting. A constraint requires a migration that
has to be written, reviewed and deployed — and that friction is precisely the
governance the AI Usage Policy promises.

---

## D-13 — Re-consent enforcement ships off

**Forced.** Nobody has accepted a version that did not exist before this
release. Enabling `reconsent_enforced` on deployment would block every existing
account from booking and working at once.

A kill switch (`legal_reconsent_gate`) exists for the case where a published
version turns out to be wrong and the gate must be lifted faster than a
corrected version can be published.

---

## D-14 — No publish control in the admin surface

**Chosen.** `staff_publish_legal_version` is implemented, capability-checked,
dual-control, and covered by pgTAP. No client calls it.

Publishing a version means editing the corpus, recomputing the hash, arguing
about the change class and shipping a migration. A button that skipped all of
that would produce a register row pointing at text that does not exist.

Recorded in WES-024 §9 as a deliberate gap rather than an unfinished one.

---

## D-15 — `legal_current_version` returns `setof`

**Forced, by a defect.** A composite-returning SQL function yields **one row of
NULLs** when nothing matches, not zero rows. Every `join lateral … on true`
downstream then produced a phantom obligation with a NULL version, which reads
as outstanding — so a document with no effective version would silently become
something every account owed and nobody could ever satisfy.

`setof` returns no rows, the inner lateral drops the document, and the absence
of a version means the absence of an obligation.

This was masked until D-16 exposed it: the obligation counts were *correct by
accident* while every version was ineffective.

---

## D-16 — Corpus dated today, not three days ahead

**Forced, by a defect.** The corpus was dated `2026-08-09` against a current
date of `2026-08-06`. `legal_current_version` filters
`effective_at <= current_date`, so **no version was ever effective**, and
`accept_legal_document` refused every acceptance with *"That version is not yet
effective"*.

The version-history document names its own date in hashed text, so correcting
the date changed that document's hash — which is the versioning system working
as intended.

---

## D-17 — Copy split into a runtime-import-free module

**Forced.** `legal-translations.ts` imported the localization hook via the `@/`
alias, which Node's `--experimental-strip-types` cannot resolve, making every
copy assertion unrunnable.

Split following the WPS-023 precedent (`onboarding-copy.ts` /
`onboarding-translations.ts`): strings and pure helpers in `legal-copy.ts` with
no runtime import; the React binding in `legal-translations.ts`.

---

## D-18 — pgTAP suite runs as `authenticated`

**Forced, by a defect.** The suite initially ran as a superuser after its
fixture block. RLS was bypassed, so the isolation assertions —
*one account cannot read another's acceptances*, *a client cannot insert its own
acceptance* — passed **by not being tested**, which is the worst way for a
security test to succeed.
