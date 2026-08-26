# State persistence

Warsha holds three kinds of state, and most of the defects human QA reported as
"the page reset itself" came from two of them being implemented as the third.
This document names the three, says where each one lives, and records the
decisions that are easy to get wrong the second time.

## The three classes

| Class | Example | Owner | Survives |
| --- | --- | --- | --- |
| **Application preference** | language, appearance | the device, and the account | everything: navigation, refresh, restart, a new device |
| **Work in progress** | a half-written request, an address being entered, an unsaved trade selection | the device, scoped to one account | navigation, refresh, restart — until submitted, discarded, or the account changes |
| **Server state** | a saved address, a created request, a worker profile | the database, read through RLS | it is not client state at all; a screen re-reads it |

The rule that follows from the table: **server state is never copied into a
device store.** When a saved address appeared to vanish, the fix was to make
the surfaces that read addresses re-read them, not to keep a second copy.

## Language

`src/preferences/preference-authority.ts` is the only place allowed to decide a
locale. Import-free, so the Node suite runs the real rules.

Precedence, highest first:

1. **An explicit choice** — somebody opened the control and picked.
2. **The route locale**, where the surface has one (the public site only).
3. **A remembered value**, carried in the `warsha-locale` cookie.
4. **The browser or device language**, first-preferred-supported-language.
5. **English.**

Direction is derived from the language by `directionFor`, never set separately.
`localeDirectionAgrees` states the invariant as a predicate so it can be
asserted for every locale at once.

### Where the inputs come from

- **Native** — `LocalizationProvider` reads the device store synchronously in
  its state initializer, so the first frame already has the right language.
- **Web** — the language is decided **on the server**, in `serverLocale()`,
  from the `warsha-locale` cookie and `Accept-Language`. It is then held in one
  context (`WarshaPreferencesProvider`) rather than re-derived per component.
  This is what removes the flash of English: the server render, the first
  client render and the reconciled render are all the same language.
- **The cookie means "a person chose this."** Nothing but the language control
  writes it, which is why the middleware, the server render and the client can
  all read the same fact from it. It is scoped to `.usewarsha.com`, because
  `usewarsha.com`, `app.` and `admin.` are three origins and `localStorage`
  cannot cross them.
- **The account** — `profiles.preferred_language` has existed since the first
  migration and accepts all three languages. `accountLocalePrecedence`
  reconciles it with the device exactly once per account, the same way
  `AppearanceAccountSync` does for the theme: an explicit device choice wins
  and is pushed up; otherwise the account's language is adopted.

### The public site keeps locale in the URL

`/ar/services` is a real, crawlable, shareable document and stays one. What
changed is that an *explicit* preference outranks it: the middleware redirects
somebody who chose English from `/ar/x` to `/en/x`, keeping the path, the query
and the fragment. A crawler sends no cookie, so all three languages remain
independently reachable.

Switching language never sends anybody Home. `pathWithLocale` rebuilds the same
path in the new language.

## Drafts

`src/drafts/draft-contract.ts` defines what a draft is; `draft-storage.ts` and
`draft-storage.web.ts` decide where the bytes go. Web consumes the contract
through `web/lib/draft-store.ts`, native through `src/drafts/draft-context.tsx`.

A draft is stored as an envelope, never as bare form values, because the
envelope is what makes three decisions possible without asking the caller:

- **Account isolation.** The envelope records whose draft it is; a mismatch is
  refused on read. This holds even when sign-out never ran its cleanup.
- **Schema drift.** A draft written by an older build is discarded rather than
  restored into fields that have since changed meaning.
- **Expiry.** Seven days for authored work, one day for browsing state.
  Deliberately generous: the failure being fixed is *ordinary navigation*
  wiping work, and an aggressive expiry rebuilds the same complaint on a timer.

### Lifecycle

```
start → edit → navigate away → return → restored
                             → submit          → cleared
                             → discard/cancel  → cleared
                             → "start a new …" → cleared
                             → sign out        → every flow cleared
                             → other account   → every flow cleared
```

Arriving at a form is not one of the clearing events. Leaving is not either.

### What is deliberately *not* drafted

- **Editing an existing address.** That is a modification of a server-owned
  record; a stale restored edit could re-apply values changed elsewhere.
- **Free-text worker profile fields.** Same reason.
- **The trade selection is drafted as a delta**, with the server baseline it was
  made against. If the account changed its trades on another device, the delta
  is abandoned rather than allowed to win. Same optimistic-concurrency idea as
  `select_worker_quote`'s `selectionVersion`.
- **Anything on `forbiddenDraftFields`** — passwords, OTPs, tokens, card and
  document numbers. A device store is plaintext by construction. The check runs
  at any depth and is asserted over every drafted shape in the product.

## Navigation

Inside the authenticated product, every link is a `next/link` `Link`. A plain
anchor is a full document load: it destroys the React tree, re-runs the whole
session bootstrap, and shows the startup mark — which is exactly what QA
described as the page having reloaded, because it had.

The one place a plain anchor is still right is a **session boundary** —
`AuthStateCard`, sign-in, create-account. There a full reload is the point: the
session provider re-resolves from scratch and nothing composed under the
previous identity is carried across.

## Invalidating server reads

`web/lib/data-events.ts` carries a signal, never data. After a mutation the
server accepted, the mutating surface announces the topic; surfaces showing that
topic re-read. It covers the two cases a remount does not: a second tab, and two
surfaces mounted in one tree.

## Where the tests are

`scripts/state-persistence.test.mts` — the rules run directly, the exact QA
journeys played against a fake device store, and source-level assertions that
the surfaces actually consume the shared authorities. A correct authority
nothing imports is how the previous architecture managed to be right and broken
at the same time.
