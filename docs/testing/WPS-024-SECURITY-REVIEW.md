# WPS-024 — Security review

**No penetration test has been performed and none is claimed.** This is a
design review against a threat model, followed by the assertions that hold each
control in place.

---

## Threat model

The assets WPS-024 introduces are unusual: the acceptance ledger is not
valuable to steal, it is valuable to **forge**. Almost every threat below is
about integrity or repudiation rather than confidentiality.

| # | Threat | Impact | Control | Asserted by |
| --- | --- | --- | --- | --- |
| T-01 | A client records an acceptance of text it never displayed | Consent record is fiction | Server compares `rendered_hash` against the register | pgTAP: *an acceptance of text the client did not display is refused* |
| T-02 | A stale app bundle accepts an outdated version | Person bound to text they did not see | Client hashes its own bundle; mismatch is refused loudly | pgTAP + regression: repository does not echo the server hash |
| T-03 | A published version is edited after acceptance | Every acceptance now names different words | Column-by-column immutability trigger | pgTAP ×3 (hash, class, effective date) |
| T-04 | A version is deleted | Acceptances orphaned | `DELETE` refused | pgTAP |
| T-05 | A decline is rewritten as an acceptance | Manufactured consent | Append-only trigger, no exceptions | pgTAP |
| T-06 | Inaction becomes consent | Manufactured consent | No third decision value; no timer | Regression: absence of `set decision =`, `decision = case`, `interval '… days'` |
| T-07 | A client writes the ledger directly | Forged acceptance | `revoke all` then `grant select`; RLS | pgTAP ×2 |
| T-08 | One account reads another's acceptances | Disclosure | RLS `user_id = auth.uid()` | pgTAP ×2, as `authenticated` |
| T-09 | Staff learn **who** declined | Chilling effect on a free choice | Overview returns counts; cannot return identity | pgTAP on the function body |
| T-10 | Signed-out surface widens | Erodes WPS-023 §0 | Nothing granted to `anon` | pgTAP ×4, regression ×1 |
| T-11 | A material change ships with no summary | Nobody can read what changed | Function check **and** table constraint | pgTAP ×2 |
| T-12 | A material change is downgraded to avoid asking | Silent erosion of rights | `change_class` immutable after publication | pgTAP |
| T-13 | Identity data reaches a training pipeline | Irreversible; consent never given | `CHECK` constraint | pgTAP: `UPDATE` raises `23514` |
| T-14 | Human confirmation switched off | Automated adverse decisions | `CHECK (human_confirmation_required)` | pgTAP |
| T-15 | A subprocessor processes identity data with no training bar | Contractual gap | `CHECK` on the register | pgTAP |
| T-16 | System grants itself a decision, not just a capability | Automated approval | `system` cannot reach `active`/`approved`/`rejected`/`suspended` | pgTAP ×5 |
| T-17 | A worker activates themselves | Unvetted worker in a home | Worker cannot reach `provisionally_active` | pgTAP |
| T-18 | Provisional activation bypasses gates | Incomplete worker takes jobs | Gate check before transition; silent refusal | pgTAP ×2 |
| T-19 | Kill switch stops only the slow path | Stop control that does not stop | `worker_activation` switch governs both tiers | Regression |
| T-20 | A ledger row is tampered with in the database | Undetectable forgery | `acceptance_hash` recomputable from row + register | Design; see below |
| T-21 | Notification leaks a document key, hash or offence | Disclosure via push | Payloads carry a state only | pgTAP ×2, regression ×1 |
| T-22 | WPS-024 tables published to Realtime | Broadcast disclosure | Not published | pgTAP |

---

## The controls worth explaining

### `revoke all` before `grant select`

Supabase's default privileges hand new `public` tables **everything** to the
client roles — including `TRUNCATE`, `REFERENCES` and `TRIGGER`. `grant select`
is additive and leaves all of it in place.

WPS-022 asserts the absence of those privileges across every public table as a
property. It caught this: three tables created here failed until the revokes
were added. This is the second time in two specifications that a property
assertion has caught something a behavioural test could not see.

### Nothing granted to `anon`

The first draft granted the register to `anon`, reasoning that a person must be
able to read the terms before creating an account. They can — the corpus is
bundled and the reader makes no call at all. What `anon` would have gained is
version metadata that only matters to accounts.

WPS-023 section 0 closed the signed-out surface after finding fifteen `public`
functions reachable by `anon` through a residual `PUBLIC` grant that
`revoke … from anon` could not remove. Spending that on data the client already
holds would have been a bad trade.

### Tamper detection on the ledger

`acceptance_hash = sha256(user | document | version | content_hash | language | instant)`

Every input is either in the row or in the register. Somebody with direct
database access who alters a row can be **detected** by recomputation. This is
not tamper-proofing — an attacker with write access can recompute the hash too
— but it converts silent alteration into alteration that has to be done
carefully, and it means an audit has something to check.

### `set local role authenticated` in the pgTAP suite

The suite initially ran as a superuser after its fixtures. RLS was bypassed, so
T-07 and T-08 passed **by not being tested**. Fixed; the isolation block now
runs as `authenticated` and the immutability block explicitly resets to
`postgres` first.

This is worth recording because it is a failure mode that produces a green
suite and no security.

---

## Provider credential review

Six claims, each with the evidence that supports it. All were re-executed after
the provider abstraction landed.

| # | Claim | Evidence | Result |
| --- | --- | --- | --- |
| C-01 | No service account exists in any client bundle | `grep` for `GOOGLE_CLOUD_VISION_SERVICE_ACCOUNT`, `"private_key"`, `-----BEGIN`, `service_account` across three cache-cleared exports | **Absent from all three** |
| C-02 | No private key exists in the repository | `audit:secrets` over the working tree and the commit history | **Clean** |
| C-03 | No server secret hides behind `EXPO_PUBLIC_*` | Regression suite reads `app.json` and every client source, allowlisting only the two publishable Supabase names | **Asserted** |
| C-04 | The Maps render key is documented as intentionally public and restricted | Registry notes, [External Provider Registry](../architecture/external-provider-registry.md), [setup runbook](../operations/google-cloud-setup-runbook.md) | **Documented in three places** |
| C-05 | The server key remains backend only | `readSecret('mapsServerKey')` appears only in `google-maps-provider.ts`; every client call goes through `location-proxy` | **Asserted** |
| C-06 | No Google API key of any kind is committed | `AIza[0-9A-Za-z_-]{35}` across `app.json`, all sources and all three exports | **No match** |

### The credential boundary

Every external credential Warsha holds is read in `provider-secrets.ts` and
nowhere else. Three properties, enforced by construction rather than convention:

1. **Read at call time.** A credential is never a module constant, so it cannot
   be captured into a build artefact. Asserted:
   `!/^const\s+\w+\s*=\s*Deno\.env\.get/m`.
2. **A missing credential returns `null`.** Never a default, a demo key, or an
   empty string that a provider rejects with a confusing error. The caller
   reports unavailable and the person gets the manual path.
3. **`describeSecrets()` returns names and presence, never values.** Existence
   is not sensitive; the value is. This is what lets the staff registry say
   `GOOGLE_MAPS_SERVER_KEY: not configured` with no path existing that could say
   what it is.

`redact()` strips `?key=`, `Bearer`, PEM blocks, `"private_key"` and JWT shapes
from anything before it is returned or logged. Google echoes the request URL in
some error bodies, and logging a provider error verbatim is the single most
common way a key reaches a log aggregator.

### Two keys, two natures — restated because it is the likeliest mistake

The Maps **render** key must reach the device: the native SDK reads it from the
app manifest and there is no server-side way to draw a map on a phone. It is
**publishable**, in the same category as the Supabase anon key, and protected by
*restriction* — package name plus signing fingerprint, scoped to rendering only.
Extracted from a bundle it is useless to anyone whose application is not signed
with Warsha's certificate.

The Maps **server** key is a genuine secret. Places and Geocoding are billed per
request and offer no package restriction to a server-side caller, so a copy on a
device lets anyone spend Warsha's budget until it is rotated. Keeping it off the
device is the entire reason `location-proxy` exists.

Only the server key is named in `credential_secret_name`, because only the
server key is a secret. A database constraint enforces the general rule:

```sql
constraint external_providers_device_secret_check
  check (execution_context <> 'device' or credential_secret_name is null)
```

### The abstraction did not widen anything

| Question | Answer |
| --- | --- |
| Does the registry expose a secret value? | No. `staff_provider_registry()` returns `credentialSecretName`, and pgTAP asserts the body cannot return a value |
| Does provider health expose a secret? | No column named for a credential exists; asserted in pgTAP and the regression suite |
| Does provider health expose a person? | No account, worker, document or extracted value column exists. This is the control that stops an operations screen becoming a second route to identity data |
| Does the render descriptor leak the server key? | It reports only that a publishable render key is *required*. The value never passes through the proxy |
| Is any new function anon-executable? | No. `staff_provider_health()` is `authenticated` + capability; WPS-023's nine sanctioned signed-out reads are still nine |

### Two findings from this pass

**A stack overflow on every real photograph.** `btoa(String.fromCharCode(...bytes))`
spreads every byte as a function argument, and V8 throws `RangeError` above
roughly 100,000 of them. The reduced review copy of an identity card is
comfortably larger, so the spread form would have failed on every genuine
submission while passing every small test fixture. Not a security defect, but a
denial of the feature to 100% of users that no structural test could see. Fixed
by chunked encoding and asserted.

**Three columns the extraction path writes did not exist.**
`private.worker_identity_extractions` had no `document_type`, `document_hash` or
`is_current`. Every successful extraction would have failed at the insert —
provider called, audit row written, candidates on screen, nothing persisted for
the worker to confirm. `is_current` is the one with a security consequence:
without supersession a worker could confirm a field extracted from a photograph
they had already discarded. Added, with a partial unique index enforcing one
current candidate per field per side.

Both were invisible to source-reading tests and would have been found only by a
live run against a credential that does not exist in this environment.

---

## Residual risks

| # | Risk | Why it is accepted | Mitigation |
| --- | --- | --- | --- |
| R-01 | A worker takes jobs before human review | Locked product decision; waiting costs honest workers income | Profile does not claim verified; post-review suspension is immediate; every gate except staff decisions still applies |
| R-02 | Warsha owns a SHA-256 implementation | No portable alternative across three runtimes | Exhaustive 0–320 sweep against `node:crypto`; server pinned to the same digest |
| R-03 | The corpus and register can drift | Cost of keeping text reviewable | Both suites fail on drift |
| R-04 | No lawful basis is confirmed | No advice obtained | Recorded as pending, asserted; a legal-review item, not an engineering one |
| R-05 | Fourteen Arabic summaries are not full translations | Quality bar on binding translation | Disclosed on the page; all four accepted documents have full Arabic |
| R-06 | Re-consent enforcement is untested in anger | Ships off | Kill switch exists; WPS-025 owns the manual walk |
| R-07 | No penetration test, no certification | None has been commissioned | Stated in the Incident Response and Security Disclosure policies rather than omitted |
| R-08 | The Maps render key is in the shipped bundle | Unavoidable: the native SDK reads it from the app manifest | Restricted by package name and signing fingerprint, scoped to rendering only, no billed API enabled on it, budget alert on the project |
| R-09 | No provider credential has ever been exercised | None exists in this environment | Every path covered by structural and behavioural assertions; two defects found by this pass would have been caught only by a live run, so more are plausible |
| R-10 | Provider health has never been observed against a real vendor | Same as R-09 | Recording is exercised in pgTAP against the database; the vendor half is unmeasured |

---

## Not claimed

- No penetration test.
- No security certification of any kind.
- No compliance finding under any statute.
- No physical-device acceptance.
- No legal review of any document in the corpus.
