# External Provider Registry — WPS-024

`private.external_providers` is the authoritative record of every external
service Warsha depends on. **No provider may be enabled without a row here**,
and `private.provider_enabled()` — the single answer to "may this be called" —
reads it.

## Why this is separate from the Subprocessor Register

They answer different questions and conflating them loses both.

| | Subprocessor Register | External Provider Registry |
| --- | --- | --- |
| Concept | **Privacy** | **Operational** |
| Question | Who processes personal data on Warsha's behalf? | What do we depend on, who owns it, and is it on? |
| Audience | Users — it is published in the legal corpus | Staff and auditors |
| Expo Camera | Absent | Present |

Expo Camera is the clarifying case. It is an external dependency Warsha must
track, version and be able to disable — so it belongs in this register. It runs
entirely on the device and sends Warsha's data to nobody, so it is **not** a
subprocessor and does not belong in a document telling users who receives their
data. Listing it there would inflate the disclosure with something that
receives nothing.

The link is `subprocessor_key`, null exactly when a provider is not a
subprocessor.

## The register today

| Provider | Role | Status | Runs | Secret | Subprocessor |
| --- | --- | --- | --- | --- | --- |
| `supabase` | `platform` | **active** | both | `SUPABASE_SERVICE_ROLE_KEY` | yes |
| `expo_eas` | `build_delivery` | **active** | server | `EXPO_TOKEN` | yes |
| `expo_camera` | `document_capture` | **active** | device | — | no |
| `expo_image_picker` | `document_capture` | **active** | device | — | no |
| `expo_document_picker` | `document_capture` | **active** | device | — | no |
| `google_cloud_vision` | `identity_ocr` | **implemented, awaiting credential** | server | `GOOGLE_CLOUD_VISION_SERVICE_ACCOUNT` | yes |
| `google_maps_platform` | `location` | **implemented, awaiting credential** | both | `GOOGLE_MAPS_SERVER_KEY` | yes |

`implemented_awaiting_credential` is a real state, not a hedge: the integration
is built, tested and reachable, and no credential has been supplied to this
environment. Calling it `active` would make the register a wish rather than a
record, and `provider_enabled()` returns false for both.

## Fields

Every row carries all of these:

`provider_key` · `display_name` · `purpose` · `introduced_by_wps` ·
`capability_role` · `current_status` · `execution_context` · `environments` ·
`feature_flag_key` · `kill_switch_key` · `data_categories` ·
`privacy_policy_ref` · `subprocessor_key` · `processing_activity_key` ·
`security_owner` · `operational_owner` · `date_introduced` ·
`provider_version` · `last_review_date` · `credential_secret_name` ·
`map_renderer_key` · `notes`

pgTAP asserts that none of the descriptive fields is blank for any provider — a
registry with an empty `purpose` is a row that satisfies a schema and answers
no question.

`introduced_by_wps` is not decoration. It is how somebody finds the reasoning
behind a dependency three years later, when the person who added it has gone.

## Capability roles

`capability_role` records what a provider is **for**, and it is what makes the
registry the switch rather than a description. Nothing downstream names a
vendor:

```
provider_for_role('identity_ocr')          → 'google_cloud_vision'
provider_enabled_for_role('identity_ocr')  → false, today
```

`get_extraction_capability()` and `get_location_capability()` ask by role, the
Edge Functions resolve the returned key against their provider registries, and
pgTAP asserts that neither capability surface contains a vendor's name.

`identity_ocr` and `location` are **singular** — a partial unique index permits
at most one non-retired provider each, because two active OCR providers would
make "which one read this document" unanswerable. `document_capture` is plural:
camera, image picker and document picker all fill it.

See [Provider abstraction](./provider-abstraction.md) for the interfaces.

## Three gates, all of which must pass

```
provider_enabled(key) =
      registry says 'active'
  AND kill switch is not active
  AND feature flag is enabled for this environment
```

Any one stops the call. The Edge Functions read this rather than deciding for
themselves, so there is one place to look and one place to turn something off.

## Health

Every provider call records a sample — provider, operation, version, outcome,
latency, attempts, timed out — and a rollup carries the cumulative figures.
Surfaced at **Admin → Governance → External providers**, gated on
`review_legal_governance`.

Three properties worth stating because each is a decision:

- **Availability excludes Warsha's own refusals.** A kill switch is not a
  supplier outage, and counting it as one would make the figure meaningless
  during exactly the incident it exists for.
- **An unobserved window reports null, not 100%.** A provider nobody has called
  since Tuesday is unobserved, not healthy.
- **No health table holds an account, a document, an extracted value or a
  credential.** Health answers "is the vendor working". A screen that could also
  answer "what did this worker submit" would be a second route to identity data
  behind a different capability.

## Credentials

The register holds **names**, never values.
`staff_provider_registry()` returns `credentialSecretName` so a reviewer knows
which secret to rotate, and there is no path that returns what it is.

A constraint enforces the part that matters most:

```sql
constraint external_providers_device_secret_check
  check (execution_context <> 'device' or credential_secret_name is null)
```

A device-side provider cannot hold a server secret. "We would never do that" is
not a control; this is.

### The Maps key exception, stated plainly

The Maps **render** key must reach the device. The native SDK reads it from the
app manifest and there is no server-side way to draw a map on a phone. It is
therefore a **publishable** key, and it is handled as one:

- restricted at Google by package name and signing fingerprint, so a copy
  lifted from a bundle cannot be used by another application;
- scoped to the Maps SDK only — **Places and Geocoding are not enabled on it**;
- supplied as a build-time placeholder (`$GOOGLE_MAPS_ANDROID_RENDER_KEY`),
  never committed.

Everything billed per request — Places Autocomplete, Place Details, forward and
reverse geocoding — goes through `location-proxy`, which holds a **separate,
genuinely secret** key that never leaves the backend. That split is the entire
reason the proxy exists: a client calling Places directly would need the billed
key on the device, and anyone could then spend Warsha's Maps budget.

Only the server key is named in `credential_secret_name`, because only the
server key is a secret.

## Adding a provider

All of the following, and the register is the last step rather than the first:

1. Governance approval, recorded.
2. Security review — what it receives, where it runs, how it is credentialed.
3. Privacy review — is it a subprocessor?
4. Documentation update, including the WPS that introduces it.
5. Subprocessor Register update, **if** it processes personal data off-device.
6. Data Processing Register update.
7. A row here, with a feature flag and — if it touches identity data — a kill
   switch.

Adding a subprocessor is a **material change** to the Privacy Policy: a new
version, a change summary, and renewed acceptance before it takes effect.

**No external provider may be silently enabled.** There is no code path that
calls a provider absent from this register, because `provider_enabled()`
returns false for an unknown key.

## Keeping the two registers honest

`staff_sync_provider_status()` moves a subprocessor between
`approved_not_integrated` and `in_use` to match what is actually enabled. It
refuses to promote a provider whose flag is still off, so the published
Subprocessor Register can never claim a supplier is receiving data before it
is. Capability-gated on `manage_subprocessors`, which carries dual control.

## Related

- [Provider abstraction](./provider-abstraction.md)
- [Google Cloud setup runbook](../operations/google-cloud-setup-runbook.md)
- [Privacy architecture](./privacy-architecture.md)
- [Legal architecture](./legal-architecture.md)
- [OCR accuracy baseline](../testing/WPS-024-OCR-ACCURACY-BASELINE.md)
