# Consent architecture — WPS-024

## Two ledgers, two questions

Warsha has two consent records and neither subsumes the other.

| | `privacy_consent_records` (WPS-022) | `legal_acceptances` (WPS-024) |
| --- | --- | --- |
| Answers | Did this person consent to this **purpose**? | Which exact **text** did they agree to? |
| Granularity | One row per purpose decision | One row per document version decision |
| Lifetime | A purpose outlives many document versions | A version covers several purposes |
| Withdrawal | A new row; the grant is stamped `withdrawn_at` | A new row; nothing is ever stamped |
| Binds to | A purpose key and a version string | A content hash, a language and an instant |

WPS-022 built the seam: `privacy_consent_purposes` already carried a
`document_key` and a `current_version`. It had no documents behind it. WPS-024
supplies them and keeps the two in step — `accept_legal_document` moves the
matching purpose to the accepted version, so the privacy centre and the legal
centre cannot disagree about what somebody agreed to.

**No parallel consent system was created.** `record_my_consent` is untouched.

## What an acceptance records

```
user_id            who
document_key       which document
version            which version
decision           accepted | declined        ← no third value
accepted_language  which text they READ
rendered_hash      the hash the client says it displayed
acceptance_hash    sha256(user|doc|version|content_hash|language|instant)
source_surface     where they were when they decided
account_role       what they were at the time
environment        local | staging | production
accepted_at        clock_timestamp(), not now()
```

`accepted_language` matters because English governs where the two texts
disagree. If a difference is ever found, it must be knowable which text was in
front of the person.

`clock_timestamp()` rather than `now()`: `now()` is the transaction start, so
two acceptances recorded in one transaction would share a timestamp and their
order would fall back to a uuid tiebreak. A history whose order depends on a
uuid is not a history. WPS-023 established this and WPS-024 follows it.

## The rendered hash

The client computes the hash of the text **it** rendered, from its own bundle,
and sends that. The server compares it with the register.

The alternative — reading the hash from the server and echoing it back — would
make the check a formality. The point is that a stale bundle produces a stale
hash and is refused, loudly, rather than recording an acceptance of a version
the person never saw. The regression suite asserts the repository does not echo
(`!/p_rendered_hash:\s*(data|register|server|remote)/`).

Mock enforces the same rule and throws on mismatch. A Mock that accepted
anything would let this class of bug through in the one mode a developer looks
at every day.

## Declining

`decision` is `accepted` or `declined`. There is deliberately no third value —
nothing that could be read as "probably agreed", and no timer anywhere that
converts inaction into consent.

Absence is asserted by looking for the **machinery**, not for words:

```ts
check(!/set\s+decision\s*=\s*'accepted'/i.test(migration), …);
check(!/decision\s*=\s*case/i.test(migration), …);
check(!/interval\s*'\s*\d+\s*(day|month|year)/i.test(migration), …);
```

WPS-023 learned why: a seeded policy note reading *"no automatic rejection rule
is implemented"* satisfied a search for `automatic reject`. A data string
asserting an absence is not evidence of that absence, exactly as a comment is
not.

### What a decline costs

`decline_legal_document` returns the consequences, derived from the change
class:

- `material` / `urgent` → the functionality the change is about;
- everything else → **an empty list**.

An editorial change someone declined costs them nothing, and the screen must
not pretend otherwise.

It also returns `alwaysAvailable` — records, export, support, appeals, account
closure — so the screen showing a consequence also shows what survives it. A
screen that lists only losses is an argument, not a choice.

## The consent screen

`app/legal/consent.tsx`. Rules, all of them about not being coercive:

1. **"I do not agree" is a real button**, the same size as the other one. A
   decline that has to be hunted for is a decline that gets tapped past.
2. **Consequences come from the server**, not from the screen. A screen that
   computed its own could overstate them, and an overstated consequence is
   coercion.
3. **What survives is shown next to what stops.**
4. **Nothing is recorded** by arriving, scrolling or leaving.
5. **The change summary is on the screen** and the document is one tap away, so
   nobody agrees to something described only as "our terms".

## The gate

`private.legal_gate_satisfied(user_id)` is the single boolean any caller should
read. It returns true when nothing that **may restrict** is outstanding.

It returns true unconditionally when `reconsent_enforced` is false. That switch
ships **off**: nobody has accepted a version that did not exist before this
release, so enabling it without a migration path would block every existing
account from booking and working at once.

On the client, `useLegal().satisfied` fails **closed** — an unreadable
obligations call is treated as unsatisfied, never as satisfied. The wrong guess
in one direction shows a consent screen somebody did not need; in the other it
treats a person as having agreed to something Warsha cannot establish they ever
saw.

## Role independence

Customer and worker agreements are evaluated separately, and that falls out of
the audience filter rather than being special-cased:

```sql
where d.active and d.requires_acceptance
  and (d.audience = 'all' or d.audience = private.legal_account_role(p_user_id))
```

A customer asked to re-accept Customer Terms is never dragged through Worker
Terms. An account that is both must satisfy both independently.

`legal_account_role` reads WPS-023's `intended_role`, which that specification
is explicit is a **preference** and never an authorization fact. That is the
correct use of it: which agreement addresses you is a question about who you
are trying to be, not about what you are permitted to do.

## Related

- [Legal architecture](./legal-architecture.md)
- [Agreement versioning](./agreement-versioning.md)
