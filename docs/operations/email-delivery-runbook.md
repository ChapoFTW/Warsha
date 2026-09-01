# Email delivery — custom SMTP for customer confirmation

Customer signup keeps **Confirm email** enabled. Until a custom SMTP provider is
configured, hosted `warsha-development` uses Supabase's built-in mailer, which
cannot serve QA.

This runbook is the authority for replacing it. It changes nothing about worker
authentication: workers register with phone and password through the trusted
broker, hold a synthetic `@auth.warsha.invalid` identity, and are never sent
email of any kind.

## Why the built-in mailer cannot be the QA solution

Measured against `warsha-development` on 2026-08-10, not quoted from
documentation:

| Evidence | Result |
| --- | --- |
| Two signups in quick succession | 2nd and 3rd returned `429 over_email_send_rate_limit` — "email rate limit exceeded" |
| Documented recipient restriction | Sends only to addresses belonging to project team members |
| `confirmation_sent_at` populated | Proves GoTrue *attempted*, never that anything was delivered |

Two messages per hour, only to the team, with no delivery SLA. A QA session with
family and friends exceeds that before it begins.

## Provider decision

**Resend**, unless something already standardised says otherwise — nothing does.
`private.external_providers` currently records `supabase`, `expo_eas`,
`expo_camera`, `expo_image_picker`, `expo_document_picker`,
`google_cloud_vision` and `google_maps_platform`. No transactional email
provider is registered, so this is a new dependency rather than a switch.

Resend's SMTP relay is used, not its HTTP API: Supabase Auth speaks SMTP, and
routing Warsha's authentication mail through application code would put a
delivery dependency inside the signup transaction.

## Three gates, in order

None of these can be skipped, and the second and third are not engineering
tasks.

### Gate 1 — a domain Warsha controls — **CLEARED**

**Warsha owns `usewarsha.com`.** This paragraph used to say the opposite, and
that was true when it was written. Verified 2026-09-01, from outside:

| Check | Result |
| --- | --- |
| `https://usewarsha.com/en` | `200`, valid certificate |
| Authoritative nameservers | `chance.ns.cloudflare.com` — DNS is under Warsha's control |
| Live hosts | `usewarsha.com`, `app.usewarsha.com`, `admin.usewarsha.com` |
| `MX` records | **none** |
| `TXT` / SPF | **none** |

So the domain exists and its DNS is editable, which is the whole of Gate 1. What
is *not* done is mail configuration: there are no MX records and no SPF record,
so nothing can send as `@usewarsha.com` and nothing would pass authentication if
it tried. That is Gate 2's work, not Gate 1's.

`G33` in `docs/launch/READINESS-GAP-REGISTER.md` and `R20` in
`docs/launch/GO-NO-GO-CRITERIA.md` still record "no domain" and are now stale on
that point. They should be narrowed to the part that remains: **no sending
domain is configured**.

`auth.warsha.invalid` stays exactly as it is. It is a reserved RFC 2606 name
chosen so that synthetic worker identities can never resolve or receive mail,
and owning a real domain does not change that decision.

Resend will not send to arbitrary recipients from an unverified domain. Its
shared `onboarding@resend.dev` sender delivers **only to the Resend account
owner's own address** — the same restriction that makes the Supabase built-in
mailer unusable. Verifying a sending subdomain is therefore the remaining
unblock.

### Gate 2 — Resend account, domain verification, API key

Minimum steps in the Resend dashboard, once a domain exists:

1. Create the account.
2. **Domains → Add Domain** → enter the sending **subdomain** (see below), not
   the root domain.
3. Resend displays the DNS records to publish. Add them at the registrar.
4. Wait for Resend to show the domain **Verified**.
5. **API Keys → Create API Key**, permission **Sending access**, scoped to that
   domain.

### Gate 3 — governance and legal (owner decision, not engineering)

Resend would process customer email addresses on Warsha's behalf, so it is a
**subprocessor**. Warsha's own published legal text commits to this:

> "Adding a subprocessor, or moving one from approved to in use, is a material
> change to the Privacy Policy. You are told who, for what, and where, before it
> takes effect." — `subprocessor_register`

Consequences, all of which follow from that promise:

- a row in `private.external_providers` (capability role for transactional
  email) and one in `private.subprocessors`;
- new published versions of the **Subprocessor Register** and the **Privacy
  Policy**, with new corpus hashes;
- because `privacy_policy` carries `requires_acceptance`, **every existing
  customer and worker must accept the new version**;
- a governance decision recorded by a staff member holding
  `manage_subprocessors`, with fresh reauthentication.

This is a deliberate cost of the design, not an obstacle to route around. It is
the reason no migration for Resend is written in advance: publishing a legal
version that forces renewed acceptance is an owner's decision.

## Sender identity

Use a dedicated sending **subdomain**. Never the root domain.

| | Recommendation |
| --- | --- |
| Sending domain | `mail.warsha.<tld>` |
| Sender | `Warsha <no-reply@mail.warsha.<tld>>` |
| Alternative | `auth.warsha.<tld>` if authentication mail is to be isolated from all other transactional mail |

Why a subdomain:

- **Reputation isolation.** Sending reputation accrues to the subdomain. If
  transactional volume is ever mishandled, the root domain — and anything else
  it is used for — is unaffected.
- **Strict root policy stays possible.** The root can publish a
  `p=reject` DMARC policy with no sending records at all, which is the correct
  posture for a domain that never sends mail.
- **The registrar's own mail is untouched.** Adding SPF/DKIM to a root domain
  that already handles mail risks breaking it.

`mail.` rather than `auth.` because Warsha will send booking and operational
mail later, and a second sending identity for the same class of message
fragments reputation for no benefit. Keep marketing mail — if it ever exists —
on a separate subdomain, which is the split that actually matters.

`no-reply@` is honest here: nothing reads that mailbox. Support has its own
route inside the application, which the confirmation template points to.

## DNS records

Resend generates the exact values; the shapes are below so the registrar work
can be scheduled before the account exists. Publish them on the **subdomain**.

| Type | Name | Purpose |
| --- | --- | --- |
| `MX` | `send.mail.warsha.<tld>` | Bounce and complaint handling |
| `TXT` | `send.mail.warsha.<tld>` | SPF — authorises Resend to send |
| `TXT` | `resend._domainkey.mail.warsha.<tld>` | DKIM public key — signs each message |
| `TXT` | `_dmarc.mail.warsha.<tld>` | DMARC policy (below) |

DMARC: start at `v=DMARC1; p=none; rua=mailto:dmarc@warsha.<tld>` and read the
aggregate reports for a week before tightening to `p=quarantine` and then
`p=reject`. Starting at `reject` while alignment is unproven silently discards
confirmation mail, which is indistinguishable from the failure this runbook
exists to fix.

## Supabase SMTP configuration

**Dashboard → Project Settings → Authentication → SMTP Settings**, on
`warsha-development` (`lrhipbcapzfxuwixfoog`) only. Production is a separate
project and is out of scope.

| Field | Value |
| --- | --- |
| Enable Custom SMTP | on |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` (literal — not an email address) |
| Password | the Resend API key |
| Sender email | `no-reply@mail.warsha.<tld>` |
| Sender name | `Warsha` |

Resend issues **no separate SMTP password**: the API key *is* the SMTP
credential. There is one secret, not two.

Port 465 is implicit TLS. Use 587 (STARTTLS) only if 465 is blocked; never 25.

Enter the key in the dashboard rather than through the repository. Two reasons,
both concrete:

- `supabase config push` transmits the **entire** local `[auth]` block, and
  `supabase/config.toml` carries `site_url = "http://localhost:8081"` for local
  development. Pushing it would overwrite the hosted Site URL with a localhost
  address and break the confirmation callback that currently works.
- The dashboard form writes six fields and touches nothing else.

The key must never reach Git, an `EXPO_PUBLIC_*` variable, client source, or a
repository `.env`. `npm run audit:secrets` scans tracked *and* untracked files
and history, and is run before every commit.

After saving, raise **Authentication → Rate Limits → Emails sent per hour** from
the built-in default; it stays low otherwise and re-creates the original symptom
against a provider that is no longer the constraint.

## Redirect configuration

Hosted development was corrected on 2026-08-22. Confirm rather than edit:

- **Site URL** is `https://app.usewarsha.com`.
- **Redirect URLs** are exactly four explicit destinations, no wildcards:
  `https://app.usewarsha.com/auth/confirm`,
  `https://app.usewarsha.com/reset-password`,
  `warsha://auth/confirm`, `warsha://reset-password`.
- The app supplies `Linking.createURL('auth/confirm')` as `emailRedirectTo`, so
  a Preview build returns through `warsha://auth/confirm`. Web supplies its own
  origin plus the same path.
- **The Site URL is not only a template fallback.** Auth falls back to it
  whenever a requested `emailRedirectTo` is *not* on the allow list. That is
  exactly how hosted development spent weeks emailing `http://localhost:3000`
  to real customers while every client was requesting the correct URL. If a
  confirmation link points somewhere unexpected, suspect the allow list first.
- `exp://` is deliberately absent from hosted development. An Expo Go address
  names a developer's own machine, which is the same class of defect as
  localhost. Point a dev client at a local stack instead.

## Template

Supabase Auth templates are **not localizable**: there is one template per email
type, with no branch on the recipient's language, and the language a person
chose lives in `raw_user_meta_data.preferred_language`, which templates cannot
read. Warsha ships English and Arabic, so a single bilingual message is the only
honest option — an English-only confirmation would be unreadable for half the
intended audience.

`docs/operations/email-templates/confirm-signup.html` is the canonical body.
Paste it into **Authentication → Email Templates → Confirm signup**.

Requirements the template must keep:

- `{{ .ConfirmationURL }}` for the link. A template hard-coded to
  `{{ .SiteURL }}` ignores the callback the application supplied and the
  confirmation lands nowhere.
- Arabic wrapped in `dir="rtl"`, English in `dir="ltr"`. A single container
  cannot be correct for both.
- No claim about anything Warsha cannot observe. The message confirms an address;
  it does not promise that an account exists.

## Verifying delivery for real

`confirmation_sent_at` is not evidence. The check is an inbox.

1. Sign up in the Preview build with a fresh address that is **not** a Supabase
   or Resend team member — that is the case the built-in mailer could not serve.
2. Confirm the message arrives, in both languages, not in spam.
3. Check **Resend → Emails** for the message with status `delivered`. This is
   the delivery evidence; the provider observed the receiving server accept it.
4. Tap the link in the message on the device and confirm the app opens at
   `warsha://auth/confirm` and the session becomes usable.
5. Confirm server-side that the account is actually confirmed:

   ```
   supabase db query --linked -f <file containing>
     select (email_confirmed_at is not null) as confirmed
     from auth.users where id = '<the new user id>'
   ```

6. Record the outcome in the QA log. Steps 3 and 5 together are the proof;
   either alone is not.

## What is deliberately not changed

- **Worker authentication.** Phone and password through the trusted broker, no
  email, no confirmation, no template. Nothing here touches it.
- **Email confirmation stays on.** Turning it off would make delivery problems
  invisible rather than fixed.
- **Production.** A separate project, configured separately, when it exists.

---

## Verified state, 2026-09-01

Measured, not assumed. Four different things are routinely called "email works",
and only two of them are true.

| | State | Evidence |
| --- | --- | --- |
| **Code verified** | **YES** | Signup and recovery were driven against the local stack; GoTrue rendered both templates and delivered them to the local catcher. Subjects: "Confirm your email address", "Reset your password". Both links carried the correct `type` (`signup` / `recovery`) and a `redirect_to` matching `site_url`. |
| **Provider configured** | **NO** | No custom SMTP. Hosted `warsha-development` still uses Supabase's built-in mailer: two per hour, project team members only. |
| **Delivery verified** | **LOCAL ONLY** | Delivery was observed end to end against the local mail catcher. Nothing has been sent to a real inbox from a hosted project, and nothing should be until a provider exists. |
| **External config required** | **YES** | See the gates above. |

### What the local run proves and does not prove

It proves the parts that live in this repository: the templates render, GoTrue
is configured to send on both events, the confirmation and recovery token types
are right, and the redirect is taken from `site_url` rather than invented.

It proves nothing about deliverability. A message that reaches a local catcher
has not passed SPF, DKIM, DMARC, a reputation filter, or an Egyptian mailbox
provider's spam heuristics. Those are what Gate 2 and Gate 3 buy.

### The hosted redirect allowlist — unverified, and how to check it

`supabase/config.toml` configures the **local** stack only, and says so. The
hosted project keeps its own redirect allowlist, and if
`https://app.usewarsha.com/**` is not in it, GoTrue refuses the redirect and
every confirmation and recovery link looks broken to the person who clicked it.

The Supabase CLI has no read command for this — `supabase config` offers only
`push`, which would overwrite the hosted configuration from the local file and
must not be run. So this is an owner check:

1. Supabase dashboard → project `warsha-development` → **Authentication → URL Configuration**.
2. **Site URL** should be `https://app.usewarsha.com`.
3. **Redirect URLs** must include, at minimum:
   - `https://app.usewarsha.com/**`
   - `warsha://**` and `exp://**` for the phone

Until that is confirmed, treat hosted confirmation and recovery links as
**unverified**, whatever the local run shows.

---

## Auth email templates — verified state, 2026-09-01

Read from both projects through the Management API; the LIVE configuration is
the authority, not this repository.

| Auth email | Development | Production (before) | Production (after) |
| --- | --- | --- | --- |
| Confirm signup | **custom** | Supabase default | **custom, synchronised** |
| Invite user | Supabase default | Supabase default | Supabase default |
| Reset password | Supabase default | Supabase default | Supabase default |
| Magic link | Supabase default | Supabase default | Supabase default |
| Change email | Supabase default | Supabase default | Supabase default |
| Reauthentication | Supabase default | Supabase default | Supabase default |

**Warsha has exactly one custom auth email.** The "You've been invited" subject
seen in Production is the Supabase default — and it is the default in
Development too, so there was nothing to copy. Nothing was invented to fill the
gap.

Subject, both projects:
`أكد بريدك الإلكتروني في ورشة | Confirm your Warsha email`

Content: `supabase/templates/confirm-signup.html`, byte-identical in both.

### How Production is configured

`[remotes.production]` in `supabase/config.toml` declares the intended state.
It is complete and safe to `config push` **only** with `RESEND_SMTP_PASSWORD`
exported — `config push` owns the whole auth configuration, and an undeclared
`[auth.email.smtp]` would send `enabled = false` and take the Resend mailer
down. The 2026-09-01 change was applied through a Management API PATCH of two
fields instead, and every other field was diffed afterwards to prove nothing
else moved.

### Localisation

Supabase Auth renders **one template per email type** and cannot branch on the
recipient's language: the chosen language lives in
`raw_user_meta_data.preferred_language`, which templates cannot read. Warsha's
answer is one bilingual template, Arabic first because the audience is Egyptian.

**French is absent.** Warsha's product supports EN/AR/FR, and this email is
AR+EN. That is a real gap, it predates this work, and it exists in Development
too — it was not introduced by the Production sync.

### Link verification

`generate_link` for all three flows resolves to
`ekgwzljpcxpxnklzxuvj.supabase.co/auth/v1/verify` with
`redirect_to=https://app.usewarsha.com`. No Development project ref, no
localhost, and the only template variable is `{{ .ConfirmationURL }}`.
