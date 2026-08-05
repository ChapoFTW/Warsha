# Runbook — retention execution

**Owner:** Security administrator (execution), Operations manager (previews)
**Capability:** `review_retention`
**Status:** Dry run only. **Execution is disabled and must stay disabled.**

---

## 1. The rule

**No retention rule may execute against production data until its duration has
been reviewed by a qualified professional.** Ten of eleven rules are `pending`.

Warsha has invented no statutory period. Every duration is a product proposal
and the open questions are in
[WARSHA-PRIVACY-LEGAL-QUESTIONS](../../privacy/WARSHA-PRIVACY-LEGAL-QUESTIONS.md).

## 2. The five conditions

```sql
v_rule.enabled                                            -- 1
  and v_rule.legal_review_status = 'approved'             -- 2
  and v_config.retention_execution_enabled                -- 3
  and not private.staff_kill_switch_active('retention_execution')  -- 4
  and private.platform_environment() <> 'production'      -- 5
```

All five must hold. As shipped every rule fails at least two, and pgTAP asserts
that no rule is executable across the whole table.

Condition 5 refuses production outright. Lifting it is not a configuration
change — it is a code change, and it should be reviewed as one.

## 3. Running a dry run

```
staff → /admin/privacy → Retention rules
```

Or directly:

```sql
select public.staff_retention_dry_run('recent_search_history');
```

Returns candidate rows, accounts under hold, the proposed duration, the action
at expiry, the legal-review status, and `executionEnabled` — which will be
`false`.

Every preview writes a run row and a staff audit entry. A rule with no automated
counter returns `supported: false` with a note, and **still records the attempt**
with outcome `refused` — a preview somebody ran is a fact about the platform
either way.

Six rules have counters: `recent_search_history`, `recently_viewed_history`,
`typing_state`, `expired_privacy_exports`, `revoked_device_tokens`,
`rate_limit_events`. The other five are reviewed by hand.

## 4. The dry run is genuinely read-only

Each branch is a `count(*)`. There is no delete anywhere in
`staff_retention_dry_run`, and pgTAP asserts that a preview leaves the target
table untouched.

## 5. Approving a duration — the full sequence

1. Get a written answer from the appropriate professional (see the legal
   questions document for which kind, per rule).
2. Record the answer and its source in `authority` on the rule.
3. Set `legal_review_status = 'approved'`.
4. Run a dry run in `local`. Read the candidate count. If it is surprising,
   stop — a surprising count means the rule does not mean what you think.
5. Check `accountsUnderHold`. Holds must be respected by the executor.
6. Enable the rule (`enabled = true`) in `local` only.
7. Set `retention_execution_enabled = true` in `local` only.
8. Run, verify, and inspect `private.privacy_retention_runs`.
9. **Stop.** Production requires condition 5 to be lifted in code, which is a
   separate, reviewed change.

Never do steps 3 and 6 in the same sitting. The gap is deliberate: it forces the
dry run between the legal decision and the operational one.

## 6. Rules that must never auto-delete

| Rule | Action | Why |
| --- | --- | --- |
| `identity_documents` | `manual_review` | An identity document may be evidence in an investigation |
| `financial_records` | `retain` | Deleting would unbalance the ledger |
| `dispute_evidence` | `manual_review` | A closed dispute can reopen on appeal |

pgTAP asserts none of these three is `delete`. If a future change sets one to
`delete`, that assertion fails — which is the point.

## 7. Holds

Every rule declares a `hold_scope`. An active hold on that scope, or any
`account`-scope hold, blocks the rule for the held account. The dry run reports
the count so it is visible before anyone acts.

An executor that ignores holds is a bug that destroys evidence. Any
implementation must check `private.privacy_hold_active` per subject, not once
per run.

## 8. If the kill switch is pulled

`retention_execution` stops execution immediately. Dry runs keep working, which
is intentional: during an incident you still need to see what *would* happen.

Pulling it requires a reason (the table constrains it). Clearing it sets the
reason back to null.

## 9. What is already handled elsewhere

WPS-022 records these; it does not take them over:

- `communication_configuration.message_retention_days` — WPS-009
- `communication_configuration.safety_report_retention_days` — WPS-009
- `marketplace_configuration.analytics_retention_days` — WPS-008
- `marketplace_configuration.evidence_retention_days` — WPS-008
- `observability_retention_policy` — WPS-018, extended with three privacy streams

Changing a duration in one of those remains that WPS's operation.
