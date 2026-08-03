# Environment Matrix

Authority: Warsha Constitution → WPS-018.

**One hosted project is never treated as every environment.** A single project
means a development mistake is a production incident, and it makes "did I just
do that to real people?" a question rather than a fact.

## The four environments

| | local | development | staging | production |
| --- | --- | --- | --- | --- |
| Purpose | A developer machine | Shared integration | Rehearsal for production | Real people, real money |
| Supabase project | Docker, ephemeral | Separate project | Separate project | Separate project |
| Data | Seeded fixtures | Synthetic | Synthetic, production-shaped | Real |
| `EXPO_PUBLIC_DATA_MODE` | `mock` or `supabase` | `supabase` | `supabase` | `supabase` |
| `EXPO_PUBLIC_ADMIN_SURFACE` | `enabled` | `enabled` | `enabled` | unset |
| Admin platform | Open | Open | Open | Closed until MFA is configured |
| MFA required | No | No | Recommended | **Required by constraint** |
| Legacy staff gate | Allowed | Allowed | Allowed | **Forbidden by constraint** |
| Dual control | On | On | On | **Cannot be disabled** |
| Payment gateway | `disabled` | `disabled` or `mock` | `sandbox` when a provider exists | `live` only after every gate |
| Payout mode | `disabled` | `disabled` | `sandbox` when licensed | `live` only after licensing |
| Push delivery | Off | Off | Off | Off until a provider is authorized |
| Marketplace | Off | On | On | Off until beta sign-off |
| Feature flags | All off | Per experiment | Per rehearsal | All off unless explicitly activated |
| Backups | None | None | Daily | Daily plus PITR |
| Who may deploy | Anyone | Anyone | Operations Manager | Two approvers |

Status today: **only `local` exists.** `development`, `staging`, and `production`
projects have not been created. That is gap G20 and it blocks private beta.

## Separation rules

1. **Separate projects.** Each hosted environment is its own Supabase project
   with its own URL, keys, database, storage, and auth users.
2. **Separate secrets.** No value is shared between environments, ever. A
   production credential never appears in a development shell, a CI log, a
   workflow file, or a bundle.
3. **No sandbox credential in production, no production credential anywhere
   else.** WPS-015 already binds provider accounts uniquely per
   `(provider_key, environment)`, so the two cannot be mixed by accident.
4. **No cross-environment writes.** There is no code path that writes to one
   environment from another. The only connection an operator holds at a time is
   the one they linked, and the environment badge states which.
5. **Fail closed on missing configuration.** A client that cannot read platform
   status treats the platform as in maintenance. A staff platform without a
   configured MFA provider refuses production entirely.

## Environment indicator

The environment is server-stored, returned in the staff session and in
`get_platform_operational_status`, and rendered as a persistent badge on every
operations screen. Production additionally renders a red alert banner.

Every environment or launch-phase change is written to
`private.platform_environment_events`, which is immutable. There is no quiet
environment change.

## Promotion path

```
local ──► development ──► staging ──► production
  │            │              │             │
  │            │              │             └─ two approvers, recorded restore
  │            │              │                point, dry run, apply, verify
  │            │              └─ Operations Manager, full rehearsal including a
  │            │                 restore drill and the load tests
  │            └─ any developer; synthetic data only
  └─ clean reset must pass before anything leaves the machine
```

A change may only move one step at a time, and only forward. Nothing is
promoted that has not passed the gate below it.

### Gate to development

Clean local reset, every pgTAP suite, every regression suite, typecheck, lint,
mojibake, all three audits, and three exports — the `validate.yml` job set.

### Gate to staging

Everything above, plus: the migration applies to development, the ledgers match,
`verify_platform_release()` reports the expected failure set and no unexpected
one, and the minimum manual subset for the affected domains has been executed.

### Gate to production

Everything above, plus every item in `docs/launch/GO-NO-GO-CRITERIA.md`,
including a **verified restore** on staging — not a backup that exists, a restore
that was performed.

## Configuration that differs per environment

| Setting | Where it lives | Never in |
| --- | --- | --- |
| Supabase URL and anon key | EAS environment variables per profile | The repository |
| Service-role key | An operator's shell for one command | CI, a bundle, a workflow, a file |
| Provider credentials | Supabase project secrets | The repository, any client |
| Feature flags | `private.staff_feature_flags`, keyed by environment | The client |
| Kill switches | `private.staff_kill_switches` | The client |
| Marketplace and payment modes | Their owning domain configuration | The client |

## What must be true before a hosted environment is created

- The project region is Egypt-appropriate and recorded.
- The plan supports the backup and PITR posture in
  `docs/operations/backup-runbook.md`.
- `expected_project_ref` is set on the platform configuration so an operator can
  confirm which project they are pointed at.
- The environment row is set deliberately and the change appears in the
  immutable history.
- A named owner exists for that environment.
