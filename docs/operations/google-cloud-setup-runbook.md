# Google Cloud setup — WPS-024

Everything an operator needs to take Warsha's two Google integrations from
**implemented, awaiting credential** to **active**.

**Nothing in this document has been executed.** No Google Cloud project has been
created, no billing account exists, no API has been enabled and no key has been
issued for Warsha. This is the procedure, written so the person who performs it
does not have to reconstruct the reasoning.

Related: [External Provider Registry](../architecture/external-provider-registry.md) ·
[Provider abstraction](../architecture/provider-abstraction.md) ·
[Secret rotation runbook](./secret-rotation-runbook.md) ·
[OCR accuracy baseline](../testing/WPS-024-OCR-ACCURACY-BASELINE.md)

---

## What is being set up, and what each thing costs

| Integration | Google product | Billing | Warsha secret |
| --- | --- | --- | --- |
| Identity text extraction | Cloud Vision API | Per image, after a monthly free tier | `GOOGLE_CLOUD_VISION_SERVICE_ACCOUNT` |
| Address search and geocoding | Places API (New), Geocoding API | Per request | `GOOGLE_MAPS_SERVER_KEY` |
| Map rendering on the device | Maps SDK for Android / iOS | Free to render | **publishable render key, not a secret** |

The third row is the one people get wrong. See
[Two keys, two natures](#two-keys-two-natures).

---

## Prerequisites

1. **A Google Cloud organisation or a personal Google account** with authority
   to accept the Terms of Service. For a company this should not be a personal
   account: when that person leaves, the project leaves with them.
2. **A billing account with a payment method.** Both Vision and Places refuse
   requests on a project with no billing account, even inside the free tier.
   This is Google's anti-abuse control, not an upsell.
3. **A budget and a budget alert**, configured before the first key is issued.
   A leaked Places key with no budget alert is a bill nobody notices for a
   month.
4. **One Google project per hosted environment.** Development, staging and
   production never share credentials or budgets. A shared project means a
   development or staging test spends production budget and forces production
   key restrictions to be unnecessarily broad.

---

## Step 1 — Create the projects

```
gcloud projects create warsha-development --name="Warsha (development)"
gcloud projects create warsha-staging  --name="Warsha (staging)"
gcloud projects create warsha-production --name="Warsha (production)"
gcloud beta billing projects link warsha-development --billing-account=<ACCOUNT_ID>
gcloud beta billing projects link warsha-staging   --billing-account=<ACCOUNT_ID>
gcloud beta billing projects link warsha-production --billing-account=<ACCOUNT_ID>
```

Record both project IDs in the deployment notes. They are not secret.

## Step 2 — Enable exactly the APIs that are used

Nothing else. Every enabled API is a surface a leaked credential could reach,
and Warsha uses four:

```
gcloud services enable vision.googleapis.com        --project=<PROJECT>
gcloud services enable places.googleapis.com         --project=<PROJECT>
gcloud services enable geocoding-backend.googleapis.com --project=<PROJECT>
gcloud services enable maps-android-backend.googleapis.com --project=<PROJECT>
gcloud services enable maps-ios-backend.googleapis.com     --project=<PROJECT>
```

Do **not** enable Directions, Distance Matrix, Roads, Street View or the Vision
face/label/landmark features. Warsha calls none of them, and an unused enabled
API is only ever a liability.

## Step 3 — The backend service account for Vision

Vision is called with a service account, not an API key, because a service
account can be scoped to one API and rotated without touching anything else.

```
gcloud iam service-accounts create warsha-vision-ocr \
  --display-name="Warsha Vision (server only)" --project=<PROJECT>

gcloud projects add-iam-policy-binding <PROJECT> \
  --member="serviceAccount:warsha-vision-ocr@<PROJECT>.iam.gserviceaccount.com" \
  --role="roles/serviceusage.serviceUsageConsumer"

gcloud iam service-accounts keys create warsha-vision-ocr.json \
  --iam-account=warsha-vision-ocr@<PROJECT>.iam.gserviceaccount.com
```

### Vision permissions

`roles/serviceusage.serviceUsageConsumer` and nothing more. Vision's
`images:annotate` endpoint authorises on the `cloud-vision` OAuth scope, which
the JWT in `google-vision-provider.ts` requests explicitly:

```
scope: 'https://www.googleapis.com/auth/cloud-vision'
```

Do not grant `roles/editor`, and do not grant Storage roles. This account reads
no bucket: Warsha downloads the document itself with the Supabase service role
and posts the bytes. A Vision service account with Storage access would be a
second, unaudited path to identity documents.

### Handling `warsha-vision-ocr.json`

The moment it is created it is the most sensitive file on the machine.

- Load it into Supabase Edge Function secrets **immediately**;
- delete the local copy;
- never commit it — `audit:secrets` scans the working tree and the commit
  history, and a key that reaches history is compromised even after a revert;
- record the key ID in the secret rotation runbook.

Use the governed path. It validates the file, keeps the value off the command
line, and confirms what actually landed:

```
npm run automation:govern -- set-vision-credential <absolute-path-to-json>
```

**Do not** set this secret with a shell argument. The obvious form

```
# WRONG - do not use
npx supabase secrets set GOOGLE_CLOUD_VISION_SERVICE_ACCOUNT="$(cat key.json)"
```

is wrong twice. It puts the private key in a process listing and a shell
history, and it hands a multi-line JSON document to a reader that applies
escape processing to it. The second fault is not hypothetical: on 2026-08-07 it
stored a value whose `\"` escapes were never unwound, so the secret was
present, was the right length, and was not JSON. OCR answered
`refused_no_credential` - which is exactly what a switched-off provider answers
- and so nothing looked wrong for three weeks. Two replacement keys were issued
before anybody suspected the loader rather than the key.

`set-vision-credential` writes a single-line minified document that no dotenv
reader will alter, then compares the SHA-256 Supabase publishes for the stored
secret against the SHA-256 of the value it sent, and fails loudly if they
differ. See `scripts/warsha-secret-encoding.mjs`.

Delete the local copy once the command reports that the digest matched:

```
rm warsha-vision-ocr.json
```

## Step 4 — The billed Maps server key

Places and Geocoding are called with an API key held only in Edge Function
secrets.

```
gcloud services api-keys create --display-name="Warsha Maps (server)" \
  --api-target=service=places.googleapis.com \
  --api-target=service=geocoding-backend.googleapis.com \
  --project=<PROJECT>
```

### Restrictions, all of them

| Restriction | Value | Why |
| --- | --- | --- |
| API restriction | Places + Geocoding only | A key that can also render maps is a key worth stealing twice |
| Application restriction | **IP addresses** of the Edge Function egress, if the platform publishes a stable range; otherwise none | An HTTP-referrer restriction is meaningless server-side |
| Quota | A daily cap slightly above expected peak | The difference between a leak costing a day's budget and a month's |

```
npx supabase secrets set GOOGLE_MAPS_SERVER_KEY="<KEY>" --project-ref <SUPABASE_PROJECT_REF>
```

## Step 5 — The publishable render keys

Two keys, one per platform, because the restrictions differ.

```
gcloud services api-keys create --display-name="Warsha Maps render (Android)" \
  --api-target=service=maps-android-backend.googleapis.com \
  --allowed-application=sha1_fingerprint=<SIGNING_SHA1>,package_name=com.warsha.app

gcloud services api-keys create --display-name="Warsha Maps render (iOS)" \
  --api-target=service=maps-ios-backend.googleapis.com \
  --allowed-bundle-ids=com.warsha.app
```

### Android signing restrictions

The SHA-1 fingerprint must be the one that actually signs the shipped artefact.
With EAS that is the **EAS-managed upload key**, not a local debug keystore:

```
eas credentials --platform android
```

A debug fingerprint in the restriction produces a map that works on the
developer's machine and renders grey for every user — a failure that survives
review because the person reviewing sees a working map.

If Play App Signing is enabled, Google re-signs the artefact, so **both** the
upload certificate and the Play app-signing certificate fingerprints must be
allowed, or the store build renders grey while the internal build does not.

### iOS bundle restrictions

Restrict to the bundle identifier, and remember TestFlight and App Store builds
share it while a development build may not. Confirm the identifier in
`app.json`.

### Injecting them at build time

Never committed. `app.json` carries placeholders, and the values arrive from EAS
secrets:

```
eas secret:create --name GOOGLE_MAPS_ANDROID_RENDER_KEY --value <KEY>
eas secret:create --name GOOGLE_MAPS_IOS_RENDER_KEY --value <KEY>
```

The regression suite asserts that `app.json` contains the placeholder names and
no string matching `AIza[0-9A-Za-z_-]{35}`.

---

## Two keys, two natures

This is the single most important paragraph in this document.

**The render key must be in the app bundle.** The native Maps SDK reads it from
the application manifest, and there is no server-side way to draw a map on a
phone. It is a **publishable** credential — the same category as the Supabase
anon key — and it is protected by *restriction*, not by *secrecy*: extracted
from a bundle, it is useless to anyone whose application is not signed with
Warsha's certificate.

**The server key must never be in the app bundle.** Places and Geocoding are
billed per request and have no package-name restriction available to a
server-side caller. A copy on a device lets anyone spend Warsha's Maps budget
until the key is rotated.

The entire reason `location-proxy` exists is to keep the second key off the
device. Anyone proposing "just call Places from the client, it's simpler" is
proposing to publish the billed key.

`private.external_providers.credential_secret_name` names only the server key,
because only the server key is a secret.

---

## Step 6 — Turn it on in Warsha

Configuring a credential does not enable anything. Three runtime gates, all of which
must pass, and they are read from the database rather than decided in code:

```
provider_enabled(key) = registry says 'active'
                    AND kill switch is not active
                    AND feature flag is enabled for this environment
```

1. **Bind the hosted project once.** A Security Administrator calls
   `staff_bind_platform_environment('local', '<environment>', '<project-ref>',
   '<reason>')`. The permanent hosted development project binds to
   `development`, never to local or staging.
2. **Publish the human-approved material legal versions.** Each exact
   `document:version:environment` publication consumes a dual-control approval.
   Follow the [Google Maps material-change checklist](./google-maps-material-change-checklist.md).
3. **Activate the registry row.** The intended activator requests
   `manage_subprocessors / activate_external_provider /
   google_maps_platform:<environment>`. A different authorized person approves,
   then `staff_activate_external_provider()` consumes it and changes
   `implemented_awaiting_credential` to `active`. It does not enable a flag or
   alter a kill switch.
4. **Exercise the server integration through Warsha's provider boundary.** The
   current public proxy remains fail-closed until the feature flag is enabled;
   do not bypass it with a direct Google call. If Places and Geocoding must be
   proved before any rollout, add a separately reviewed staff-only preflight
   boundary rather than weakening `provider_enabled()`.
5. **Enable the feature flag** for the current environment with
   `staff_set_feature_flag()`. The RPC rejects attempts to mutate another
   environment's state.
6. **Reconcile the Subprocessor Register.** The intended activator requests
   `manage_subprocessors / sync_subprocessor_in_use /
   google_maps_platform:<environment>:in_use`; a second person approves, and
   `staff_sync_provider_status()` consumes that approval before changing the
   subprocessor to `in_use`.

**Enabling a subprocessor is a material change to the Privacy Policy**: a new
immutable version, a change summary, and renewed acceptance before it takes
effect. Steps 1–3 are not complete without it.

## Step 7 — Measure the OCR baseline before production

Production is deliberately absent from `environments` for both Google providers
until [the accuracy baseline](../testing/WPS-024-OCR-ACCURACY-BASELINE.md) has
been measured on staging. The harness needs a credential and a sample set with
transcribed ground truth, and it refuses to invent either.

---

## Environment summary

| | Development | Staging | Production |
| --- | --- | --- | --- |
| Vision service account | Not configured; extraction unavailable, manual entry used | Future `warsha-staging` | Future `warsha-production` |
| Maps server key | Present in Supabase secrets; provider still disabled | Future staging credential | Future production credential |
| Render keys | Configured for development builds; activation still gated | Future staging keys, debug fingerprint | Future production keys, Play app-signing fingerprint |
| Vision billing | None | Free tier expected | Budgeted, alerted |
| Maps registry status | `implemented_awaiting_credential` until dual-controlled activation | Future | Future, only after staging evidence |

A developer with no Google account gets a working application. Extraction and
address search report unavailable, manual entry and manual pin placement work,
and no flow is blocked. That is a design guarantee, not an accident of
configuration.

---

## Rotation and revocation

Rotation is covered by the [secret rotation runbook](./secret-rotation-runbook.md).
Two things specific to Google:

- **A service-account key is rotated by creating the new key first**, setting
  the secret, confirming health, then deleting the old key. Deleting first
  causes every extraction to report unavailable — not an outage, because manual
  entry works, but an avoidable one.
- **A leaked render key is revoked, not rotated in place.** It is in shipped
  bundles that cannot be recalled, so the restriction is the control. If the
  restriction was wrong, fix the restriction; only replace the key if it was
  ever unrestricted.

Watch **External providers → Health** in the admin surface after any rotation.
`Not observed` means nothing has been called yet — it is not a pass.

---

## What is deliberately absent

- **No Ministry of Interior integration.** Warsha does not retrieve criminal
  records; a worker obtains their own certificate and uploads it. Locked
  decision, and no Google product is involved.
- **No Vision face detection, label detection or landmark detection.** Warsha
  reads printed text. Enabling the others would let a future change infer
  attributes from a photograph of a person's face.
- **No AutoML or custom model training.** Identity documents are never used to
  train a model, enforced by a database constraint that raises `23514`.
- **No Google Analytics, Firebase or Crashlytics.** Not in scope, not in the
  registry, and adding one is a material change to the Privacy Policy.
