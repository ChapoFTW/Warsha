# Warsha consent model

## The rule this model exists to enforce

**Accepting the Terms is not consent to everything else.**

That conflation is the most common consent failure in consumer software: one
checkbox at sign-up, then every later processing purpose treated as covered by
it. Warsha records each purpose separately, and the privacy centre says so in
one line — *"Agreeing to the terms is not agreement to anything optional
below."*

## What existed before

`public.profiles` already carried `terms_accepted_at` and
`privacy_accepted_at`. They are scalar acknowledgements: one timestamp each, no
document version, no withdrawal, no purpose distinction.

They are **preserved** — nothing here deletes them — and **backfilled** into the
ledger on migration, so the consent history starts with what actually happened
rather than an empty table that would read as *"nobody ever accepted anything"*.

From this point the ledger is the authority.

## The eight purposes

| Purpose | Required | Document | What it covers |
| --- | --- | --- | --- |
| `terms_of_service` | Yes | terms | The agreement to use Warsha |
| `privacy_notice` | Yes | privacy | Acknowledgement of what is collected and why |
| `service_communication` | Yes | privacy | Messages about live bookings |
| `marketing_communication` | No | privacy | Offers and news |
| `referral_communication` | No | privacy | When an invited person finishes their first job |
| `diagnostics` | No | privacy | Crash and performance reports |
| `location_use` | No | privacy | Foreground only, while choosing an address |
| `identity_verification` | No | verification | Worker document review |

Three are required. **A required purpose is not offered as a choice** — the
privacy centre renders it as a statement of fact with a check mark, never as a
toggle that would refuse when pressed. Rendering a mandatory thing as an
optional control is its own dark pattern: it costs the user a press to discover
a fact the interface already knew.

`record_my_consent` raises `22023` on an attempt to decline a required purpose,
rather than storing a `false` the product would then ignore. Mock raises too —
a Mock that allowed it would let a screen ship an "off" state that never exists.

## Why these three are required

- **Terms.** There is no product without an agreement to use it.
- **Privacy notice.** This is an *acknowledgement*, not permission. Recording
  it as required is honest: we are not asking whether you agree, we are
  recording that you were told.
- **Service communication.** A live booking involves another person who is
  expecting to hear from you. Silencing it mid-job is a safety problem, not a
  preference. It is scoped to bookings and nothing else — marketing is a
  separate, optional purpose.

## Record shape

| Column | Purpose |
| --- | --- |
| `user_id` | Whose decision |
| `purpose_key` | Which purpose |
| `document_version` | Which version of the document was shown |
| `granted` | The decision |
| `decided_at` | When |
| `environment` | `local` / `development` / `staging` / `production` |
| `source_surface` | `sign_up`, `privacy_center`, `onboarding`, `worker_onboarding`, `verification`, `support`, `migration` |
| `withdrawn_at` | When an earlier grant stopped applying |

`document_version` matters: consent to a notice is consent to *that* notice. A
later version needs a fresh decision, and without the version recorded there is
no way to know which one somebody saw.

## Immutability

Consent history is append-only. A withdrawal is a **new row** saying
`granted = false`; the earlier row that said yes is never edited.

The trigger permits exactly one update: stamping `withdrawn_at` on the grant
being closed. Every other column must be identical for it to pass — same user,
purpose, grant value, version, timestamp, environment and surface. That records
*when a permission stopped applying* without changing *what was agreed*.

Deletes are refused unconditionally, including to the row's own owner. A consent
trail that can be rewritten is not a trail.

## What withdrawal does and does not do

Withdrawal stops **future optional processing**. It does not erase historical
facts:

- withdrawing `marketing_communication` stops future offers; it does not delete
  the record that offers were once sent;
- withdrawing `diagnostics` stops future reports; it does not retroactively
  remove crash reports already used to fix a fault;
- withdrawing `location_use` stops the foreground prompt; it does not delete
  addresses already saved, which are `account_private` data under the user's own
  control.

## What is deliberately absent

**No consent prompt exists to look compliant.** Every purpose above corresponds
to processing Warsha actually performs. There is no cookie banner (there are no
cookies to consent to), no "legitimate interest" toggle, and no bundled
all-or-nothing acceptance.

If a purpose here ever stops describing real processing, the correct fix is to
remove the purpose — not to leave a decorative switch behind.

## Rate limiting

`privacy_consent_write` — 60 per hour per account. Consent history is
append-only, so writes are bounded to keep the trail readable rather than to
discourage changes. Sixty per hour is far beyond any genuine use.
