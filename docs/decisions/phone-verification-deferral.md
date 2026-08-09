# Decision — phone numbers are contact information, not an auth factor

Authority: WPS-024 (correction to WPS-001 / WPS-023). Status: **LOCKED**.
Legal review: **not performed**.

> This document records a product decision. It is **not legal advice**, claims
> **no legal compliance or approval**, and invents **no statutory requirement**.

---

## Decision

A phone number is **REQUIRED CONTACT INFORMATION** on every Warsha account.

Phone OTP verification is **NOT required** to register — not for a customer, not
for a worker. Customers authenticate with **email and password**, preserving
their existing email-confirmation behaviour. Workers authenticate with **phone
and password** in the product and have no user-facing email or confirmation
step. A trusted server boundary owns a UUID-derived synthetic email solely to
use Supabase's email/password credential provider.

Supabase Phone Auth stays **disabled**. No SMS provider is configured, and none
is required to launch.

---

## What was actually wrong

This is a correction, not a relaxation. Before it, registration could not
complete at all.

`activate_provider_role` raised `Verified phone required` unless
`auth.users.phone_confirmed_at` was set. The only thing that sets that field is
an SMS one-time code from a provider Warsha has not configured. The same
requirement appeared twice more — as the `verified_phone` activation gate, and
inside `is_provider_publicly_discoverable`.

So the product's real state was:

| Stage | Outcome before the correction |
| --- | --- |
| Worker registration | Impossible — waited for a code nobody sent |
| Worker activation | Impossible — gate could never be satisfied |
| Worker discovery | Impossible — a worker approved by staff would never appear |

Three separate failures, each discovered at a different point in the funnel, by
a different person, weeks apart. The third is the worst of them: a worker who
completed onboarding, passed staff review and was approved would simply never
have appeared in search, with nothing in the verification record to explain why.

---

## The distinction this decision rests on

**A number ON FILE and a number PROVEN are different facts**, and the system now
says which one it holds.

- `public.profiles.phone` — a contact detail somebody typed. Required,
  validated, unique, stored, exportable, deletable.
- `auth.users.phone_confirmed_at` — the only field that means "this person
  demonstrated they hold this handset". It is **null for every account**, and
  nothing anywhere treats it as anything else.

The activation gate was renamed from `verified_phone` to
`phone_number_provided` rather than redefined in place. A gate called
`verified_phone` that passes for an unverified number is a lie that every future
reader would believe, and one of them would eventually rely on it for something
that matters.

---

## Alternatives considered

**Configure an SMS provider before launch.** Rejected for now. It adds a paid
external dependency, a deliverability problem in Egypt, and a delivery-failure
support burden — to obtain a fact Warsha does not currently act on. Nothing in
the product reads "verified phone" to make a decision. Buying certainty nobody
consumes is the wrong order of work.

**Keep the requirement and let registration stay broken.** Rejected. It was not
a deliberate control; it was a leftover from WPS-001, when workers registered by
phone and had no email at all.

**Drop phone collection entirely.** Rejected. A worker is going to somebody's
home. The customer needs to reach them when they are late, and Warsha needs to
reach either party when a job goes wrong. That is exactly what contact
information is for, and it does not require proof of possession to be useful.

**Redefine `verified_phone` to mean "provided".** Rejected — see above.

---

## What is preserved

Every part of the OTP infrastructure survives, unused by registration:

| Kept | Where | State |
| --- | --- | --- |
| `assertPhoneAuthAvailable()` | `src/auth/phone-auth-capability.ts` | **Fails closed** |
| Phone confirm / change | `requestWorkerPhoneChange`, `verifyWorkerPhoneChange` | **Fails closed** |
| OTP entry state machine | `src/auth/worker-auth-flow.ts` | Retained, wired to nothing |
| OTP rate limit | `private.rate_limit_policies.auth_otp_request` | Enabled |
| Phone validation | `src/auth/phone-auth.ts` | Enforced at registration |

`assertPhoneAuthAvailable()` remains **only** for: confirming a phone number,
changing a phone number, and any future high-risk step-up verification that is
explicitly approved. It is asserted to sit outside `signUp` by
`scripts/device-p1-regressions.test.mts`, so its return into registration is a
test failure rather than a discovery.

The state machine is kept because the behaviour it encodes is not obvious — a
stale invalid-code error must not render at phone entry, editing the number must
clear the code, a send failure must never surface invalid-code copy. Each is a
bug somebody already found. Rewriting it from memory later would find them all
again.

---

## What confirming a number does

Nothing. Deliberately.

It used to activate the worker role on success, which made confirmation a
precondition for working dressed up as a convenience. It now grants no
capability, unlocks no surface and satisfies no gate — asserted by
`scripts/worker-auth-flow.test.mts`.

When Phone Auth is eventually enabled, that stays true until a separate,
explicit decision says otherwise.

---

## Reversal

Enabling Supabase Phone Auth and configuring an SMS provider is sufficient to
make the confirm and change flows work. It is **not** sufficient to make
verification a registration requirement — that would need
`private.account_contact_phone` to be replaced by a confirmation check in all
three call sites, a new gate key, and a migration path for every account that
registered without one.

That migration path is the reason this is worth writing down. Turning the
requirement back on without one would lock out every existing account at once.

---

## Related

- [Authentication entry architecture](../architecture/authentication-entry-architecture.md)
- [Worker criminal-record model](./worker-criminal-record-model.md)
- `supabase/migrations/202608120001_wps024_registration_authentication_correction.sql`
