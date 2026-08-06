# Runbook — identity document review

Authority: WPS-023. Capability required: `review_identity_verification`.

> No decision UI exists yet. The RPCs below are implemented, granted,
> capability-checked and tested; the admin surface is read-only. This runbook
> describes the intended procedure and the controls that already enforce it.

---

## Before you start

You are about to look at somebody's national identity document. Every time you
open one, a `private.staff_access_log` row records you, the capability that
permitted it, and which document. That is not a deterrent aimed at you — it is
what makes an investigation possible if your account is ever compromised.

Open a document only to review the case in front of you.

---

## Procedure

1. Take the case from `staff_worker_vetting_queue()`. You see an opaque
   reference, the state, how long it has waited, and whether a certificate
   exists. You do **not** see a name until you open the case.

2. Move the case to review:
   ```
   staff_worker_vetting_decision(user_id, 'start_identity_review',
     reason_code, safe_reason)
   ```

3. Open both sides:
   ```
   staff_worker_document_reference(user_id, 'national_id_front')
   staff_worker_document_reference(user_id, 'national_id_back')
   ```
   Each returns a bucket, path and a 300-second expiry, and each writes an
   access-log row before returning anything.

4. Compare the document against the **worker-confirmed** fields, not the
   extraction candidates. The worker's confirmation is the assertion under
   review.

5. Check: both sides present and legible · the name matches the confirmed legal
   name · the number's last four match `national_id_last4` · the document is not
   expired · the photo is a plausible match for the profile photo · no sign of
   alteration.

6. Note `duplicateSeen` if the reference reports it. **Do not reject on a
   duplicate alone.** Shared devices, re-scans and family members produce
   legitimate collisions. It is a reason to look harder, not a finding.

---

## Outcomes

| Decision | When | Capability |
| --- | --- | --- |
| `criminal_record_required` (via `start_certificate_review` path) | Identity accepted | `review_identity_verification` |
| `request_correction` | Something is fixable — blurry, cut off, wrong side | `review_worker_vetting` |
| `escalate_manual_review` | You are not sure, or something is unusual | `review_worker_vetting` |
| `reject` | Identity cannot be established | `reject_worker_application` (**dual control**) |

---

## Writing a correction reason

The `safe_reason` goes straight to the worker. It must say what to change and
nothing else.

Good: *"The back of your ID is cut off at the bottom. Please retake it with the
whole card in frame."*

Bad: *"Document quality insufficient."* — tells them nothing.
Bad: *"Photo doesn't match, possible fraud."* — an accusation in a field
designed for instructions, and it tells a genuine attacker what you noticed.

Your actual assessment goes in `p_private_note`, which the worker cannot read.

---

## Rejection

Requires `reject_worker_application`, which carries **dual control and reauth**.

The server refuses a rejection whose private note is shorter than ten
characters. A rejection with an empty note is a rejection nobody can review
later, including you in six months.

Record: what you saw, what you compared it against, and why it could not be
resolved by a correction request.

---

## What you must not do

- Open a document for any reason other than the case in front of you.
- Put identity details, document contents or your assessment into `safe_reason`.
- Reject on a duplicate hash alone.
- Approve identity and activate in one motion — activation is a separate
  capability and a separate decision.
- Review an appeal against your own adverse decision. The server refuses it
  (`42501`), but do not attempt it.
