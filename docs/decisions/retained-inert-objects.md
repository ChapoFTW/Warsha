# Objects that are kept on purpose

Reviewed 2026-09-01, during the final code-side release closure pass.

The goal of that review was **zero actionable code-side debt**, which is not the
same as zero historical objects. An empty table nothing references costs
nothing; dropping one days before a release costs a migration, a test change and
a small chance of being wrong about "nothing references it". Each object below
was checked, found inert, and **kept deliberately**. This file is the record, so
that the next review finds a decision rather than an unexplained leftover.

An entry leaves this list in one of two ways: something starts using it, or a
quiet period after launch makes removing it cheap.

---

## `public.provider_earnings`

**Kept.** Legacy table from the pre-WPS-015 payments model.

| Check | Result |
| --- | --- |
| Rows | 0 |
| Referenced by application code | no |
| Referenced by any RPC | no |

The live earnings authority is `public.provider_earnings_ledger`, read through
`get_my_provider_earnings`, and the mock repository writes to the ledger name
too. The similarity of the two names is the only reason this looks live, and it
is also the reason dropping it is not free: a search-and-replace that caught the
wrong one would break worker earnings, which is money on a screen.

Dropping it also needs a `drop table`, which `audit:migrations` refuses outright
as a forward-only violation. That refusal is correct and should not be softened
for an empty table.

---

## The `avatars` storage bucket

**Kept, already retired in every sense that matters.**
`202608300005_retire_avatars_bucket.sql` did the retirement properly and its
header explains why the bucket row itself survives: `storage.protect_delete()`
refuses direct deletion from `storage.buckets`, so removal has to go through the
Storage API, which a migration cannot call.

Current state, verified: **zero objects, zero policies**. No client can read from
it or write to it. `api-session-safety.test.sql` asserts it stays policy-free and
that `profile-images` keeps the policies.

**Remaining action is operational, not code:** delete the bucket through the
Storage API in local, Development, Preview and Production identically, so no
environment's storage inventory drifts. Owner action.

---

## `marketplace-request-attachments` — bucket and table

**Kept.** Complete and unused scaffolding: a private bucket with a 10 MB limit
and three image MIME types, owner-scoped policies, a backing table
`public.marketplace_request_attachments`, and a row in the WPS-022 data
inventory with a retention period.

| Check | Result |
| --- | --- |
| Rows in `public.marketplace_request_attachments` | 0 |
| Objects in the bucket | 0 |
| Client code that uploads to it | none |
| Client code that reads it | none |

A customer attaching a photograph to a **marketplace request** — as opposed to a
booking, which uses `booking-attachments` and works — was designed and never
built. That is a product gap, not debt: the schema is right, the policies are
right, and the day somebody builds the screen there is nothing to design.

Removing it would mean removing a privacy inventory entry and a retention rule
for a feature that is still intended. Keeping an unused bucket costs nothing;
removing a retention commitment and re-adding it later costs a legal review.

---

## `private.notification_device_tokens.encrypted_token`

**Kept, nullable, unused, and commented in the database.**

Declared `not null` by WPS-014 and never written, because push registration
always raised before reaching an insert. `202609010001_push_delivery_authority.sql`
made it nullable and stores the token in a new `token` column instead.

The name is why it could not simply be used. There is no key-management
authority in this database, and a column encrypted with a key stored in the same
database is not encrypted — it is obfuscated against nobody who could read the
column in the first place. The real control is the same one protecting every
other private table: the `private` schema with every grant revoked from
`public`, `anon` and `authenticated`, asserted in
`push-delivery-authority.test.sql`.

`comment on column` says all of this inside the database, so somebody reading
the schema without this file reaches the same conclusion.

---

## Nine tables that refuse an account deletion cascade

**Kept, and this one is a real finding rather than a tidy-up.**

`delete from public.profiles` cascades into a number of tables that carry a
`before delete` immutability trigger. Each of those triggers refuses the cascade,
so the delete fails outright.

`private.notification_source_links` was fixed in
`202609010001_push_delivery_authority.sql` — the guard now distinguishes
tampering (the profile still exists) from erasure (it does not) — because the
push authority depends on `on delete cascade` destroying device tokens, and that
claim is only true if the delete can happen at all.

**The other nine are left alone, deliberately:**

`public.legal_acceptances`, `public.referral_attributions`,
`public.referral_codes`, `public.referral_rewards`, `public.staff_role_grants`,
`public.trust_enforcement_actions`, `public.trust_reports`,
`public.worker_onboarding_events`, `private.staff_access_reviews`.

Whether a legal acceptance or a trust report survives an erasure request is a
retention question with a legal answer, not an engineering one. WPS-022 records
Warsha's policy as **`anonymize`**, not delete, and there is no deletion
executor: `request_account_deletion` and `cancel_account_deletion` exist,
nothing performs the erasure. So this blocks nothing today.

It will block the erasure executor on the day somebody writes it. The list is
here so that person does not rediscover it one table at a time.

---

## Things checked and found NOT to be debt

* **`EXPO_PUBLIC_ADMIN_SURFACE`** — looked like leftover configuration after the
  native staff architecture was retired on 2026-08-29. It is not: it gates
  `app/icon-gallery.tsx`, `qa-preview-pipeline.test.mts` asserts the Preview
  guard, and `native-admin-boundary.test.mts` names it explicitly as a
  legitimate use of the word "admin". Live and correct.
* **`a11y-report.json`, `crawl-chromium.json`, `dist/`** — generated by the
  accessibility, crawl and export scripts on every run. All git-ignored and all
  untracked. Correct as they are.
* **`Category.icon`** — already removed in
  `202608310009_retire_category_icon_name.sql`. Nothing further.
