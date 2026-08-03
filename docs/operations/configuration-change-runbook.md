# Configuration Change Runbook

Authority: Warsha Constitution → owning domain WPS → WPS-017 → WES-017.
Audience: Marketplace Operations, Operations Managers, Security Administrators.

## What WPS-017 owns, and what it does not

WPS-017 owns the **change-control record**: the version, the validation, the
reason, the author, the approval, the activation time, and the immutable history.

WPS-017 does **not** become the authority for a domain's values. Each domain
declares its `authoritativeOwner` and who applies an activated version:

| Applied by | Meaning |
| --- | --- |
| `wps017` | WPS-017 genuinely owns the value (maintenance messaging, admin platform settings) |
| `domain_runbook` | The owning specification applies it through its own path; WPS-017 records the approval |

Reading the domain column before you start is the single most useful habit in
this runbook.

## The domains

| Domain | Owner | Applied by |
| --- | --- | --- |
| Marketplace modes, ranking, invitation waves | WPS-008 | domain_runbook |
| Notification policy, reminder policy | WPS-014 | domain_runbook |
| Payment mode, payout mode | WPS-015 | domain_runbook |
| Release scheduler flag | WPS-007 | domain_runbook |
| Call relay mode | WPS-009 | domain_runbook |
| Trust policy | WPS-016 | domain_runbook |
| Review edit window | WPS-011 | domain_runbook |
| Dispute policy | WPS-013 | domain_runbook |
| Upload limits | WPS-010 | domain_runbook |
| Maintenance modes, admin platform settings | WPS-017 | wps017 |

## The change path

```
draft ──submit──► pending_approval ──approve (different person)──► active
                                                                    │
   previous active ──────────────────────────────────► superseded ──┘
```

1. **Draft.** Create a draft with a real change reason. "Update config" is not a
   reason; "raise the first wave to 4 because coverage in Giza is short" is.
2. **Validate.** The database allowlists the keys per domain and rejects nested
   objects, oversized strings, and anything that looks like a secret. If your
   payload is refused, the payload is wrong — do not look for a way around it.
3. **Submit.** Everyone who can approve is notified.
4. **Approve.** A **second person** approves and activates. The author can never
   approve their own version; the database refuses it. Write an approval note
   saying what you checked.
5. **Apply.** If the domain says `domain_runbook`, the owning specification's own
   path applies the value. The WPS-017 record is the approval and the audit
   trail, not the mechanism.

## Rolling back

You **never edit history**. A configuration version cannot be rewritten or
deleted, and an activated payload is frozen.

To roll back, prepare a rollback: WPS-017 creates a **new corrective version**
carrying the older payload, and it follows the same approval path with a second
person. The history then reads honestly: version 1 was active, version 2 restored
version 1, and here is who approved each.

If the situation is urgent enough that you cannot wait for an approver, that is
an incident and a kill switch, not a configuration change. See
`incident-command-runbook.md`.

## Secrets

**No secret value is ever stored in configuration.** Not an API key, not a
webhook signing secret, not a token, not a password. The validator rejects keys
matching those shapes, and it is not a suggestion.

If a change needs a credential, it is a WPS-015 provider-account change with its
own gate, not a configuration edit.

## Environments

Configuration is per environment. A version approved for `staging` does not touch
`local` or `production`. Check the environment badge in the header before you
start, and check the environment field on the version before you approve.

Production is fail-closed today: the admin platform is unavailable there until an
MFA provider is authorized.

## Feature flags

Flags are not configuration versions. They are a separate, faster path with the
same discipline:

- Off by default. Every flag ships disabled with a written reason.
- An enabled flag must name an audience. `none` means nobody.
- Percentage rollout is deterministic per account, so a person's experience does
  not flicker between requests.
- A flag key that looks like a security control is refused by the database.
  **A security control is never implemented as a feature flag.**
- Every change is recorded in immutable history with the reason and the actor.
- Set a review date. A flag with no review date becomes permanent by accident.

Never turn on a flag for unfinished functionality. "It is behind a flag" is not a
reason to ship something that does not work.

## Kill switches

A kill switch is not a configuration change either. It **only restricts**, it
never enables, and it never deletes. Where the owning domain has its own
maintenance control, the switch operates that control rather than shadowing it.

Activating one requires the capability, a fresh re-authentication, a written
reason, and an explicit confirmation. Clearing one restores only the recorded
prior state. Existing bookings, conversations, and history are unaffected — that
is guaranteed, not merely intended.

## Before you approve anything, ask

- Which specification owns this value?
- What breaks if this is wrong, and how would we notice?
- Is this reversible by a new version, and have I read the previous one?
- Am I the author? If yes, I cannot approve it.
- Is this the right environment?
