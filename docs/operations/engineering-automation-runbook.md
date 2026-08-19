# Engineering automation

Warsha's engineering commands turn repository evidence into deterministic
handoff, validation, release, and manual-acceptance decisions. They orchestrate
the existing QA and release authorities; they do not replace the Preview
environment checks, database governance, or deployment runbooks.

## Commands

| Command | Purpose | Writes or mutates external state? |
| --- | --- | --- |
| `npm run warsha:handoff` | Generate redacted Markdown and JSON handoffs | Writes ignored `artifacts/` only |
| `npm run warsha:recover` | Inspect interrupted Git/source state | No; read-only and invariant-tested |
| `npm run warsha:impact` | Classify surfaces, OTA/native/backend implications | No |
| `npm run warsha:plan-qa` | Print the required existing validation commands | No |
| `npm run warsha:validate` | Run the plan with direct exit codes and evidence | Validation outputs plus ignored evidence |
| `npm run warsha:release-check` | Classify the release; never publish | No |
| `npm run warsha:release` | Enforce exact-source guards; Preview action needs `--execute` | Only the explicitly selected Preview action |
| `npm run warsha:smoke` | Check public unauthenticated hosts/routes | Read-only HTTPS plus ignored evidence |
| `npm run warsha:acceptance` | Generate only the remaining relevant manual checks | Writes ignored evidence |
| `npm run warsha:agent-handoff` | Generate a copyable, source-derived continuation prompt | Writes ignored evidence |

Use `--base <ref>` to choose a baseline. Otherwise `origin/main` is preferred,
falling back to `HEAD`. `warsha:validate -- --offline` deliberately fails if a
required external read-only check cannot run; it never silently converts that
check to a pass.

`warsha:handoff -- --online` additionally asks authenticated EAS tooling for
the latest Preview update/build identifiers. The default remains deterministic
and local; Vercel/host and unavailable provider evidence stays explicitly
`UNKNOWN` rather than being guessed.

## Evidence and schema

Transient reports live under ignored `artifacts/`. The handoff JSON is schema
version 1, documented by
`scripts/warsha-automation/handoff.schema.json`. A validation result is current
only when its SHA-256 source fingerprint matches the exact HEAD plus dirty and
untracked content. `PASSED`, `FAILED`, `STALE`, and `UNKNOWN` are evidence
states; command definitions are never treated as proof that a command passed.

`docs/engineering/open-work.json` is the committed, deliberately maintained
source for unfinished work. TODO comments are not promoted to project status.
Do not put account identifiers or incident credentials in it.

Before any artifact write, recursive redaction removes home-directory paths,
sensitive-key values, private-key blocks, JWTs, provider token shapes, and
credential-bearing signed URLs. A second pattern check refuses the write if a
credential shape remains. Generated artifacts are still advisory and must be
checked against Git.

## Impact and parity rules

- `web/**` maps to public, customer/worker, or admin origins where the route
  makes that distinction possible; ambiguous web modules conservatively mark
  all web origins.
- `src/**`, `app/**`, `components/**`, and `constants/**` affect shared mobile
  JS. A cheap web import scan adds web surfaces when a changed `src` authority
  is consumed there.
- `android/**` and `ios/**` require that platform's native build.
- Expo app/build configuration, native-capable dependency changes, launcher,
  splash, and notification identity are native changes. OTA is insufficient.
- migrations require a forward database migration workflow; Edge Functions
  require their separate deployment workflow.
- unknown paths fail conservative with `REVIEW REQUIRED`.

This is behavioral parity, not identical UI. Administration remains available
only on `admin.usewarsha.com`; that intentional surface boundary is not a
mobile parity gap.

## Validation and release

The planner always includes whitespace, secret, migration, appearance,
encoding, the explicit deterministic test inventory, typecheck, and lint or
the established cross-platform `qa:validate` gate. It adds web builds/auth/
navigation, auth-focused suites, local database reset/pgTAP/linked dry-run, or
Edge Function inventory when the impact requires them.

`warsha:release` refuses a dirty tree, disallowed branch, non-upstream HEAD,
stale/missing/failed validation, or missing secret-audit evidence. It performs
nothing without `--execute`. It can delegate only to the existing guarded
Preview OTA and Android build commands. iOS signing, Vercel/DNS, mixed releases,
migrations, Edge Functions, provider configuration, and every Production
backend action stop at their existing human/governed boundary. Follow the
deployment runbook rather than bypassing that boundary.

HTTP smoke results prove only host/route/status/locale-direction behavior.
They never prove an authenticated flow. Generated manual acceptance provides
the platform, precondition, exact actions, and expected result still requiring
a person or device.
