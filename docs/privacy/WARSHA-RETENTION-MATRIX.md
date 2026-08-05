# Warsha retention matrix

> **Every duration below is a product proposal.** None is a statement of law.
> Ten of the eleven rules carry `legal_review_status = 'pending'`, and the
> execution guard refuses to run a rule that is not `approved`. The open
> questions are in
> [WARSHA-PRIVACY-LEGAL-QUESTIONS](WARSHA-PRIVACY-LEGAL-QUESTIONS.md).

The authoritative copy lives in `private.privacy_retention_rules`.

## The rules

| Rule | Data class | Target | Trigger | Proposed | Action | Review | Owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `recent_search_history` | derived_personalization | `public.user_recent_searches` | last search | 90 d | delete | pending | operations_manager |
| `recently_viewed_history` | derived_personalization | `public.user_recently_viewed_providers` | last view | 90 d | delete | pending | operations_manager |
| `typing_state` | ephemeral | `public.conversation_typing` | row expiry | 1 d | delete | **approved** | operations_manager |
| `expired_privacy_exports` | account_private | `public.privacy_export_requests` | export expiry | 3 d | delete | pending | security_administrator |
| `revoked_device_tokens` | credential_secret | `private.notification_device_tokens` | token revoked | 180 d | delete | pending | security_administrator |
| `rate_limit_events` | operational_audit | `private.rate_limit_events` | event recorded | 7 d | delete | **approved** | operations_manager |
| `identity_documents` | identity_sensitive | `storage.verification-documents` | verification decided | 1825 d | manual_review | pending | security_administrator |
| `financial_records` | financial_authoritative | `private.financial_ledger_entries` | transaction settled | 3650 d | **retain** | pending | finance_controller |
| `dispute_evidence` | support_restricted | `storage.dispute-evidence` | dispute closed | 730 d | manual_review | pending | operations_manager |
| `support_attachments` | support_restricted | `storage.support-attachments` | case closed | 365 d | manual_review | pending | operations_manager |
| `chat_messages` | participant_private | `public.messages` | booking closed | 1095 d | manual_review | pending | operations_manager |

Two rules are `approved`, and both for the same reason: they hold no personal
content. `typing_state` rows carry their own expiry and no message text.
`rate_limit_events` are counters with hashed subjects, and their duration was
already recorded in WPS-018's `observability_retention_policy`.

**No identity, financial or dispute rule deletes automatically.** They are
`manual_review` or `retain`, and pgTAP asserts none of them is `delete`.

## The execution guard

```sql
v_rule.enabled
  and v_rule.legal_review_status = 'approved'
  and v_config.retention_execution_enabled
  and not private.staff_kill_switch_active('retention_execution')
  and private.platform_environment() <> 'production'
```

Five independent conditions, all of which must hold. As shipped **no rule is
executable**, and pgTAP asserts that across the whole table.

Production execution additionally requires an approved change through
[RETENTION-EXECUTION-RUNBOOK](../operations/privacy/RETENTION-EXECUTION-RUNBOOK.md).
It is refused in this migration by design.

## Dry run

`public.staff_retention_dry_run(rule_key)` requires the `review_retention`
capability, counts candidates, records a run, writes a staff audit entry, and
returns:

```json
{
  "ruleKey": "recent_search_history",
  "mode": "dry_run",
  "supported": true,
  "candidateRows": 0,
  "accountsUnderHold": 0,
  "proposedDays": 90,
  "actionAtExpiry": "delete",
  "legalReviewStatus": "pending",
  "executionEnabled": false
}
```

Six rules have an automated counter. The other five return `supported: false`
with an explanatory note rather than a misleading zero — and the attempt is
still recorded as a run with outcome `refused`, because a preview somebody ran
is a fact about the platform either way.

## Holds override retention

Every rule declares a `hold_scope`. An active hold on that scope, or an
account-scope hold, blocks the rule for the held account. The dry run reports
how many accounts are held so the number is visible before anyone acts.

## Relationship to existing retention

WPS-022 does not replace what already existed. It **records** it:

| Existing | Owner | Status |
| --- | --- | --- |
| `communication_configuration.message_retention_days` | WPS-009 | Still the authority for messages; `chat_messages` documents it |
| `communication_configuration.safety_report_retention_days` | WPS-009 | Unchanged |
| `marketplace_configuration.analytics_retention_days` | WPS-008 | Unchanged |
| `marketplace_configuration.evidence_retention_days` | WPS-008 | Unchanged |
| `observability_retention_policy` | WPS-018 | Extended with three privacy streams |

The three new observability streams — `privacy_legal_hold_events`,
`account_deletion_events`, `privacy_anonymization_log` — are all 3650 days,
`contains_personal_data = false`, owned by the security administrator, and
never pruned automatically.
