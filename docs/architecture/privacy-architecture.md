# Privacy architecture — WPS-024

WPS-022 built the privacy machinery: classifications, inventory, consent,
export, deletion, retention, legal holds, anonymisation. WPS-024 does not
rebuild any of it. What WPS-024 adds is **governance over it** — the registers
that say what is processed, by whom, on what proposed basis, and for how long,
and the documents that disclose all of that to the people it concerns.

## The three registers

### Subprocessor register — `private.subprocessors`

| Key | Status | Identity data | Training prohibited |
| --- | --- | --- | --- |
| `supabase` | **in use** | yes | yes |
| `expo_eas` | in use (build artefacts, diagnostics) | no | yes |
| `google_cloud_vision` | **approved, not integrated** | yes (when in use) | yes |
| `google_maps_platform` | **approved, not integrated** | no | yes |

`approved_not_integrated` is a distinct state from `in_use`, and the difference
is the entire point of publishing a register. A supplier that has been approved
but has received no data is not a supplier that is processing your data.
Collapsing the two would make the register a statement about intent.

A constraint, not a note, enforces the important rule:

```sql
constraint subprocessors_identity_training_check
  check (
    integration_status <> 'in_use'
    or not ('identity_documents' = any(data_categories))
    or training_prohibited
  )
```

A supplier cannot be *in use* for identity data without the training
prohibition confirmed. A policy note does not stop an INSERT.

### Data processing register — `private.processing_activities`

Eleven activities: account and authentication, worker verification, bookings
and job execution, messaging, payments and earnings, trust and safety, reviews
and reputation, support, notifications, consent and agreements, diagnostics.

Each records purpose, data categories, subjects, recipients, **proposed basis**,
review status, retention rule, safeguards and authority.

Google Cloud Vision appears as a recipient of `worker_verification`; Google
Maps Platform as a recipient of `bookings_execution`. Both entries carry a note
stating the subprocessor register records them as not yet integrated and
holding no data — so the register names them without implying they are already
receiving anything.

### Data retention register — `private.privacy_retention_rules`

WPS-022 owns the table. WPS-024 adds one rule (`legal_acceptances`) and
inherits WPS-023's two.

## On lawful basis

**Every entry is `legal_review_status = 'pending'`. Not one is approved.**

Egyptian data protection law and its executive regulations continue to develop.
Warsha records the basis it *proposes* for each activity and marks it
unconfirmed.

This is deliberate and it is the harder choice. Asserting a settled legal
characterisation that has not been obtained would be a claim about compliance
rather than a description of practice, and a person reading it could not tell
the difference. The pgTAP suite asserts that no activity is recorded as
approved, so the honest state cannot drift into a confident one by accident.

The Privacy Policy says this to readers in as many words:

> Warsha would rather tell you what it does and say that the legal
> classification is unsettled than tell you a classification and be wrong.

## AI governance

`private.ai_use_declarations` holds one row: identity text extraction, via
Google Cloud Vision, server-side, **approved and not integrated**.

Three constraints do the work that a policy document cannot:

```sql
check (not (covers_identity_data and permitted_for_training))
check (human_confirmation_required)
check (array_length(prohibited_decisions, 1) >= 1)
```

The first is the strongest available form of *"identity documents SHALL NOT be
used for AI training by default"*. Flipping it is not a configuration change a
tired person makes at midnight — it is a migration that has to be written,
reviewed and deployed. That friction **is** the governance the AI Usage Policy
promises.

`prohibited_decisions` for the declared use:

```
document_authenticity, identity_authenticity, forgery_detection,
criminal_eligibility, account_suspension, appeal_outcome
```

## What is disclosed, and in what tense

The hardest thing to get right in the privacy corpus is tense. Google Cloud
Vision and Google Maps Platform are approved; neither is integrated. So every
document says **"approved, not yet in use"**, names the governance that turns
one on, and states that switching one on is a material change requiring a new
version and renewed acceptance.

A privacy document written in the present tense about processing that does not
happen is a false statement about somebody's personal data, and the fact that
it would become true later does not make it true now. The regression suite
asserts the tense:

```ts
check(/no text extraction is performed/i.test(ocrText), …);
check(/not integrated/i.test(locationText), …);
```

## Notification payloads

Four WPS-024 events. Each carries a state and nothing else — no identity
number, no filename, no offence text, no address, no staff note, no document
key, no hash. Asserted by searching the seeded catalogue block.

## Integration points

| WPS | What WPS-024 uses | What WPS-024 does not touch |
| --- | --- | --- |
| WPS-016 | `trust_account_state` via the activation gates | The trust model |
| WPS-017 | `staff_capabilities`, `record_staff_audit`, `AdminShell` | The queue inventory |
| WPS-018 | `rate_limit_policies`, `platform_environment` | The readiness gates |
| WPS-022 | `privacy_consent_purposes`, `data_inventory`, `privacy_retention_rules` | `record_my_consent`, the consent ledger |
| WPS-023 | `worker_activation_gates`, `account_onboarding` | The gate definitions themselves |

Seven new objects are registered in `private.data_inventory`, so WPS-022's
inventory remains the single place to ask what Warsha holds.

## Related

- [Legal architecture](./legal-architecture.md)
- [Consent architecture](./consent-architecture.md)
- [Document lifecycle](./document-lifecycle.md)
