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
