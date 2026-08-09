# Warsha subprocessor register

Third parties that can hold or see Warsha personal data.

> This register records **what is technically true today**. It is not a legal
> instrument. Whether Warsha needs a data-processing agreement with any party
> below, and what it must say, is an open question — see
> [WARSHA-PRIVACY-LEGAL-QUESTIONS](WARSHA-PRIVACY-LEGAL-QUESTIONS.md) Q-08.

## Active

| Party | Role | Data it can hold | Where | Notes |
| --- | --- | --- | --- | --- |
| **Supabase** | Database, auth, storage, realtime | Everything. Postgres rows, `auth.users`, all 13 storage buckets | Hosted region per project settings | The primary processor. All personal data lives here |
| **Expo** (EAS) | Build and update service | Build artefacts, source, update artefacts, and technical delivery requests. **No Warsha account or marketplace payloads** | Expo infrastructure | Preview EAS Update is configured on an isolated internal channel; Production OTA remains disabled |
| **Google Fonts** (`@expo-google-fonts`) | Typeface packages | None | Bundled at build time | Fonts are vendored into the bundle, not fetched at runtime |

## Explicitly not present

Recorded because their absence is a design decision, not an oversight:

| Not used | What it would have held |
| --- | --- |
| Any live payment provider | Card data, bank details |
| Any SMS provider | Phone numbers, OTP codes |
| Any email provider | Email addresses, message content |
| Any push provider (live) | Device tokens, notification payloads |
| Any analytics SDK | Behavioural events |
| Any crash-reporting SDK | Stack traces, device identifiers |
| Any advertising or attribution SDK | Advertising identifiers, install sources |
| Any map or geocoding service | Addresses, coordinates |
| Any AI or ML service | Anything sent for inference |

**No payment provider is enabled.** WPS-015 built the provider-neutral boundary
and every provider registry row is `mock` or `sandbox`. No card number, bank
number, or wallet identifier has ever left Warsha, because none is stored — only
masks.

Push registration exists as a WPS-014 boundary with tokens stored hashed and
encrypted, but no live push provider is configured.

## What each party can actually see

### Supabase

Everything, subject to the same RLS the application uses — with one exception
that matters: **a holder of the service-role key bypasses RLS entirely.**

Controls in place:

- the service-role key appears in no client bundle (asserted by
  `npm run audit:secrets` across every tracked file and commit);
- no client code path uses it (asserted by `test:wps022` across every privacy
  module and screen);
- the `private` schema holds **no grant** to `anon` or `authenticated`, so even
  a leaked anon key reaches none of the registries, holds, audit, or inventory;
- `TRUNCATE`, `REFERENCES` and `TRIGGER` have been revoked from both client
  roles on every `public` table — leftover Supabase bootstrap grants that
  `TRUNCATE` in particular made dangerous, since it bypasses RLS.

### Expo

The app is built from source and shipped as a binary. Internal Preview builds
may request and download application-code updates from Expo's isolated
Preview channel. Those requests do not carry Warsha account, booking, message,
document, or payment payloads. Production OTA delivery remains disabled.

## Data location

All personal data resides in the Supabase project's configured region. Warsha
performs no cross-border transfer of its own. **Whether the configured region
satisfies any Egyptian data-residency requirement is unresolved** (Q-09).

## Change control

Adding a subprocessor is not a code change. It requires:

1. an entry in this register, stating exactly what data it can hold;
2. a classification of that data against
   [WARSHA-DATA-CLASSIFICATION](WARSHA-DATA-CLASSIFICATION.md);
3. a decision on whether a consent purpose is needed, or whether existing
   purposes cover it;
4. a retention rule if it stores anything;
5. legal review of the arrangement.

A subprocessor added without all five is an undocumented data flow, which is the
condition this register exists to prevent.
