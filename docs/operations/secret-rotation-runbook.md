# Secret Rotation Runbook

Authority: Warsha Constitution → WPS-018.
Inventory: `src/launch/launch-types.ts` (`secretInventory`) — names and owners
only, **never a value**.

## Rules

1. **A value is never written down here, in the repository, in a workflow file,
   in a commit message, or in a chat message.**
2. A key that must not reach a bundle never carries the `EXPO_PUBLIC_` prefix.
   `audit:environment` fails the build if one does.
3. `audit:secrets` scans every tracked file and the whole git history for
   credential *shapes*, so the scanner never becomes a place a secret lives.
4. Rotation is a two-window operation wherever the provider allows it: issue the
   new value, run both, retire the old. A single-window rotation is an outage.
5. **A secret exposed in git history is exposed forever**, even after a commit
   is removed. Rotate first, then worry about the history.

## The inventory

| Key | Class | Owner | Rotation |
| --- | --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Public | Operations Manager | Changes only with the project |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Public | Operations Manager | With the project API keys |
| `EXPO_PUBLIC_ADMIN_SURFACE` | Build switch | Security Administrator | Not a secret |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** | Security Administrator | Dashboard; immediately on any suspicion |
| `SUPABASE_DB_PASSWORD` | Server only | Security Administrator | Dashboard |
| `SUPABASE_ACCESS_TOKEN` | CI only | Security Administrator | Supabase account tokens |
| `PAYMENT_GATEWAY_API_KEY` | Server only | Financial Operations | Provider dashboard — not yet issued |
| `PAYMENT_WEBHOOK_SIGNING_SECRET` | Server only | Financial Operations | Provider dashboard — not yet issued |
| `PAYOUT_API_CREDENTIALS` | Server only | Financial Operations | Provider dashboard — not yet issued |
| `SMS_PROVIDER_API_KEY` | Server only | Operations Manager | Provider dashboard — not yet issued |
| `APNS_KEY` | Signing | Operations Manager | Apple Developer |
| `FCM_SERVER_CREDENTIALS` | Signing | Operations Manager | Firebase console |
| `ANDROID_KEYSTORE` | Signing | Operations Manager | **Never rotate after publication** |
| `IOS_DISTRIBUTION_CERTIFICATE` | Signing | Operations Manager | Apple Developer |
| `EXPO_TOKEN` | CI only | Operations Manager | Expo account tokens |
| `GOOGLE_PLAY_SERVICE_ACCOUNT` | CI only | Operations Manager | Google Cloud |
| `APP_STORE_CONNECT_API_KEY` | CI only | Operations Manager | App Store Connect |

## Cadence

| Class | Routine | Always rotate on |
| --- | --- | --- |
| Server-only | Every 180 days | Staff departure, suspected exposure, incident |
| CI tokens | Every 180 days | Anyone losing CI access |
| Signing | Only on expiry or compromise | Compromise |
| Public client | Only with the project | Never routinely |

**The Android upload keystore is the exception that matters.** Rotating or losing
it means the app can never be updated under the same listing. It lives in EAS
managed credentials precisely so no human handles it.

## Routine rotation

1. Announce the window; a rotation can break a build.
2. Issue the new value in the provider's console.
3. Store it where the inventory says: EAS environment variables, a GitHub
   environment secret, or the operator's password manager. Never a file.
4. Run both values where the provider allows.
5. Verify: build with the new value, exercise the surface, watch for auth errors.
6. Retire the old value.
7. Record the rotation date and who did it. **No value in the record.**
8. Run `npm run audit:secrets`.

## Emergency revocation

When a value may be exposed:

1. **Revoke first, investigate second.** A revoked credential is an outage; an
   exposed one is a breach.
2. Open a security incident.
3. Revoke or rotate in the provider console.
4. If it is the service-role key: revoke, then read the staff audit and access
   log for what was reached. Those tables are immutable, which is what makes
   them trustworthy here.
5. Revoke affected staff sessions and role grants — both take effect on the next
   call.
6. Update every store.
7. Redeploy or rebuild what carried the old value.
8. Verify the old value no longer works. Test it.
9. Record what was exposed, for how long, and what it could reach.

## Git history

Run before every release and in CI on every pull request:

```
npm run audit:secrets
```

If it finds something:

1. Rotate the value immediately. Do not start with the history.
2. Then decide about the history. Rewriting shared history is disruptive and,
   on a public remote, does not undo the exposure.
3. Record it as a security incident either way.

## Diagnostics

Nothing that captures diagnostics may capture a secret. The structured event log
enforces this at write time: a payload naming a token, secret, password, OTP,
message, document, or payment credential is rejected, as is an email address, an
Egyptian phone number, or a JWT-shaped value. The event still records; the
payload is replaced.

That is a write-time guarantee, not an export-time filter, so a future exporter
cannot leak what was never stored.

## Status

**No rotation has ever been performed.** Most values do not exist yet. The first
rotation drill is a production criterion (R12) and has not been run.
