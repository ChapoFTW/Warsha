# Admin Platform Architecture

Authority: Warsha Constitution → domain WPS (006–016) → WPS-017 → WES-017.

## The decision

The Warsha admin platform is a **protected surface inside the existing Expo
project**, mounted at `app/admin/` and gated three times over.

The alternative — a separate web-only application inside the repository — was
considered and rejected.

## Why not a separate web application

A separate app is attractive because it removes admin code from the customer
bundle. It was rejected because on this codebase it would have made the platform
**less** safe, not more:

1. **A second auth path is a second attack surface.** Warsha's session handling,
   token storage, refresh, and recovery live in `src/auth` and `src/lib/supabase`
   and are exercised by every existing suite. A second application means a second
   implementation of the highest-risk code in the product, tested half as much.
2. **The real control is server-side, and it is shared either way.** Every
   operational action is authorized inside a `SECURITY DEFINER` RPC by
   capability. A separate front end would call exactly the same functions with
   exactly the same anon key and the same RLS. It would not gain one additional
   authorization guarantee.
3. **A separate app invites a service-role key.** The most common way admin tools
   leak is a server-side "admin client" holding a service-role key. Staying
   inside the existing Expo client makes that architecturally impossible: there
   is no server in this project to put the key on.
4. **Divergence risk.** Sanitized projections, localization, RTL, brand tokens,
   and accessibility helpers already exist and are regression-tested. Duplicating
   them guarantees drift, and drift in a redaction helper is a data leak.
5. **Operational cost during Manual Alpha.** A second build, export, and
   validation pipeline would triple the release surface while the product is
   still validating its core experience.

The cost of the chosen approach, stated precisely: Expo Router bundles every
route module, so the operations **code** is present in every build — including
one that leaves `EXPO_PUBLIC_ADMIN_SURFACE` unset. This was verified by exporting
without the flag and finding the operations strings still in the bundle.

That code contains no secret, no credential, and no capability. It is a set of
screens that call named RPCs which refuse an unauthorized caller. So this is a
bundle-size and reverse-engineering-noise concern, not an authorization one — but
it must not be described as "the screens do not ship", because they do.

## The three gates

```
┌──────────────────────────────────────────────────────────────────┐
│ 1. BUILD GATE      EXPO_PUBLIC_ADMIN_SURFACE=enabled             │
│    Without it the surface is inert: the guard refuses to open    │
│    it and the repository refuses every call. The route modules   │
│    are still bundled. Defence in depth. NOT authorization.       │
├──────────────────────────────────────────────────────────────────┤
│ 2. PLATFORM GATE   get_staff_session().platformReady             │
│    Server-derived. Production is structurally fail-closed:       │
│    environment='production' requires mfa_required, and           │
│    mfa_provider='none', so production denies everything today.   │
├──────────────────────────────────────────────────────────────────┤
│ 3. CAPABILITY GATE private.require_staff_capability(<cap>)       │
│    Re-checked INSIDE EVERY RPC, every call. This is the only     │
│    security boundary. Everything above it is usability.          │
└──────────────────────────────────────────────────────────────────┘
```

The admin route is deliberately **not** a hidden route. Hiding a route is not a
control; a tampered client can navigate anywhere. Refusing to render is a
courtesy to the operator, and the server refuses regardless.

## Request path

```
Staff device (Expo, anon key, staff member's own session)
        │
        │  supabase-js .rpc('<one named function>')
        ▼
PostgREST  ──►  public.<rpc>  (SECURITY DEFINER, search_path='')
                     │
                     ├─► private.require_staff_capability('<capability>')
                     │        ├─ platform ready?           else 42501
                     │        ├─ capability known?         else 22023
                     │        ├─ capability held?          else 42501
                     │        └─ re-auth fresh (if high risk)? else 42501
                     │
                     ├─► domain read/write  (WPS-006…WPS-016 authority)
                     ├─► private.record_staff_audit(...)   immutable
                     └─► private.staff_log_access(...)     immutable
```

There is no service-role client, no Edge Function with elevated rights, no
generic RPC dispatcher, and no arbitrary SQL executor anywhere on this path.

## Capability resolution

```
auth.uid()
   │
   ├─ profile exists and is not deleted?          else no capabilities
   ├─ trust state not banned or suspended?        else no capabilities
   ├─ staff_role_grants: active, non-revoked, non-expired
   │     └─ (+ legacy bridge → support_agent, DISABLED by default)
   ▼
staff_role_capabilities  ──►  the caller's capability set
```

Resolution is live on every call. Revoking a grant removes access immediately —
there is no cached claim to wait out, and revocation also clears the account's
re-authentication attestations.

## Data boundaries

| Boundary | Rule |
| --- | --- |
| `private` schema | No client role holds any grant. Configuration, flags, switches, exports, audit, access log, session attestations, and case notes all live here. |
| `public` WPS-017 tables | `SELECT` only for `authenticated`, further narrowed by RLS to the capability that owns the row. No `INSERT`/`UPDATE`/`DELETE` grant exists. |
| Projections | Every staff view is a hand-written `jsonb_build_object`, never `select *`. Contact and financial fields are conditional on capability and the projection states when they were withheld. |
| Realtime | No WPS-017 table is published. |
| Search | Exact identifiers only; the raw term is hashed before it reaches the access log. |

## Environment model

`private.staff_platform_configuration` is a singleton holding the environment,
the MFA requirement and provider, the legacy bridge flag, the re-authentication
window, the search rate limit, the export row limit, the analytics range and
minimum cell, and the display timezone.

The environment defaults to `local`. A hosted deployment must set it
deliberately, and the runbook records that step. The database refuses
`production` without `mfa_required`, and no MFA provider exists, so production is
closed by construction rather than by policy.

## What this architecture deliberately does not provide

- No general database browser and no table explorer.
- No free-text search over private documents or chat.
- No bulk export, no file download pipeline, and no unauthenticated link.
- No ranking override, no ledger write, no direct payment-state mutation.
- No automated incident detection, and no claim of one.
- No MFA, and no pretence of one.
