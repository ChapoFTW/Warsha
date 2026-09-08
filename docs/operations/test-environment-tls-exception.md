# Test-environment TLS exception

Status: **prepared, not applied.** The action below needs the machine owner.

## What is wrong

This development machine runs **Avast Web/Mail Shield**, which terminates TLS
and re-signs every certificate. A live handshake to Warsha's production Supabase
host returns a certificate for `CN=supabase.co` issued by
`CN=Avast Web/Mail Shield Root, O=Avast Web/Mail Shield`.

Windows trusts that root, so browsers and `curl` see nothing wrong. Anything
that carries its own trust store does not, and that is one fact behind three
failures previously recorded as separate environment limits:

| Symptom | Where |
| --- | --- |
| `invalid peer certificate: UnknownIssuer` from Deno | Edge Functions cannot be built or deployed |
| `PKIX path building failed` from the Gradle wrapper | local Android builds, until worked around |
| "Please check your internet connection" at sign-in | the Android app, while ICMP, DNS and TCP 443 all succeed |

The last one is what blocks the Production push proof: `push-proof.mjs` passes
eight of its nine checks and fails only at sign-in, because the app cannot
complete a TLS handshake it is willing to trust.

**This is not a Warsha defect.** Warsha's TLS behaviour is correct: it declines
a certificate chain it cannot verify. Nothing in the app should be changed to
make this host work.

## What is NOT the fix

- **Do not** install the Avast root into the Android test estate. It would make
  the emulator trust an interceptor permanently, and every subsequent test would
  be running against a man-in-the-middled channel while reporting itself as a
  clean pass.
- **Do not** relax certificate validation in Warsha, in any build variant.
- **Do not** disable Avast wholesale when a narrower exclusion exists.

## The minimum action

Avast's HTTPS-scanning exclusions are a GUI setting. There is no supported CLI,
and the configuration store under `C:\ProgramData\AVAST Software\Avast` is
protected by Avast self-protection and refuses writes, so this cannot be
scripted and needs the machine owner.

**Avast → Menu → Settings → Protection → Core Shields → Web Shield →
"Exclude the following websites/URLs from HTTPS scanning"**, then add exactly
these six, and nothing else:

```
ekgwzljpcxpxnklzxuvj.supabase.co
exp.host
fcm.googleapis.com
firebaseinstallations.googleapis.com
android.googleapis.com
usewarsha.com
```

Every entry was derived from Warsha's actual code path rather than guessed, and
every one was confirmed intercepted by reading the certificate issuer returned
by a real handshake:

| Host | Why it is on the list |
| --- | --- |
| `ekgwzljpcxpxnklzxuvj.supabase.co` | Production auth, REST and realtime. This is what sign-in fails against. |
| `exp.host` | `getExpoPushTokenAsync` in `src/notifications/push-registration.ts` obtains the push token here |
| `fcm.googleapis.com` | delivery transport underneath the Expo token |
| `firebaseinstallations.googleapis.com` | Firebase installation identity, required before FCM issues a token |
| `android.googleapis.com` | device registration for FCM |
| `usewarsha.com` | the public web surface, so the visual gate measures a real chain |

If per-URL exclusion turns out not to be offered on this Avast edition, the next
narrowest step is to turn off **HTTPS scanning** alone within Web Shield —
leaving Web Shield itself, File Shield, Behaviour Shield and Mail Shield on.
Disabling Web Shield entirely is a further step again and should not be needed.

## Afterwards

The exception exists for the push proof and for hosted testing. When that work
is finished:

1. remove the six exclusions, or re-enable HTTPS scanning, whichever was changed
2. verify protection is actually back — repeat the handshake and confirm the
   issuer is the real CA again, not `CN=Avast Web/Mail Shield Root`:

   ```powershell
   $c = New-Object System.Net.Sockets.TcpClient('ekgwzljpcxpxnklzxuvj.supabase.co', 443)
   $s = New-Object System.Net.Security.SslStream($c.GetStream(), $false, ({$true} -as [Net.Security.RemoteCertificateValidationCallback]))
   $s.AuthenticateAsClient('ekgwzljpcxpxnklzxuvj.supabase.co')
   $s.RemoteCertificate.Issuer
   ```

3. record here that it was restored, with the date

The machine must not be left in a permanently weakened state, and this file is
the record that it was not.

## Restoration log

| Date | Action | By |
| --- | --- | --- |
| — | not yet applied | — |
