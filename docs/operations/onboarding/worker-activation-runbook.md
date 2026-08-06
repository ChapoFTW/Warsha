# Runbook — worker activation

Authority: WPS-023. Capability required: `activate_worker`
(**high risk, reauth required**).

---

## What activation means

Activation is the moment a person becomes reachable by customers. It sets
`is_published = true` and makes `private.worker_capability_active()` return
true, which is what every worker operation checks.

Before it: no discovery, no quote invitations, no quote submission, no job
acceptance, no worker chat, no worker opportunity notifications, no payouts.

After it: all of them.

**Approval is not activation.** `approved` means a reviewer accepted the
application. `active` means every gate passes *and* somebody activated the
account. A worker can be approved for days with a missing profile photo.

---

## The server will refuse you

```
staff_worker_vetting_decision(user_id, 'activate', reason_code, safe_reason)
```

re-evaluates all twenty-four gates and raises `22023` — *Activation gates are
not satisfied* — if any is false. That holds even though you hold
`activate_worker`.

This is intentional. The capability lets you make the decision; it does not let
you skip the evidence.

---

## Checking why activation is refused

Read `private.worker_activation_gates(user_id)` and look for `false`.

| Gate | Meaning |
| --- | --- |
| `authenticated_account` | Account deleted at the auth layer |
| `verified_phone` | No confirmed phone |
| `worker_role_selected` | `intended_role` is not `worker` |
| `legal_name_complete` | Identity fields never confirmed |
| `profile_photo` | No avatar |
| `biography` | Outside the WPS-010 20–500 character bound |
| `services_configured` | No active service |
| `service_area_configured` | No area with a 1–250 km radius and a governorate |
| `current_address_provided` | No **confirmed** address |
| `national_id_front_uploaded` / `..._back_uploaded` | Missing document |
| `national_id_approved` | One or both sides not approved |
| `identity_fields_confirmed` | Worker never confirmed their fields |
| `criminal_record_uploaded` | No current certificate |
| `criminal_record_approved` | Certificate not `clear` or `approved` |
| `worker_agreement_accepted` / `document_processing_accepted` | Terms outstanding |
| `identity_verification_approved` | WPS-006 verification not approved |
| `not_banned` | WPS-016 ban active |
| `no_blocking_trust_action` | Suspended, under investigation, hidden, or removed |
| `provider_status_allowed` | `onboarding_status` is not `approved` |
| `not_deactivated` | WPS-022 deactivation |
| `no_deletion_pending` | WPS-022 deletion in progress |

Route each to whoever owns it. Do not attempt to satisfy a gate on somebody's
behalf.

---

## Kill switch

`worker_activation` in `private.staff_kill_switches`. When active, no worker may
be activated or reinstated. Use it if a systemic problem with the vetting flow
is discovered — a mis-scoped capability, a broken gate, a document leak.

It ships inactive.

---

## Suspension and reinstatement

Suspension uses `reject_worker_application` — a different, dual-controlled
capability — and requires recorded evidence. It sets `is_published = false`
immediately.

Reinstatement uses `activate_worker` and re-evaluates every gate. A worker
suspended for a trust reason will not pass `no_blocking_trust_action` until the
trust team clears it, and no amount of `activate_worker` will override that.

---

## Grandfathered accounts

Every provider predating `202608080001` sits in `manual_review`. They have done
nothing wrong; they predate the requirement.

Activating one is the ordinary path with the ordinary gates, which means most
will need documents they have never been asked for. There is no bulk
reactivation and there should not be — a bulk activation is an automatic
approval wearing a different name.

---

## Never

- Activate to unblock a support ticket.
- Activate an account whose gates you have not read.
- Set `is_published` directly. There is no client or staff route to it outside
  this decision, and adding one would remove the gate check.
