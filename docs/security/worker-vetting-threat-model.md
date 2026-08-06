# Worker vetting threat model

Authority: WPS-023. Subordinate to the Warsha Constitution and WPS-018.

> **No penetration testing was performed and none is claimed.** This is a design
> review against the implemented controls, written by the implementer. An
> independent assessment has not happened.

---

## Assets, in order of what their loss would cost

1. **Criminal-record certificates.** Special-category personal data about
   somebody's history. Disclosure is not recoverable.
2. **National ID images and numbers.** Identity-theft material.
3. **Worker home addresses.** Physical-safety material.
4. **Customer exact coordinates.** Physical-safety material.
5. **Staff review evidence.** Disclosure to the subject compromises future
   reviews and can endanger a reviewer.
6. **The activation decision itself.** An unvetted worker in a customer's home
   is the harm the whole system exists to prevent.

---

## T1 — Authentication bypass

*Reach an operational surface without a session.*

`AuthGate` renders nothing operational until the session and onboarding state
resolve. Every WPS-023 RPC opens with an `auth.uid() is null` check. Every
WPS-023 table is `authenticated`-only with owner-scoped RLS; `anon` holds no
grant on any of them.

**Found and fixed.** Fifteen WPS-022 functions were `anon`-executable through a
residual `PUBLIC` grant, including `staff_create_legal_hold`. `REVOKE ... FROM
anon` does not remove what `anon` inherits from `PUBLIC`. All fifteen closed;
the anonymous execute surface is now bounded to nine sanitized reads and the
bound is asserted as a property, not a list.

*Residual risk:* the nine allowlisted reads remain anon-callable by design. They
return only publicly discoverable data. A rate-limit review of them under
WPS-018 has not been performed.

---

## T2 — Role escalation by a client claiming to be a worker

`intended_role` is what an account **asked** to become. It is not an
authorization fact and no gate reads it. Worker privilege comes from
`worker_capability_active()`, which requires every gate plus a human activation.

`private.worker_transition()` is the sole writer of `worker_state` and no client
holds `EXECUTE`. Direct `UPDATE` on `account_onboarding` is refused — clients
hold `SELECT` only.

*Asserted:* selecting Worker grants no capability; a client cannot write its own
state; a client cannot call the state machine; a worker actor cannot transition
to `approved` or `active`.

---

## T3 — Onboarding-state bypass

*Skip the certificate, or jump to activation.*

`worker_transition_allowed` is an explicit edge list. A worker reaches
`criminal_record_submitted` only from `criminal_record_required` or
`correction_required`, and only staff put them in the former after an identity
review. There is no edge from `account_created` to `active` for any actor.

Activation additionally re-evaluates every gate at decision time and raises
`22023` if any is false — even for a reviewer holding `activate_worker`.

---

## T4 — IDOR and document-path guessing

Two independent checks on every document path: the RPC validates that the first
path segment is the caller's own uid, and the storage policy validates the same
thing. Metadata rows are owner-scoped by RLS.

Staff reach a document only through `staff_worker_document_reference`, which
requires the matching capability and writes a `staff_access_log` row **before**
returning a path.

*Residual risk:* a signed URL, once minted, is a bearer token for 300 seconds.
Anybody who obtains it within that window can read the document. Shorter windows
were considered; 300s is a judgement call, not a measured one.

---

## T5 — Public storage exposure

Certificate bucket: `public = false`, 8 MB limit, four-MIME allowlist. Read
requires ownership or `review_criminal_records` — **not** `private.is_staff()`.

*Asserted:* the bucket is not public; the read policy names the capability, not
`is_staff()`.

WPS-022's precedent is the reason this is checked explicitly: the `avatars`
bucket shipped `public = true` with no limits on day one and nobody noticed for
twenty-two work packages.

---

## T6 — Malicious upload

MIME allowlist and size bound at three layers: bucket configuration, RPC
validation, client validation. Path is safe-named (`{uid}/certificate-{ts}`).

*Not mitigated:* Warsha does not scan uploads for malware and does not
re-encode images. A malicious PDF reaching a reviewer's viewer is an accepted
risk. Reviewers open documents in the platform viewer, not a native handler.

---

## T7 — Duplicate or stolen document reuse

`content_hash` is recorded and indexed, and a collision across accounts is
surfaced to the reviewer as `duplicateSeen`.

It is deliberately **never auto-actioned**. Shared devices, re-scans and family
members produce legitimate collisions, and an automatic block would reject
honest workers while barely inconveniencing a determined attacker.

*Not mitigated:* somebody uploading another person's genuine documents is
detected only by human review comparing the document to the confirmed fields and
the profile. That is the intended control, and it is only as good as the
reviewer.

---

## T8 — Extraction manipulation

Currently unreachable — no provider is configured. The boundary is still written
to constrain one:

- Extraction cannot approve. `extractionMayApprove()` returns `false` and the
  activation gates are asserted to read no extraction and no confidence score.
- Candidates below the confidence floor are **withheld**, not shown greyed out.
  A wrong pre-filled identity number somebody taps past is worse than an empty
  field.
- Confidence never crosses a boundary — asserted on the client transform and on
  the server RPC, which returns no `confidence` key.
- The worker confirms every field, and the server validates format and internal
  consistency independently.
- Gender and sex markers cannot be produced; the field key does not exist.

---

## T9 — Forged certificate

**Not mitigated, and stated plainly.** Warsha has no Ministry integration, no
government API, and no way to confirm a certificate's authenticity.

The controls are: a reviewer looks at the document, records an
`authenticity_concern` flag and an assessment note, and can escalate to
`manual_review` or refuse. Q-08 in WPS-023 §18 asks whether an approved
verification method exists at all.

Nothing in the product claims authenticity has been confirmed.

---

## T10 — Staff account compromise or abuse

Capability follows decision weight; `reject_worker_application` and
`manage_vetting_policy` carry dual control and reauth. Every decision is audited
with actor, capability, entity and reason. Every document open is separately
access-logged.

The queue exposes an opaque `subjectRef` only — no name, email, phone or path —
so a compromised account cannot enumerate workers by browsing.

*Residual risk:* a compromised account holding `review_criminal_records` can
open certificates one at a time. Detection is the access log, which nothing
currently alerts on. A WPS-018 anomaly rule for high-volume certificate access
is an open operational gap.

---

## T11 — Adverse-decision abuse and self-review

An adverse decision without recorded evidence is refused (`22023`). Rejection
requires dual control.

Appeal independence is enforced in SQL:
`private.worker_appeal_reviewer_is_independent()` refuses an appeal decided by
anybody who made an adverse decision on that account. A runbook rule would have
been ignored on a busy queue; this raises `42501`.

No AI decides an appeal. No automatic permanent rejection follows from a
low-confidence extraction or an ambiguous record.

---

## T12 — Information leakage to the subject or to third parties

`worker_criminal_record_submissions` has **no offence column** — asserted
against `information_schema`. Offence text exists only in
`private.worker_criminal_record_review`, which no RPC returns and which the
subject cannot read.

Notification payloads are asserted to contain no offence, identifier or
filename. No WPS-023 table is published to Realtime. No sensitive vetting record
is export-included. The staff queue renders no identity field.

*Asserted:* the worker sees `latestSafeReason` and never the private evidence,
tested end-to-end in pgTAP against a real rejection.

---

## T13 — Cross-account leakage in the client

Generation-guarded context; state is never rendered for an account other than
the loaded one. A load failure fails closed rather than showing an empty state
that would read as "you have no application".

---

## T14 — Stale session and revoked role

Role and capability are re-fetched from the server on every account change and
on every mutation. `workerCapabilityActive` is computed, never cached
server-side. A revoked role takes effect on the next state fetch.

*Residual risk:* an in-flight operation started before revocation completes
against the server's check at execution time, which is correct, but the client
may briefly render a stale worker home. No data is exposed that the account did
not already hold.

---

## Open security work

1. No anomaly alerting on `staff_access_log` for high-volume certificate access.
2. No rate-limit review of the nine anonymous read RPCs.
3. No upload malware scanning or image re-encoding.
4. No independent penetration test.
5. Signed-URL lifetime (300s) is a judgement, not a measurement.
6. No automated detection of an account uploading another person's documents.
