# Single-owner automation authority

**Status:** design, not implemented. Nothing in this document is live.

## The problem

Warsha's governed RPCs — `staff_activate_external_provider`,
`staff_set_feature_flag`, `staff_record_subprocessor_agreement` and the rest —
resolve the actor from `auth.uid()` and demand AAL2 with recent auth. That is
correct: they are the acts that send customer data to a new processor or switch
a product surface on, and they should require a live second factor.

It also means an agent has no way to perform them. On 2026-09-07 the Production
OCR activation was executed through a **temporary bridge**: an admin-issued
magiclink token as the first factor, the owner's live TOTP code as the second.
That produced a genuine AAL2 session, audited truthfully as `amr: [otp, totp]`,
and the owner authorised it explicitly for that one batch.

It is not an architecture. It requires the service-role key to mint a session
for a human being, which is a capability that should not be routine, and it puts
the owner in the loop for a six-digit code every time.

## What already exists, and why it does not cover this

`warsha-automation` is a deployed Edge Function with a standing authorisation
model — `private.activate_external_provider_core` accepts
`p_actor_type = 'automation'` and records `owner_approved_development_policy` as
the basis. It is deliberately capped:

```sql
if p_actor_type = 'automation' and v_config.environment <> 'development' then
  raise exception 'Automation governance is available in development only';
```

and its credential, `WARSHA_DEVELOPMENT_AUTOMATION_TOKEN`, is **not present in
Production secrets**. Both facts are intentional. The Development principal was
created so an agent could iterate without a human; extending the same
unconditional standing authority to Production would mean an agent could
activate a subprocessor at 3am with no second factor anywhere.

So the question is not "how do we get the Development principal into
Production". It is "what would a Production automation principal have to look
like to be worth having".

## The shape worth building

A Production automation principal should differ from the Development one in
three ways.

### 1. Scope, declared in advance

The Development principal may do anything its capability grant allows. A
Production one should hold a **narrow, enumerated** capability set — the same
approach `202609060009` took for `subprocessor_approver`, which holds exactly
three capabilities and no more. Automation that can enable a feature flag does
not need to be able to grant a staff role.

### 2. A human-anchored authorisation with an expiry

The bridge's real property was not the magiclink. It was that **a human proved
possession of a second factor within the window**. That property can be kept
without minting a session per action:

- the owner opens `/admin/security`, proves AAL2, and issues a **scoped
  automation grant**: a set of capabilities, an environment, a reason, and an
  expiry measured in hours;
- the grant is a row, audited, revocable, and visible in the console;
- the agent presents a token bound to that grant;
- every governed RPC records `actor_type = 'automation'` **and** the grant id,
  so the audit trail names both the machine that acted and the human who
  authorised the window.

This is dual control across time rather than across people, which is the honest
reading of a single-operator platform: the second party is the owner's earlier,
deliberate, expiring decision.

### 3. Refusals that do not move

A Production automation grant must not be able to:

- grant or revoke staff roles, or extend its own grant;
- disable a kill switch;
- publish legal text or record a legal review;
- act at all once `expires_at` has passed, with no grace and no refresh.

The last one matters most. An automation credential that renews itself is a
permanent credential wearing a costume.

## What this replaces, and what it does not

It replaces the magiclink bridge for **routine governed operations**: flag
changes, provider activation, health reconciliation.

It does not replace the owner for anything that changes who may act — staff
roles, capability catalogues, kill switches — and it should not. Those are the
acts that would let an attacker who reached the automation credential turn a
narrow grant into a broad one.

## Cost, honestly

This is a migration adding a grant table and an `actor_type` path through
`private.require_staff_capability`, an admin console surface to issue and revoke
grants, an Edge Function to accept the token, and pgTAP covering every refusal
above. It is a day of work, not an afternoon, and it touches the authority model
— which is the part of Warsha where a mistake is worst.

Until it exists, the honest position is the current one: **an agent can prepare
everything and the owner spends one TOTP code per batch.** That is a real cost,
paid once per session rather than once per action, and it is not obviously the
wrong trade for a platform with one operator.

## Recommendation

Build it when the frequency justifies it — when governed Production operations
happen often enough that the per-batch code is genuinely in the way. Right now
they happen a few times a week. Revisit at the point where that changes, and
until then keep using an explicit, owner-authorised, single-batch bridge and
keep saying plainly in the audit what it was.
