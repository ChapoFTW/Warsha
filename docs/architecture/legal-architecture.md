# Legal architecture — WPS-024

## The question this architecture answers

*What did this person agree to, and can we still prove it?*

Everything below follows from taking that question literally. A system that can
only answer "they accepted the terms" has not answered it, because "the terms"
is not a thing — it is whatever text happened to be on the server that day.

## The chain

```
  src/legal/legal-corpus-*.ts          the words, in the repository
              │
              │  sha256(canonicalText(title, summary, headings, body, bullets))
              ▼
  public.legal_document_versions       content_hash_en, content_hash_ar
              │                        + published_at, effective_at,
              │                          change_class, supersedes_version
              │
              │  the client sends the hash of what IT rendered
              ▼
  accept_legal_document(...)           compares, refuses on mismatch
              │
              ▼
  public.legal_acceptances             user, document, version, language,
                                       rendered_hash, acceptance_hash, instant
```

Each arrow is enforced. The first by two test suites, the second by the server
function, the third by an append-only trigger.

## Signup is part of the same chain

Customer and worker registration use the same corpus and ledger; there is no
signup-only boolean consent store. The unchecked client controls build a
role-scoped manifest containing only document key, exact version, displayed
language and the bundled rendered hash. Customers name Customer Terms and
Privacy Policy. Workers name Worker Terms, Privacy Policy and the separately
versioned Worker Verification Policy.

For customer email/password signup, that manifest is transient Auth metadata.
For worker phone/password signup, the trusted worker broker validates its shape
and forwards it as transient Auth metadata. A before-insert trigger lifts the
manifest out of the metadata and carries it through the statement in a
transaction-local setting keyed by user id, so the stored Auth row never holds
it. The after-insert trigger then:

1. obtains the current required documents from the published register;
2. refuses missing, duplicate, wrong-audience, stale-version or hash-mismatched
   evidence inside the account-creation transaction; and
3. appends one immutable `legal_acceptances` row per required document using
   the database clock and the resolved platform environment.

Removing the manifest *before* the row is stored, rather than after, is the
part that had to be corrected. Hosted Auth creates the user and then updates
that same row from its own in-memory copy of the metadata; an after-insert
removal was silently undone by that write-back, and three SHA-256 values rode
along in every issued JWT. The isolation trigger therefore also fires on
update, so no later write-back can reinstate what a signup only ever needed
once.

The client never supplies the acceptance timestamp. Customer email
confirmation can happen later; the legal evidence is already bound to the
account created by the signup request. Worker registration cannot bypass the
ledger through its synthetic-email boundary.

Location Data Policy remains readable from the same viewer but is not included
in either mandatory signup manifest. Device location permission remains a
separate operating-system decision, and this integration changes no provider
or Maps activation state.

## Why the text is not in the database

Three reasons, in order of weight.

1. **Reviewability.** Thirty thousand words of legal prose inside a SQL file
   cannot be reviewed, and a diff of it is unreadable. A lawyer reads
   `legal-corpus-agreements.ts` and sees prose.
2. **Cost of correction.** With the text in the database, fixing a typo is a
   migration. With it in the repository, it is an edit plus a recomputed hash —
   and the *materiality* system decides whether anyone needs to re-accept.
3. **A single copy.** The reader renders the bundle. If the server also served
   the text, there would be two copies that could disagree, and the hash would
   be a formality rather than a binding.

The cost is that the corpus and the register can drift. That cost is paid by a
test that fails when they do, which is the correct place to pay it.

## Why the reader is offline

`app/legal/document/[key].tsx` fetches nothing. Consequences:

- it works signed out, so somebody can read the terms before creating an
  account, without Warsha opening an anonymous data surface;
- it works offline, which matters for the document people most often reread
  while arguing about a booking;
- **WPS-023's nine sanctioned signed-out reads stay nine.** WPS-023 section 0
  closed that surface after finding fifteen `public` functions reachable by
  `anon` through a residual `PUBLIC` grant. Reopening it to serve data the
  client already has would have spent a real security property on nothing.

## Table layout

| Table | Schema | Client access | Why |
| --- | --- | --- | --- |
| `legal_documents` | `public` | select | Which documents exist, and who they address |
| `legal_document_versions` | `public` | select | Immutable versions; the hash an acceptance names |
| `legal_acceptances` | `public` | select **own rows only** | The ledger |
| `legal_version_events` | `private` | none | Who published what, and when |
| `subprocessors` | `private` | none | Suppliers, and whether they are actually in use |
| `processing_activities` | `private` | none | Activities, purposes, proposed bases |
| `ai_use_declarations` | `private` | none | Declared ML uses and their hard limits |
| `legal_configuration` | `private` | none | Enforcement switches |

Two tables, not one, for documents and versions. A document is a stable thing
with a key and an audience; a version is an immutable snapshot of words.
Collapsing them means either losing history on republication or duplicating the
audience on every row and letting the two drift.

## Writes

There is exactly one path into `legal_acceptances`, and no client can take it
directly:

```sql
revoke all on table public.legal_acceptances from public, anon, authenticated;
grant select on table public.legal_acceptances to authenticated;
```

`revoke all` first is not decoration. Supabase's default privileges hand new
`public` tables everything — including TRUNCATE, REFERENCES and TRIGGER — and
`grant select` is additive. WPS-022 asserts the absence of those privileges
across every public table as a property, and it caught exactly this.

## Immutability

`legal_document_versions` permits one kind of update: `status` moving forward
(`draft → published → superseded|withdrawn`). Every other column is frozen, and
`DELETE` is refused outright. A version somebody accepted cannot be deleted,
because deleting it would orphan every acceptance that names it.

`legal_acceptances` permits **no** update at all. WPS-022's consent trigger
allows one — stamping `withdrawn_at` on a grant that has ended — but an
acceptance has no equivalent. A later decision is a new row. The earlier
acceptance remains true as a statement about a moment, and nothing about it
ever needs to change.

## What staff can see

`staff_legal_governance_overview` returns counts and register state. It cannot
return an identity, and that is asserted by searching its own body for
`user_id`, `email` and `phone`. A reviewer establishing that eleven workers
declined the new Worker Terms has no business knowing which eleven.

## Related

- [Consent architecture](./consent-architecture.md)
- [Agreement versioning](./agreement-versioning.md)
- [Document lifecycle](./document-lifecycle.md)
- [Privacy architecture](./privacy-architecture.md)
