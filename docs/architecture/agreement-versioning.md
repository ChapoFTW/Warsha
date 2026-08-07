# Agreement versioning — WPS-024

## What a version is

A version is an immutable snapshot of words with a number, two dates, a
classification and two hashes.

```sql
document_key       text
version            text        -- major.minor
content_hash_en    text        -- sha256 of the canonicalised English
content_hash_ar    text        -- sha256 of the canonicalised Arabic
content_locator    text        -- where the words actually live
published_at       date
effective_at       date        -- may be later than published_at
supersedes_version text        -- null only for `initial`
change_class       text        -- initial | editorial | non_material | material | urgent
change_summary_en  text
change_summary_ar  text
arabic_is_summary  boolean
status             text        -- draft | published | superseded | withdrawn
```

## Published and effective are different dates

`legal_current_version` filters on `effective_at <= current_date`. A version can
be published today and take effect next month; until it does, the previous
version governs and is what people are asked about.

This is the mechanism that makes a material change humane: publish, tell
people, let them read it, and only then start asking.

> A defect found during implementation: the corpus was originally dated three
> days ahead of the publication date, so **no version was ever effective** and
> the obligations call returned nothing. Corrected to the actual date.

## One published version at a time

```sql
create unique index legal_document_versions_single_published_idx
  on public.legal_document_versions (document_key)
  where status = 'published';
```

Two would make "the current version" ambiguous, and every re-consent decision
downstream reads that phrase. `staff_publish_legal_version` supersedes the
predecessor **before** publishing the successor, because the other order
collides with this index — and that collision is the index doing its job.

## Change classes

| Class | Meaning | Re-consent | May restrict |
| --- | --- | --- | --- |
| `initial` | First version; nobody has ever accepted it | yes | no |
| `editorial` | A typo, a clearer sentence, a renumbered clause | **no** | no |
| `non_material` | A clarification that changes no right or obligation | **no** | no |
| `material` | Changes rights, obligations, payments, data processing, dispute handling, eligibility, suspension or liability | yes | yes |
| `urgent` | Required immediately for safety or by law | yes | yes (immediately) |

The class is recorded at publication and is **immutable afterwards**. It cannot
be downgraded to avoid asking, and it cannot be upgraded to force an ask.

### Why editorial changes do not trigger re-consent

Because asking for consent to a corrected comma teaches people to tap past the
ones that matter. The Version History says this to readers in as many words,
and the migration enforces it by class rather than by policy.

## What the publishing function refuses

`staff_publish_legal_version` requires the `publish_legal_version` capability,
which carries **dual control** and re-authentication. It then refuses:

- an unknown document;
- a version that is not `major.minor`;
- a duplicate version;
- an unknown change class, or `initial` (a document has exactly one);
- an effective date in the past;
- a **material or urgent change with a change summary under twenty characters**;
- publishing when there is no current version to supersede.

The table refuses more, independently of the function:

- a non-initial version with `supersedes_version` null, and an initial version
  with one — enforced as `(change_class = 'initial') = (supersedes_version is null)`;
- `effective_at < published_at`;
- a material or urgent version with an empty summary in either language.

Belt and braces on purpose: the function is the front door, and the constraint
is what holds if somebody finds another way in.

## Immutability

```
draft ──→ published ──→ superseded
  │            │
  └──→ withdrawn ←┘
```

`status` may move forward. Nothing else may move at all, and `DELETE` is
refused. A version somebody accepted cannot be deleted, because deleting it
orphans every acceptance that names it.

The trigger checks column-by-column rather than trusting a flag, so an update
that changes `status` **and** the hash in one statement is refused.

## Publishing a new version, end to end

1. Edit the text in `src/legal/legal-corpus-*.ts`.
2. Decide the change class. This is a judgement, and it is the one that
   matters: consult [the decision log](../testing/WPS-024-DECISION-LOG.md).
3. Bump `version`, set `supersedesVersion`, write both change summaries.
4. Recompute the hashes from the corpus.
5. Write a migration that inserts the version with the new hashes.
6. Run `npm run test:wps024` — it fails if the corpus and register disagree.
7. Run the pgTAP suite.
8. Ship. The register and the words move together or not at all.

There is no publish button in the admin surface, and that is deliberate rather
than unfinished. A button would produce a register row pointing at text that
does not exist, because steps 1 and 4 cannot happen from a phone screen.

## The acceptance hash

```
sha256(user_id | document_key | version | content_hash | language | instant)
```

Recomputable from the row plus the register, so a tampered row is **detectable**
rather than merely unlikely. It is computed with `pg_catalog.sha256` over
`convert_to(..., 'UTF8')` — both core, needing no extension, unlike `digest()`
which lives in `extensions` and is not guaranteed present.

## Related

- [Legal architecture](./legal-architecture.md)
- [Document lifecycle](./document-lifecycle.md)
