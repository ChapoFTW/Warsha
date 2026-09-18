# Restore points

Authority: owner decision of 2026-09-17 (OD-001, no exception): before any
Production migration that changes existing data, create and verify a safe
restore point; a self-managed logical backup is acceptable where managed
provider backups are not available. Companion to `backup-runbook.md` (which
still states, correctly, that no managed backup is verified — gap G22) and
`deployment-runbook.md` (step 4: no recorded restore point, no deployment).

## The procedure

```
node scripts/restore-point.mjs --environment <development|production> --expect-ref <project-ref>
```

Run on the operator's Windows machine, with the Supabase CLI linked to the
named project and the local Supabase stack running at the linked project's
service versions (`npx supabase services` shows any difference; record the
linked versions in `supabase/.temp/` and restart the local stack).

It:

1. refuses to run unless the linked project is the one named, and unless the
   remote migration ledger is a prefix of this checkout's;
2. dumps the schema and the data of the linked project (read only) into
   `%LOCALAPPDATA%\Warsha\restore-points\<environment>-<time>\`, never the
   repository;
3. **proves the dump restores**: resets the *local* database to the remote's
   migration head without seeds, waits for the auth and storage services to
   finish their own migrations, empties every table the dump carries, loads the
   data with triggers held, and compares every table's row count with the
   dump. A table the local services lack is allowed only when the dump holds no
   rows for it; any mismatch fails;
4. encrypts both files with AES-256-GCM under a fresh key, wraps the key with
   Windows DPAPI for the current user, and deletes the plaintext;
5. resets the local database to the current migrations, so none of the
   restored data stays on the machine.

On any failure it deletes the plaintext and resets the local database before
it stops. It never prints what it dumped, a connection string, or a raw
database error (errors are reduced to their class and the object named).
`scripts/restore-point.test.mts` holds it to all of this.

What is kept, and what may be written down, is evidence — never data: the
reference, time, remote head, pending migrations, ciphertext sizes and
SHA-256, table and row counts, and the restore check's result.

**A database dump does not contain storage objects** (photos, identity
documents). A restore brings rows back, not files.

## Restoring from one

1. Decrypt, as the same Windows user: unwrap `key.dpapi` with
   `[System.Security.Cryptography.ProtectedData]::Unprotect(..., "CurrentUser")`;
   each `.enc` file is `iv (12 bytes) || tag (16 bytes) || ciphertext`
   (AES-256-GCM). Decrypt to a folder outside the repository.
2. Restore onto the target at the same migration head (`schema.sql` for a
   fresh database; `data.sql` with `session_replication_role = replica`, into
   emptied tables), exactly as step 3 above does locally.
3. Delete the plaintext when done.

A restore onto Production is an incident action and follows
`incident-command-runbook.md`; it is not something this document authorises.

## Record

| Reference | Environment | Taken | Remote head | Tables / rows | Restore check | Used for |
| --- | --- | --- | --- | --- | --- | --- |
| `logical:development:lrhipbcapzfxuwixfoog:2026-09-18T08-56-09-142Z:5135b4560202bfa7` | Development (`warsha-development`) | 2026-09-18 09:00 UTC | `202609070001` | 273 / 5,360 | All 273 tables restored with the dumped row count onto local Supabase at the same head (auth v2.197.0, storage v1.73.1); both files decrypt with a verified tag | Development deployment of 13 migrations, 2026-09-18 |

Ciphertext SHA-256 for that restore point: `schema.sql.enc`
`e5e6a38b4035f1cc0a4c812b7d82205378c3aaddb8732561766fd0b3da0da8f4`,
`data.sql.enc` `5135b4560202bfa785cf377885572977c2093bd963f665ffd62b7a2f93e491c9`.

The first attempt found the local auth service one version behind
Development (`auth.mfa_recovery_code_sets`, `auth.one_time_tokens.expires_at`):
the restore check failed, as it should, until the local stack ran the same
versions.

## Development deployments

| Date | Migrations | Restore point | Verification |
| --- | --- | --- | --- |
| 2026-09-18 | 13: `202609090001` … `202609180001` (dry run matched exactly; CI green on `1b1c030`) | Above | Ledger: local and remote agree at 126, head `202609180001`. Schema: `supabase db diff --linked` against the migrations — every function body identical (one signature printed with its schema), no table or policy difference; Development lacks the local stack's default `pg_net` extension and the original `provider_profiles_user_id_key` constraint, whose uniqueness `provider_profiles_user_id_unique` (202607200006) already enforces. **`verify_platform_release()` was not run**: it needs a staff session on Development, and none is available to the automation |
