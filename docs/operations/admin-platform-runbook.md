# Admin Platform Runbook

Authority: Warsha Constitution → WPS-017 → WES-017.
Audience: Security Administrators and Operations Managers.

## What this platform is

One secure workspace for work that needs human judgement: reviewing
verifications, disputes, abuse reports, appeals, review moderation, financial
exceptions, support cases, and incidents.

## What this platform is never

- It is **never** a general database browser. If you find yourself wanting to
  "just look at the table", the answer is a new, specified, sanitized projection
  — not a query tool.
- It is **never** a way to take a domain decision outside the domain. A dispute
  is resolved by WPS-013, an enforcement action by WPS-016, a refund by
  WPS-007/WPS-015. The admin platform routes the work and records who did it.
- It **never** holds a service-role key. If anyone proposes adding one to make
  something easier, refuse and escalate.

## Enabling the surface

1. Set `EXPO_PUBLIC_ADMIN_SURFACE=enabled` for the build that needs it. Customer
   builds leave it unset, which makes the surface inert — the guard refuses to
   open it and every operational call is refused.

   Be clear about the limit: the operations **code** is still in the bundle,
   because Expo Router bundles every route module. It holds no secret and grants
   no access, and the server refuses an unauthorized caller regardless. Do not
   describe the unset flag as "the screens are not there".
2. Confirm `EXPO_PUBLIC_DATA_MODE` and the Supabase URL point where you expect.
   The environment badge in the header is the authority; if it says PRODUCTION,
   believe it.
3. Never set the admin flag and a production Supabase URL on a developer laptop
   build.

## Bootstrapping the first administrator

The first Security Administrator cannot be granted through the platform, because
granting a role requires the capability you are trying to create. This is
deliberate.

A database administrator runs, once, connected directly:

```sql
select private.bootstrap_staff_role(
  '<auth user id>',
  'security_administrator',
  'Initial administrator bootstrap — <ticket or approval reference>');
```

`private.bootstrap_staff_role` carries no client `EXECUTE` grant and is
unreachable over the API. The grant it creates is audited like any other.

After that, **every** role change goes through `staff_grant_role` /
`staff_revoke_role` in the platform. Do not use the bootstrap again except to
recover from a total loss of administrators, and record why when you do.

## Granting a role

1. Confirm the person's identity out of band. Never grant from a chat message
   alone.
2. Grant the **narrowest** role that lets them do the job. Support Agent is the
   default; escalate only when the work demands it.
3. Write a real reason. "Access" is not a reason. "Joining the dispute team on
   2026-08-10, approved by <name>" is.
4. You will be asked to re-authenticate first. That is expected.
5. **You cannot grant a role to yourself.** If you need one, another Security
   Administrator grants it.

Set an `expires_at` for temporary access — contractors, incident cover, a single
investigation. Expiry is enforced live; nobody has to remember to revoke.

## Revoking a role

Revoke the moment the reason ends: a team change, a leave of absence, a departure,
or a suspicion. Revocation is immediate — capabilities are resolved on every
call, and revoking also clears the person's re-authentication attestations.

Never try to "correct" a grant by editing it. Role history is immutable. Revoke
and grant again with a clear reason; the pair tells the true story.

## Break-glass access

Super Administrator holds every capability. Production use must be **exceptional**.

- Grant it for a named incident, with an expiry, and revoke it when the incident
  closes.
- Every action a break-glass role authorizes is flagged `break_glass` in the
  audit and is visible in the audit explorer.
- Review break-glass usage at every operations review. A pattern of routine
  break-glass use means the role model is wrong — fix the role model, not the
  review.

## The legacy staff bridge

`legacy_staff_bridge_enabled` maps a pre-WPS-017 `user_roles` staff account to
the lowest-privilege role. It is **off in every environment** and should stay off.
Turn it on only during a migration window, tell the team, and turn it off the
same day. Record both actions.

## Re-authentication

High-risk actions — role administration, refunds, ban approval, configuration
approval, feature flags, kill switches, exports, contact details — require a
fresh re-authentication in the current session. The window is fifteen minutes by
default.

Be honest about what this is: it records that the client confirmed you. It is not
a verified second factor, because no MFA provider is configured. That is exactly
why production is closed today.

## Production

Production is fail-closed by construction: the environment cannot be set to
`production` without the MFA requirement, and no MFA provider exists. Do not try
to work around this. When an MFA provider is authorized, that is a separate,
specified change with its own review.

Until then, treat any request to "just enable production admin for a minute" as a
security incident and open one.

## Daily rhythm

1. Open the operational home. Work overdue items first, then urgent, then oldest.
2. Claim a case before you work it, so two people never duplicate effort.
3. Put your reasoning in a staff-private note as you go, not afterwards.
4. Escalate rather than guess. Escalation is free; a wrong irreversible decision
   is not.
5. If a case belongs to another domain, hand it over — do not act outside your
   capability even if you technically can reach the record.

## When something looks wrong

- A queue you do not recognize, a capability you did not expect to hold, or a
  case that changed under you: stop, reload, and check the audit explorer.
- A version conflict is normal and means someone else is working the same case.
  Reload and talk to them.
- Anything that looks like data you should not be able to see: stop, screenshot
  nothing, and open a security incident.
