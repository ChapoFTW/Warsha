# Worker vetting architecture

Authority: WPS-023. Subordinate to the Warsha Constitution, WPS-006, WPS-010,
WPS-016, WPS-017 and WPS-022.

> No part of this document claims legal compliance or legal approval. The
> eligibility policy it describes carries `legal_review_status = 'pending'`.

---

## What existed before

`public.activate_provider_role(text)` required a verified phone number and a
display name between two and a hundred characters. That was the entire check
standing between an account and a worker profile.

WPS-006 then added a real verification workflow — `provider_verifications`,
`provider_verification_documents`, a staff-only status transition trigger, a
private `verification-documents` bucket, and identity storage as hash plus last
four. That workflow is good and WPS-023 keeps all of it.

What it did not have was a **lifecycle**. Verification status was a column that
staff could move; there was no record of who moved it, why, from what, or what
evidence they had. There was no criminal-record requirement at all. And there
was no single answer to "may this account act as a worker?" — it was inferred
from a scatter of booleans (`is_verified`, `is_published`, `onboarding_status`)
that different code paths read differently.

---

## The four layers WPS-023 adds

### 1. Gates — *is the evidence there?*

`private.worker_activation_gates(uuid) → jsonb`

Twenty-four named booleans covering identity, documents, profile completeness,
agreements, trust state and account state. **Fail-closed by construction**: a
gate that is missing evaluates to `false`, so an incomplete account is never
accidentally activated by a gate nobody remembered to write.

It reads WPS-016 trust state rather than restating it. A worker who is
`suspended` or `under_investigation` there, or whose profile is hidden or removed
from the marketplace, does not pass here regardless of how their onboarding
looks.

It reads **no extraction candidate and no confidence score** — asserted directly
against the function body.

### 2. Lifecycle — *where are they?*

Fifteen states, one writer. `private.worker_transition()` holds a row lock, is
idempotent, validates the edge against `worker_transition_allowed(from, to,
actor_kind)`, and appends an immutable event.

No client holds `EXECUTE` on it. The client-facing RPCs
(`submit_my_identity_for_review`, `submit_my_criminal_record`,
`submit_my_vetting_appeal`) call it internally after checking their own
preconditions.

The actor split is the load-bearing part:

| Actor | May reach |
| --- | --- |
| `worker` | submission and resubmission states, and `appeal_pending` from `rejected` |
| `staff` | every review, adverse, approval and activation state |
| `system` | `account_created`, and nothing else |

A worker cannot transition themselves to `approved` or `active`. The system
cannot either. Asserted both as SQL predicate tests and as a structural check
that no `p_actor_kind = 'worker'` branch reaches `'active'`.

### 3. Capability — *may they act?*

`private.worker_capability_active(uuid) → boolean`

```
every gate passes  AND  worker_state = 'active'
```

Both halves. Passing the gates is necessary but not sufficient — a human still
has to activate the account. This is the single answer the rest of the system
asks for, through `private.require_active_worker()`.

### 4. Enforcement — *where is it checked?*

Not in `is_provider_publicly_discoverable`. See WPS-023 §14 — adding it there
broke fifty-two assertions across nine suites that define what "discoverable"
means, and the correct response was to back out rather than to edit them.

Instead:

- `is_published` is the discovery switch, and for a WPS-023 account the only
  thing that sets it true is `staff_worker_vetting_decision('activate')`, which
  refuses unless every gate passes.
- Worker verbs call `private.require_active_worker()`.

---

## Document handling

| | National ID | Criminal record |
| --- | --- | --- |
| Bucket | `verification-documents` (WPS-006) | `worker-criminal-records` (new) |
| Public | no | no |
| Metadata | `provider_verification_documents` | `worker_criminal_record_submissions` |
| Staff access | `review_identity_verification` | `review_criminal_records` |
| Read policy | owner or staff | owner or **capability**, not `is_staff()` |
| Signed URL | 300s, after an audited call | 300s, after an audited call |
| Export included | no | no |

The certificate gets its own everything because it is the most sensitive
document Warsha holds. Putting it behind `private.is_staff()` would have made it
reachable by every support agent; the whole point of a dedicated capability is
that ordinary staff access is not enough.

`public.worker_criminal_record_submissions` has **no offence column**. Not "an
offence column that is left empty" — no column exists that could hold one. The
regression suite asserts this against `information_schema.columns`, so adding
one later fails a test rather than passing review.

Offence-relevant text can exist only in `private.worker_criminal_record_review`,
which no RPC returns to any client, and which the worker themselves cannot read.

---

## Two independent checks on every document path

The storage path is validated in the RPC **and** by the storage policy:

```sql
-- submit_my_criminal_record
if pg_catalog.split_part(p_storage_path, '/', 1) <> v_user::text then
  raise exception 'Invalid document path' using errcode = '42501';
```

```sql
-- storage.objects policy
with check (bucket_id = 'worker-criminal-records'
            and (storage.foldername(name))[1] = (select auth.uid())::text)
```

Either alone would be sufficient today. Two is the point: a future RPC that
forgets the check is still stopped by the policy, and a policy edit that widens
too far is still stopped by the RPC.

---

## Staff decisions

Capability follows the **weight of the decision, not the shape of the call**.
`staff_worker_vetting_decision` maps each decision to its own capability before
doing anything else:

```
approve    → review_criminal_records
activate   → activate_worker
reject     → reject_worker_application   (dual control)
suspend    → reject_worker_application   (dual control)
```

Approving somebody and rejecting them are not the same authority, and a single
`review_workers` capability would have made them so.

An adverse decision without a recorded private note ≥ 10 characters is refused
by the server. A rejection with an empty note is a rejection nobody can review
later.

Every decision writes a `staff_audit_events` row and, for document access, a
`staff_access_log` row carrying the capability that permitted it.

---

## Appeals

Reuse the WPS-016 authority. The separation rule is **enforced in SQL, not in a
runbook**:

```sql
create function private.worker_appeal_reviewer_is_independent(p_user_id, p_reviewer)
  → not exists (adverse event on this account with actor_id = p_reviewer)
```

A runbook that says "a different person must review appeals" is a runbook that
gets ignored at 2am on a busy queue. This one raises `42501`.

No AI decides an appeal outcome. No automatic adverse decision follows from a
low-confidence extraction or an ambiguous record.

---

## Grandfathering

Every existing provider was backfilled into `manual_review`, never `active`.

None has been through WPS-023 identity confirmation or submitted a certificate.
Marking them active would have been convenient, would have avoided a re-review
backlog, and would have been exactly the automatic approval this specification
forbids. The regression suite asserts that no account is backfilled into an
active state.
