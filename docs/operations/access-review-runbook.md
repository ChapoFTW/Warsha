# Access Review Runbook

Authority: Warsha Constitution → WPS-017 (roles) → WPS-018 (review).
Owner: Security Administrator. Cadence: every 90 days, configurable.

## Why this exists

Access accumulates. Someone joins the dispute team for one investigation and
still holds `review_disputes` a year later. Nobody is careless; nobody ever went
back and looked. This runbook is the going back and looking.

## Preparation

Open the operations platform, re-authenticate, and read the access review. It
lists every active grant with its role, who granted it, when, its expiry, when it
was last reviewed, and whether it is overdue. A grant never reviewed is overdue
from the first day.

## For each grant, four questions

1. **Does this person still do this work?** Not "could they" — do they.
2. **Is this the narrowest role for it?** A Dispute Reviewer holding Operations
   Manager because they occasionally assign cases is over-granted.
3. **Should it have an expiry?** Contractors, incident cover, and single
   investigations should always be time-bounded so nobody has to remember.
4. **Has it been used?** The staff audit and access log show what was actually
   reached. An unused elevated capability is pure risk.

## Decisions

| Decision | Meaning | Then |
| --- | --- | --- |
| `retained` | Still needed at this level | Record the note; the clock resets |
| `reduced` | Needed, but narrower | Record, then revoke and grant the narrower role |
| `revoked` | Not needed | Record, then revoke |

The note is read by someone in six months. "Still needed" is not a note.
"Still the primary dispute reviewer; handled 34 cases this quarter" is.

**Nobody may review their own access.** The database refuses it.

## Break-glass

Super Administrator is reviewed every time, regardless of cadence.

- Was it used at all? Every action it authorized is flagged `break_glass` in the
  immutable audit and is visible in the audit explorer.
- Was each use genuinely exceptional?
- Did it have an expiry?
- **Does it still need to exist?** A break-glass role held permanently by someone
  who never uses it should be revoked and re-granted when needed.

A pattern of routine break-glass use means the role model is wrong. Fix the role
model, not the review.

## Legacy accounts

Any account holding staff access through a pre-WPS-017 `user_roles` row rather
than a WPS-017 grant is listed and migrated or revoked.

Production forbids that path by database constraint, so a legacy account simply
cannot work there. Outside production it is allowed so no existing behaviour
changed. **The goal is zero legacy accounts, after which the grace path is
removed entirely** (gap G36).

## MFA

For each staff account, confirm a second factor is enrolled. Production requires
`aal2` per caller, so an unenrolled staff member cannot work there at all — but
the review is where that is discovered before it becomes an incident at 2am.

## Sessions

Revoking a role clears that account's session registrations in the same
transaction. Confirm it took: capabilities resolve live on every call, so a
revoked person loses access on their next request, not at token expiry.

## Off-cycle triggers

Review immediately, without waiting for the cadence:

- Someone leaves, or changes team
- A security incident of any size
- A break-glass use that was not planned in advance
- An audit finding
- Before any launch phase

## Recording

Every decision writes an immutable review row and a staff audit entry with the
actor, the grant, the decision, and the note. Neither can be edited or deleted
afterwards, including by the person who wrote it.

## Completion

A review is complete when every active grant has a decision dated within the
interval, every reduction and revocation has been executed, every legacy account
is migrated or revoked, and the result is reported to the Owner.

## Status

**No access review has ever been performed.** It is a private beta criterion
(P17) and it is not satisfied.
