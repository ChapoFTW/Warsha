# Incident Command Runbook

Authority: Warsha Constitution → WPS-017 → WES-017.
Audience: Operations Managers, Security Administrators, on-call engineers.
Related: `payment-incident-runbook.md`, `payment-reconciliation-runbook.md`,
`trust-safety-runbook.md`.

## First, an honest statement

**There is no automated detection.** Warsha does not monitor itself and does not
page anyone. Every incident in this platform is opened by a person who noticed
something. Do not read an empty incident list as "nothing is wrong"; read it as
"nobody has opened one".

Building detection is worthwhile future work. Claiming it exists would be worse
than not having it.

## When to open an incident

Open one when something is broken for **more than one person** and cannot be
fixed by working the affected cases individually:

- payment provider outage
- Supabase outage
- notification outage
- marketplace matching failure
- storage failure
- authentication incident
- security incident
- data-integrity issue
- migration failure

If you are unsure, open it. A closed incident with a two-line timeline costs
nothing. An unrecorded outage costs the next person their whole afternoon.

## Severity

| Severity | Meaning | Expectation |
| --- | --- | --- |
| sev1 | Money or safety is at risk, or the platform is down | Everything else stops |
| sev2 | A core flow is broken for many people | Work it now; update hourly |
| sev3 | Degraded, with a workaround | Work it today |
| sev4 | Contained, low impact | Work it this week |

sev1 and sev2 notify everyone who can manage incidents. Nothing is sent to
customers or workers automatically.

## Opening

1. Choose the category and severity.
2. Write the **internal summary** as what you actually observed: "three card
   attempts in a row returned a gateway error at 14:20". Not "payments broken".
3. List the affected systems.
4. Add a **public summary** only if the incident is customer-visible, and write
   it in plain language that does not blame anyone: "Card payments are
   temporarily unavailable. Cash bookings are unaffected."
5. You become the commander unless you hand it over explicitly.

## Commanding

The commander has one job: **keep the timeline honest**.

- Every action gets a timeline entry as it happens, not afterwards.
- Every entry says what was done, not what was intended.
- Handovers are timeline entries too.
- If you are also fixing the problem, hand command to someone else.

The timeline is immutable. That is deliberate: a postmortem built on an editable
timeline is fiction.

## Mitigating

Prefer the smallest restriction that stops the harm.

1. **Kill switch first** when the failure is in a specific surface. Switches only
   restrict, never delete, and never touch existing bookings, conversations, or
   ledger rows. Clearing one restores the recorded prior state.
2. **Feature flag** if the failure is in something newly released.
3. **Configuration change** only if the value is genuinely wrong; that path needs
   a second approver and is not an emergency tool.
4. **Never** edit data to make a symptom go away. If data is wrong, that is a
   data-integrity incident with its own record.

Every mitigation goes on the timeline, including the ones that did not work.

## Payment, trust, and reconciliation incidents

These have their own runbooks and their own authorities. The incident record
links them together; it does not replace them.

- Payment provider problems: `payment-incident-runbook.md`. WPS-015 owns the
  provider state; the payment maintenance kill switch operates WPS-015's own
  control.
- Reconciliation differences: `payment-reconciliation-runbook.md`. Exceptions
  appear in the reconciliation queue and are decided there.
- Abuse spikes and coordinated behaviour: `trust-safety-runbook.md`. WPS-016
  remains the only enforcement path — an incident never issues a restriction.

## Resolving

An incident is **resolved** when the harm has stopped, not when the cause is
understood. Say which one you mean in the final timeline entry.

**Closed** means resolved and followed up. Do not close without a postmortem
reference for sev1 and sev2.

## Postmortem

Blameless, and written within a week while it is still true.

Cover: what happened, when we noticed and how, what we did, what actually fixed
it, what made it worse, and what would have made us notice sooner. Attach the
reference to the incident record.

The most valuable line in most Warsha postmortems will be "nobody was watching
this". Write it when it is true.

## After every incident, ask

- Would detection have helped, and is it worth building now?
- Did the right people have the right capability, or did someone need break-glass?
- Was any kill switch missing, too broad, or too narrow?
- Did the timeline let a reader reconstruct the event without asking anyone?
