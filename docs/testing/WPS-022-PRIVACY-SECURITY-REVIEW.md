# WPS-022 privacy and security review

A structured pass over the ways this feature could leak, and what stops each
one. Written as an adversary's checklist rather than a feature list, because a
privacy feature fails by what is *present* when it should be absent.

---

## 1. Cross-account exposure

| Attack | Control | Evidence |
| --- | --- | --- |
| Read another account's consent history | RLS `user_id = auth.uid()`; select-only grant | pgTAP: second account sees 0 rows |
| Read another account's deletion request | Same | pgTAP |
| Read another account's export request | Same | pgTAP |
| Read another account's export **manifest** | The manifest lives on the owner-scoped row | pgTAP |
| Download another account's export object | Storage policy scoped to `foldername[1] = auth.uid()`; path constraint enforces the prefix | pgTAP: no non-read policy exists on the bucket |
| See a previous account's data after switching | Generation guard in `PrivacyProvider`; `loadedAccount === accountKey` before any render | `test:wps022` |

## 2. Privilege escalation

| Attack | Control | Evidence |
| --- | --- | --- |
| Insert a consent record directly | No INSERT grant, no INSERT policy; RPC only | pgTAP |
| Mark one's own deletion complete | No UPDATE grant, no UPDATE policy | pgTAP |
| Call the blocker evaluator | `private`, execute revoked | pgTAP: `42501` |
| Call anonymization | `private`, execute revoked | pgTAP: `42501` |
| Call the manifest builder | `private`, execute revoked | pgTAP |
| Reach a registry as `authenticated` | `private` schema holds **zero** grants to client roles | pgTAP |
| `TRUNCATE` a table to bypass RLS | Revoked from `anon` and `authenticated` on every `public` table | pgTAP |
| Staff read an export's contents | No such capability and no such RPC exists | pgTAP + `test:wps022` against the type file |

## 3. Oblique channels

The subtle class: information leaking through a state rather than a field.

| Channel | Risk | Control |
| --- | --- | --- |
| Blocked-deletion reason | Reveals a report, a dispute, or an investigation | Nine opaque slugs; every sentence describes something the reader owns; `legal_hold` says only that data is kept |
| Staff queue | Reveals why somebody is leaving | No reason code, no blocker list — a count only |
| Staff queue identifiers | Correlates a request to a person | Truncated to 8 characters |
| Notification payload | Leaks on a lock screen | All six events carry empty payloads and generic bodies |
| Notification existence | A hold notification would reveal the hold | **No `privacy_legal_hold` event exists** |
| Export manifest | Reveals another party through counts | Counts are of the requester's own rows only |
| Orphan preview | Object paths carry account identifiers | Counts only, never names |
| Realtime | A deletion request on a channel is a leak with a subscription | No privacy table is published |

## 4. Log and analytics leakage

| Risk | Control |
| --- | --- |
| Raw search terms in the access log | Fixed shapes (`privacy_deletion_requests`, `privacy_data_inventory`); pgTAP rejects anything phrase-shaped |
| Personal data in operational events | Safe-detail allowlist; pgTAP rejects `@`, `+20`, `password`, `token`, `national` in privacy events |
| Tokens or secrets in logs | `audit:secrets` across every tracked file and commit |
| Identity numbers | Never stored raw — hash and last four only |
| Exact addresses in analytics | Discovery reads coarse areas; exact coordinates live in `private` with no client grant |

## 5. Destructive-action safety

| Risk | Control |
| --- | --- |
| Retention deletes unreviewed data | Five-condition guard; every rule fails at least two as shipped |
| Retention deletes held data | `hold_scope` per rule; preview reports held accounts |
| Identity documents auto-deleted | Action is `manual_review`; pgTAP asserts it is not `delete` |
| Financial records auto-deleted | Action is `retain`; pgTAP asserts it |
| Cleanup deletes on an ambiguous read | No delete path exists; preview returns `deletionPerformed: false` |
| A hold becomes permanent retention | Mandatory future review date; one-year ceiling; creator cannot release |
| Anonymization breaks another authority | pgTAP asserts the function body references no financial, trust, or referral table |

## 6. Dark patterns

Each was checked as an absence, because each is a *default* in this product
category.

| Pattern | Status |
| --- | --- |
| Deletion hidden or buried | Absent — one row in the ordinary settings list |
| Guilt or retention messaging | Absent — asserted against 5 phrase patterns |
| Misleading button labels | Absent — explicit affirmative and explicit way out |
| Forced support contact | Absent — asserted |
| "Deletion is immediate" | Absent — the opposite is stated |
| "Everything is erased" | Absent — the opposite is stated |
| Type-a-phrase confirmation | Absent — inaccessible by design; two presses instead |
| Required consent shown as a refusable toggle | Absent — renders as a statement |
| Colour-only state | Absent — every state carries an icon **and** a word |

## 7. Honesty of claims

| Claim | Made? |
| --- | --- |
| Legal compliance | **No** — asserted absent from all user copy |
| Statutory retention periods | **No** — every duration marked `pending` |
| Regulator notified | **No** — a recorded decision, never an action |
| Data is anonymous | **No** — documented as pseudonymization |
| Export is ready | **No** — says "being prepared" until a file exists |
| Account is deleted | **No** — no scheduler advances a request |

## 8. Residual risk

Accepted and recorded, not mitigated:

1. **A service-role key holder bypasses everything.** Controls are absence from
   bundles, absence from client code, and the `private` schema grant boundary.
   Nothing inside Postgres can stop the service role.
2. **Anonymization does not delete storage objects.** Rows are cleared; files
   remain until the storage runbook is run by hand.
3. **Sign-in is not disabled on anonymization.** An anonymized account can still
   authenticate into an empty profile.
4. **No scheduler exists.** A deletion request never advances on its own.
5. **Every retention duration is unreviewed.** Ten of eleven rules are `pending`.
6. **No manual case has been executed.** 72 cases, 0 run.

Items 2–4 are gaps in an unwired execution path, behind a flag that is off.
Item 5 is a deliberate refusal to invent law. Item 6 is the standing condition
of the whole repository.

## 9. Verdict

The **implemented** surface — request, cancel, consent, clearing, deactivation,
preview, holds — is sound against the attacks above and carries assertions for
each.

The **unimplemented** surface — file generation, scheduled execution, storage
sweeping, auth disablement — is honestly disabled rather than half-built, and
the copy does not claim otherwise.

Production remains blocked by the WPS-018 launch blockers, which WPS-022 does
not remove.
