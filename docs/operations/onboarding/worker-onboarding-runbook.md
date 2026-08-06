# Runbook — worker onboarding

Authority: WPS-023. Audience: support and operations.

> Every WPS-023 surface currently ships behind a disabled feature flag.

---

## The lifecycle, and who moves it

```
account_created
  → onboarding_incomplete / identity_required      (worker)
  → identity_submitted                             (worker)
  → identity_under_review                          (STAFF)
  → criminal_record_required                       (STAFF, after identity review)
  → criminal_record_submitted                      (worker)
  → criminal_record_under_review                   (STAFF)
  → approved                                       (STAFF)
  → active                                         (STAFF, all gates must pass)

any point → correction_required / manual_review / rejected   (STAFF)
rejected  → appeal_pending                                   (worker)
```

**A worker cannot move themselves to a review, approval or activation state.**
The server refuses it. If somebody reports having done so, that is a defect —
escalate immediately.

---

## "Why can't I upload my certificate yet?"

The certificate step opens only after a member of staff has reviewed the
identity documents and moved the account to `criminal_record_required`.

This is deliberate ordering, not a bug: reviewing a certificate against an
unverified identity tells you nothing.

---

## "How long will this take?"

**Do not give a time.** Warsha measures no review turnaround and has committed
to staffing no queue. Every user-facing string is written to avoid this, and the
regression suite asserts no copy promises one.

Say what is true: it is with the team, and they will be notified as soon as
there is an update.

---

## Reading an account's position

`get_my_onboarding_state()` is the worker's own view.
`staff_worker_vetting_queue()` is the staff view — opaque reference, state,
wait, priority.

To understand *why* somebody is stuck, read `outstandingGates`. The client
already filters this to what the worker can act on; the raw list includes
staff-side gates they cannot.

| Gate | Who fixes it |
| --- | --- |
| `national_id_front_uploaded` / `..._back_uploaded` | worker |
| `identity_fields_confirmed` | worker |
| `criminal_record_uploaded` | worker |
| `profile_photo` / `biography` / `services_configured` / `service_area_configured` | worker |
| `current_address_provided` | worker |
| `worker_agreement_accepted` / `document_processing_accepted` | worker |
| `national_id_approved` | **staff** |
| `criminal_record_approved` | **staff** |
| `identity_verification_approved` | **staff** |
| `provider_status_allowed` | **staff** |
| `not_banned` / `no_blocking_trust_action` | **trust team** |
| `not_deactivated` / `no_deletion_pending` | **the account owner**, via privacy |

Never tell a worker to fix a staff-side gate.

---

## Grandfathered accounts

Every provider that existed before `202608080001` was backfilled into
`manual_review`.

They are **not** rejected and they have **not** done anything wrong. They
predate the vetting requirement and need a review against it. Say exactly that.

Re-activating one is a staff act through the normal activation path, and it
requires the same gates as anybody else — which means most will need to submit
documents they have never been asked for.

---

## Escalate immediately if

- A worker reports being able to take a job before activation.
- A worker reports seeing another worker's documents or details.
- `workerCapabilityActive` is true while `outstandingGates` is non-empty.
- Any user-facing text implies Warsha obtains the certificate, or promises a
  review time.
