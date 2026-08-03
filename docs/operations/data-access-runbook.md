# Data Access Runbook

Authority: Warsha Constitution (§8 trust and privacy) → WPS-017 → WES-017.
Audience: every person holding a Warsha staff role.

## The rule

**Look at the least data that lets you finish the task in front of you.**

Warsha's Constitution says evidence access and retention must be purpose-limited
and auditable. That is not a slogan here: every sensitive read is recorded with
your name, and there is no path to bulk data at all.

## What you can reach, and why

| Surface | Capability | What it shows |
| --- | --- | --- |
| Operational search | `safe_search` | Exact identifiers only; sanitized status rows |
| Safe customer view | `view_safe_customer_profile` | Standing, counts, history summary |
| Safe worker view | `view_safe_worker_profile` | Profile and verification state, counts |
| Contact details | `view_contact_details` | Verified phone or email, nothing else |
| Financial summary | `view_financial_ledger` | Earnings and payout totals |
| Case private notes | the queue's own capability | Staff reasoning on that case |
| Audit explorer | `view_audit_logs` | Read-only records of actions |
| Analytics | `view_analytics` | Aggregates only |
| Exports | `export_operational_report` | Allowlisted columns, bounded range |

If a screen tells you contact or financial detail is hidden, that is the system
working. Do not go looking for another route.

## What nobody can reach, in any role, by any path

- Passwords, access tokens, refresh tokens
- Full payment credentials or card data
- Raw private document URLs or identity document contents
- **National ID — it is not searchable and not projected anywhere**
- Unrelated private chat between a customer and a worker
- Another person's staff-private notes outside your queue
- The raw fraud signals of a specific account, in any dashboard
- Any table, through any query tool — there is no query tool

If you believe you have seen one of these, stop and open a security incident.

## Search discipline

- Search an **exact identifier**. There is no wildcard, no name search, and no
  prefix scan; the server refuses them.
- A free-text lookup by phone or email needs `view_contact_details` and matches
  exactly. It will never return a list of people.
- Search is rate limited, and the limit is checked before anything is read.
- **Every search is recorded** with your account, the kind, and the result count.
  The term itself is hashed, so the log is not a second copy of the data.

Searching an account "just to look" is a policy violation even though the system
will let you do it once. The record exists precisely so that pattern is visible.

## Reasons

A written reason is required for a sensitive export, for a configuration change,
for a role change, for a kill switch, and for every enforcement action in
WPS-016.

Write the reason for the person who reads it in six months during an
investigation. Two facts and a purpose: what you were working on, what you needed,
why the narrower option was not enough.

"Investigating" is not a reason. "Reviewing dispute D-1042 after the customer
disputed the additional-work charge" is.

## Exports

- Only five approved reports exist, each with a fixed column allowlist.
- The date range is bounded and the row count is capped.
- A sensitive export requires a reason before it is created.
- **Authorization is revalidated on every download**, never trusted from the
  original request. An export belongs to the person who requested it, and it
  expires.
- Both the request and every download are audited.

There is **no file download**. No signed URL, no storage bucket, no background
job — so there is nothing to leak, forward, or leave in a downloads folder. The
approved output is a bounded preview inside the platform. If you need data
outside Warsha, that is a decision with its own approval, not an export.

Never paste operational data into a chat, a spreadsheet, a personal device, or an
external tool.

## The audit explorer

Read-only, always. Records cannot be edited or deleted by anyone, including the
person who wrote them and including the database owner.

**Opening the audit explorer is itself recorded.** That is intentional and it
applies to Security Administrators too.

Use it to answer "what happened", not to browse. Filter by a real identifier and
a real date range.

## Analytics

Analytics are aggregates. Small cohorts are **suppressed** and render as "hidden",
never as zero — if you see "hidden", that is the system protecting a handful of
real people, not a bug.

Analytics are for operations and product decisions. They are not a productivity
dashboard for individual staff and not a way to profile an individual customer or
worker. Warsha does not build surveillance.

Every number carries its definition, its time basis, and its known limitations.
Read the limitations before you quote the number.

## If you no longer need access

Say so. Tell a Security Administrator to revoke the role. Revocation is immediate
and clears your sessions. Holding a capability you do not use is a risk you are
carrying for no benefit.

## If something goes wrong

Accidental access happens — a mistyped identifier, a case that turned out not to
be yours. The correct response is to say so immediately. It is recorded either
way, and reporting it yourself is the difference between a mistake and a finding.
