# Decision — Three legal titles keep the word Worker

| Field | Value |
| --- | --- |
| Date | 2026-09-11 |
| Status | **Decided** — owner decision, recorded rather than inferred |
| Scope | `worker_terms`, `worker_verification_policy`, `worker_code_of_conduct` at version 1.0 |
| Enforced by | `scripts/user-copy-audit.mjs` (`the role noun`, `legalArtifact`) |

## The decision

The standing terminology rule is that Warsha says **Professional** to a user in
English, **صنايعي** in Arabic and **Professionnel** in French. `worker` may stay
in routes, schema, events and code.

Three published English legal documents are a deliberate, versioned exception:

- Worker Terms and Conditions
- Worker Verification Policy
- Worker Code of Conduct

They keep those exact titles **for their current versions**. Arabic and French
already use the professional noun, so English is the outlier, and it stays the
outlier until those documents are next legitimately versioned.

## Why

`hashableParts()` in `src/legal/legal-corpus.ts` puts `body.title` first:

```ts
const parts: string[] = [body.title, body.summary];
```

The title is therefore inside the canonical document hash. Acceptance records
store `document_hash`, and the migration that defines them carries a trigger
asserting `new.document_hash = old.document_hash` — the column is immutable by
construction, which is the point of it.

Renaming a title in place would change the hash, which would change what every
existing acceptance record points at. The consent already given by every
professional who has accepted these agreements would no longer match the text
on file. Triggering renewed consent across the professional base to tidy up a
noun is not a trade worth making, and silently invalidating it is not an option
at all.

## What is queued

At the next legitimate version or review of these documents, rename coherently:

- Professional Terms and Conditions
- Professional Verification Policy
- Professional Code of Conduct

That release must audit the whole English corpus — 24 occurrences of `Worker` as
of this decision, including cross-references inside other documents, such as
"A separate agreement, the Worker Terms and Conditions, governs anyone offering
work through Warsha" in the customer terms — and must carry:

- explicit new document versions
- new canonical hashes
- truthful effective-date and version metadata
- the acceptance or re-acceptance behaviour that the change actually requires
- no fabricated legal review or approval

Legal review may remain **pending** until it has actually been performed. This
document does not assert that it has.

## No display-label lie

The UI must not show `Professional Terms and Conditions` as a cosmetic alias
while the accepted artifact is still titled `Worker Terms and Conditions`.
Wherever the product refers to the current legal artifact — the compact controls
on `/create-account`, the consent sentence on the application's signup form, the
legal centre — it renders the exact published title from the corpus, and will
keep doing so until the title itself changes in a new version.

The exception is documented here instead of being hidden behind a label.

## How the audit knows the difference

`scripts/user-copy-audit.mjs` flags `worker` in user-facing copy under **the
role noun**. Its exemption is deliberately not a pass for the word: it removes
the three exact published titles from a string and then asks whether `worker`
still appears.

| String | Exempt | Why |
| --- | --- | --- |
| `I agree to the Worker Verification Policy.` | yes | a reference to a versioned artifact |
| `Worker Code of Conduct` | yes | the artifact's exact published title |
| `Your worker dashboard` | no | ordinary product UI — fixed to `professional` |
| `Choose Worker to continue` | no | signup copy |
| `Accept the Worker Terms and Conditions to become a worker` | no | one reference, one leak; the leak still counts |

Ordinary product UI, signup, onboarding, navigation, help text, marketing,
errors, settings and non-versioned explanatory copy are all outside the
exception and are held to the standing rule.
