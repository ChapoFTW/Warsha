# Support Operations Runbook

Authority: Warsha Constitution → WPS-013 (disputes) → WPS-016 (trust) →
WPS-017 (support cases).
Audience: Support Agents and Operations Managers.

## What a support case is for

A support case handles a problem that is **not already** a dispute and **not
already** an abuse report: account access, booking help, worker onboarding,
verification help, a payment question, a withdrawal question, a technical issue,
app feedback, or something that fits none of those.

## What a support case is never

- **Never a second dispute.** If a customer and a worker disagree about work that
  was done or money that was agreed, that is a WPS-013 dispute. Do not
  re-litigate it in a support case.
- **Never a second abuse report.** If someone is being harassed, scammed,
  impersonated, or pushed off-platform, that is a WPS-016 report. Do not handle
  it as "a technical issue".
- **Never a public social channel.** Support is one participant and Warsha, not a
  forum.
- **Never a way to see something you have no capability for.** If you cannot open
  a record, you are not meant to.

## Reply visibility — get this right every time

Every message you write is one of two things:

| Visibility | Who reads it | Use it for |
| --- | --- | --- |
| `participants` | The person who opened the case, and staff | Anything you are willing for them to read |
| `staff` | Staff only, enforced by row-level security | Your reasoning, what you checked, what you suspect |

The database enforces this — a participant literally cannot read a staff note —
but write as though it might be read anyway. Never put an accusation, a guess
about another person, or another customer's detail in any note.

## Working a case

1. **Read the whole thread first.** Most repeat contacts are a previous answer
   that did not land.
2. **Claim the case.** An unclaimed case gets worked twice or not at all.
3. **Check the safe account view** for standing, booking history, and open
   disputes before you reply. Do not ask the person for information the platform
   already knows.
4. **Answer the actual question.** If you cannot, say what you can do and by
   when.
5. **Move the status honestly.** `waiting_participant` means you are genuinely
   waiting on them, not that you are busy.
6. **Record what you checked** in a staff-private note.

## Escalation

Escalation **links to the record that already exists**. It never creates a second
one.

| Situation | Escalate to | What you do |
| --- | --- | --- |
| Disagreement about completed work or price | `dispute` | Point the participant at the dispute flow; link the dispute id |
| Harassment, fraud, impersonation, off-platform pressure | `trust_report` | Link the existing report; if none exists, ask them to report it — do not report on their behalf and do not name a reporter |
| Money that does not reconcile or a stuck refund | `financial_case` | Link the financial case; Financial Operations decides |
| Something broken for many people | `incident` | Open or link an incident; do not answer fifty cases individually first |

The platform refuses an escalation without a referenced record. That refusal is
the feature.

## Contact details

Most support work does not need a phone number or an email. The safe account view
tells you plainly when contact detail is hidden for your role. If you genuinely
need it, ask someone who holds `view_contact_details` — and expect that access to
be recorded.

Never ask a participant to send identity documents, a National ID, card details,
or a password through a support case. Warsha never asks for those, and a support
case is not a secure channel for them.

## Closing

- **Resolved** means the participant's problem is solved.
- **Closed** means the case is finished, including when there is nothing more to
  do.
- Closing does not delete anything. The history stays, immutably.

## Quality

Read your own closed cases weekly. The three things that predict a bad support
experience are: answering a different question than the one asked, moving the
status without telling the person, and escalating without explaining what happens
next. All three are fixable by writing one more sentence.
