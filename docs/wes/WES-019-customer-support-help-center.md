# WES-019 — Customer Support, Help Center & Knowledge Management (engineering baseline)

| Field | Value |
| --- | --- |
| Version | 1.0 |
| Status | **ENGINEERING BASELINE — MANUAL AND HOSTED DEPLOYMENT GATED** |
| Authority | Subordinate to the Constitution, WPS-001 through WPS-018, and WPS-019 |
| Migration | `supabase/migrations/202608040001_wps019_customer_support_help_center.sql` |

---

## 1. Extension strategy

WPS-019 touches five existing systems and rebuilds none of them.

| System | Owner | How WPS-019 extends it |
| --- | --- | --- |
| Support cases | WPS-017 | Additive columns; a new 8-argument `open_support_case` overload |
| Notifications | WPS-014 | A tenth category, a thirteenth route type, ten catalog rows |
| Staff operations | WPS-017 / WPS-018 | The existing capability and gate; a support-specific view |
| Storage | WPS-013 pattern | A new private bucket following the same three-part shape |
| Rate limiting | WPS-018 | Five new policies on the existing limiter |

## 2. The intake overload

`public.open_support_case(text,text,text,text)` is the WPS-018 rate-limiting
wrapper around `private.open_support_case_impl`. It is **not modified**.

WPS-019 adds `public.open_support_case(text,text,text,text,text,uuid,text,text)`
which validates the linked record and the surface, applies the same limiter
policy, then calls the **same preserved implementation**, then applies the
WPS-019 context to the created row.

The overload declares **no default values**. That is load-bearing: with defaults
on parameters five through eight, a four-argument call would become ambiguous
and every existing caller and test would fail with `function is not unique`.

Consequences asserted in pgTAP:
- `public.open_support_case` has exactly two signatures.
- `private` contains exactly 30 `_impl` functions — the WPS-018 count, unchanged.
- The four-argument call still resolves and still works.

## 3. Lifecycle by trigger, not by RPC

Service levels, first-response stamping, and notifications are applied by
triggers on `support_tickets` and `support_messages`:

| Trigger | Timing | Does |
| --- | --- | --- |
| `support_tickets_sla_defaults` | BEFORE INSERT | Locale, requester mode, both SLA due dates |
| `support_tickets_opened_notify` | AFTER INSERT | Notifies the requester |
| `support_tickets_lifecycle_notify` | AFTER UPDATE | Resolution, reopen, survey, assignment (both sides) |
| `support_messages_lifecycle` | AFTER INSERT | Stamps first response; notifies the counterpart |

This is why the four untouched WPS-017 RPCs — `open_support_case`,
`reply_support_case`, `staff_transition_support_case`, `staff_add_support_note` —
gain the entire WPS-019 lifecycle without a single line of their bodies being
rewritten. It also makes it structurally impossible to send a staff reply
without stopping the first-response clock.

## 4. The staff gate

WPS-019 uses `private.require_staff_capability` and a new
`private.require_support_staff_write`, **not** `private.require_domain_staff`.

This was found during implementation and is worth recording. `require_domain_staff`
exists to preserve the pre-WPS-017 `is_staff()` behaviour for legacy RPCs, and a
WPS-017 support agent deliberately does **not** satisfy it: the agent holds
`manage_support_cases` and specifically not `legacy_domain_staff_actions`.
Gating new support functions on the legacy gate would have locked the support
role out of support — the first pgTAP run failed exactly that way.

`require_support_staff_write` composes the capability gate with the WPS-018
`staff_privileged_action` limiter, mirroring `require_domain_staff_write` on the
WPS-017-native model.

## 5. Search implementation

```
search_vector = setweight(to_tsvector('simple', title),   'A')
             || setweight(to_tsvector('simple', summary), 'B')
             || setweight(to_tsvector('simple', body),    'C')
```

Stored generated column, GIN indexed, plus a trigram GIN index on title.

`simple` for both locales: Postgres ships no Arabic stemmer, so stemming English
only would make relevance asymmetric between the two languages Warsha ships.

The approximate pass uses `extensions.word_similarity(query, text)` rather than
`similarity(a, b)`. This also came out of a failing test: `similarity` compares
whole strings, so a six-character typo scored 0.19 against "How payments work"
and never matched. `word_similarity` scores the query against the best matching
word extent and scored 0.571 for the same input, cleanly separated from the 0.286
of an unrelated article. Threshold 0.5.

## 6. Storage

Bucket `support-attachments`: private, 8 MB, `image/jpeg`, `image/png`,
`image/heic`, `application/pdf`.

Path: `<uploader>/<case>/<file-id>.<ext>`, matched by regex in the INSERT policy
and again in the registration RPC, and refused if it contains `..`, `//`, or a
backslash.

Three-part enforcement, same as WPS-013:
1. The INSERT policy binds path to caller, case ownership, and case status, and
   checks `metadata->>'mimetype'` and `metadata->>'size'` at policy level.
2. `register_support_attachment` re-reads the object from `storage.objects` and
   verifies owner, MIME, size, and path. The client's claim about its own upload
   never authorizes anything.
3. The SELECT policy grants only a **registered** object on a visible case; the
   DELETE policy permits an uploader to remove only an **unregistered** orphan.

The repository deletes the orphan itself if registration fails, so a failed
attach leaves nothing behind.

## 7. Client architecture

| File | Role |
| --- | --- |
| `src/support/support-types.ts` | Contracts, limits, path builder, surface mapper — all pure |
| `src/support/support-repository.ts` | Mock and Supabase, fully isolated, no fallback |
| `src/support/mock-support-state.ts` | Per-account Mock store and the parity corpus |
| `src/support/support-translations.ts` | English and Egyptian Arabic, same key set |
| `src/support/support-context.tsx` | Account-isolated state with generation guarding |
| `app/help/*` | Help Center, category, article |
| `app/support/*` | Case list, contact form, case thread |
| `app/admin/support.tsx` | Staff queue, macros, resolution, service levels |

Every permission the case screen renders — `canReply`, `canReopen`, `canAttach`,
`surveyAvailable` — comes from the server. The client never computes a reopen
window for itself.

## 8. Mock parity, stated precisely

Mock carries the same 12 categories and the same 29 article slugs in both
locales, with the same surface and tag metadata driving the same context-aware
ordering, and the same four search outcomes.

Article **bodies** are abbreviated and say so in the file. Shipping a second copy
of the prose would guarantee the two drift apart silently. Staff actions raise in
Mock rather than pretending to succeed.

Every Mock read and write is keyed by account. A case belonging to another key is
not found, which is the same outcome RLS produces in Supabase mode.

## 9. Notification integration

Constraint widenings on `notifications`, `notification_event_catalog`, and
`notification_preferences` add `support` and `support_case`. WPS-017 had already
added `case_id` to the UUID payload allowlist and already resolves it as a
resource id, so neither the allowlist nor the resource resolver needed to change.

`public.get_my_notifications` and `public.resolve_notification_route` were
replaced in full with one added branch each — the category allowlist and the
`support_case` route. Both were verified against the WPS-014 suite, which passes
unchanged.

`support_case_replied` and `support_case_resolved` are `mandatory_in_app`: a
reply from Warsha cannot be silenced by a category preference.

## 10. Open engineering items

- No SLA breach emitter. `staff_support_sla_breach` is catalogued; the WPS-014
  scheduler that would fire it is disabled, so nothing emits it.
- Attachment upload has no UI yet. The repository, the RPC, the bucket, and the
  policies are complete and tested; the case screen renders existing attachments
  but has no picker. This is recorded rather than hidden.
- Article authoring has no staff UI. `staff_upsert_help_article` and
  `staff_set_help_article_status` exist and are tested; there is no editor screen.
- Merge has no staff UI. The RPC exists and is tested.
- Search relevance is untuned against real queries, because none exist.
