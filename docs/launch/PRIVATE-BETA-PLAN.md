# Private Beta Plan

Authority: Warsha Constitution → WPS-018.
Status: **NOT STARTED.** Blocked by gaps G19–G26 in the readiness gap register.

## The shape of it

Deliberately small. Warsha is technically capable of Egypt-wide coverage across
every category, and activating that would be the fastest way to damage the trust
the product exists to build. The Constitution's promise — *finishes your work
safely, for the fairest price* — is easier to keep for eighty people than for
eight thousand, and the first job of the beta is to find out whether we can keep
it at all.

## Cohort

| | Target |
| --- | --- |
| Customers | 50–80 |
| Workers | 15–25, verified individually before the beta opens |
| Governorate | Cairo only, 3–4 adjacent districts |
| Categories | 3: plumbing, electrical, AC |
| Duration | 6 weeks, reviewed every Friday |
| Bookings expected | 60–150 total |

Workers are recruited first. A marketplace with customers and no workers teaches
nothing except that we cannot supply demand.

## What is on

| Capability | State |
| --- | --- |
| Marketplace requests, invitations, quotes, selection | On |
| Booking lifecycle, job execution, return visits | On |
| Booking chat and attachments | On |
| Reviews and reputation | On |
| Disputes | On, staffed by a named reviewer |
| Trust reports, restrictions, appeals | On |
| Support cases | On |
| Cash payment | On |
| Staff operations platform | On, staging-grade, for the operating team |

## What is off, and stays off

| Capability | Why |
| --- | --- |
| Online card payments | No provider decision, no credentials, no legal review |
| Payouts | Disbursement licensing unresolved |
| Automatic earnings release | No scheduler runs |
| Push notifications | No provider, no credentials |
| Call relay | No telephony provider |
| Emergency requests | Needs an operational response we cannot yet staff |
| Rescue Mode | Same |
| Over-the-air updates | Deliberately not enabled |

Cash-only means the commission is collected as cash commission debt under
WPS-007. Every participant is told this in plain language before they join.

## Onboarding

Manual, by a person, in Egyptian Arabic.

1. A worker is contacted directly, verified in person or by video, and helped
   through identity verification on their own handset.
2. A customer is invited by name. There is no open sign-up and no referral link.
3. Every participant receives: what Warsha is, what is switched off, that cash
   is the only payment method, that they can leave at any time, how to reach a
   human, and what happens to their data if the beta stops.
4. **Consent is recorded before any account is created** — that this is a beta,
   that things will break, that their feedback will be read by people, and that
   their data may be deleted at the end.

## Support

| | Commitment |
| --- | --- |
| Hours | 09:00–21:00 Africa/Cairo, seven days |
| First response | Within 2 hours in hours; next morning outside them |
| Channel | Phone and WhatsApp, staffed by a named person |
| Dispute response | Same day |
| Incident contact | The rostered Operations Manager, named on the roster, not "the team" |

If nobody is rostered on a given day, the beta does not run that day. Support
that is nominally available and actually absent is worse than stated hours.

## Success metrics

Read together, never individually.

| Metric | Target | Why this one |
| --- | --- | --- |
| Requests receiving at least one quote | ≥ 80% | A request with no quote is a broken promise |
| Median time to first quote | ≤ 20 minutes | The core value claim |
| Bookings completed / bookings confirmed | ≥ 85% | Whether work actually finishes |
| Disputes / completed bookings | ≤ 5% | Whether the agreement model holds |
| Worker repeat participation (week 2 → week 6) | ≥ 70% | Whether workers find it worth the effort |
| Customer repeat booking | ≥ 25% | Whether the experience was good enough to return |
| Cash commission collected / owed | ≥ 90% | Whether the cash model is viable at all |
| Support contacts / booking | ≤ 0.5 | Whether the product needs a human to work |

A target missed is a finding, not a failure. A target *met* while participants
tell us the product is confusing is also a finding.

## Stop conditions

Stop immediately, without discussion, on any of these:

- A safety incident involving a worker or a customer.
- Money is wrong: a customer charged incorrectly, or a worker's earnings
  misstated.
- A data exposure of any size.
- A verification approval that turns out to be wrong.
- Two or more disputes in one week alleging the same product failure.
- The team cannot staff support for two consecutive days.

Pause and review, within 24 hours, on:

- Quote coverage below 60% for three consecutive days.
- Any dispute unresolved after 72 hours.
- Cash commission collection below 70%.

## Rollback

The beta is switched off, not wound down: activate the
`new_marketplace_requests` kill switch, which sets the WPS-008 activation flag to
false. Existing bookings, conversations, disputes, and history are untouched —
that is guaranteed by the switch design, not merely intended. Participants are
told the same day, by the same person who onboarded them.

Full detail: `docs/launch/ROLLBACK-PLAN.md`.

## Data cleanup

- Participants are told at onboarding what will happen to their data.
- On request, an account is deleted and its personal data removed; immutable
  audit, financial, and dispute history is retained as the Constitution and
  WPS-007 require, and participants are told that plainly rather than promised a
  deletion Warsha cannot perform.
- Synthetic and test accounts are removed at the end of the beta.
- Feedback is stored separately from account data and is not linked back to an
  individual in any analytics.

## Feedback

Weekly, by a person, by phone — not a form. Three questions:

1. What did you try to do that did not work?
2. What did you have to explain to someone else about how Warsha works?
3. Would you use it again next week, and honestly why or why not?

Every friction point raised is logged as a defect. This is Manual Alpha
discipline carried into the beta: an unnecessary tap is a bug.

## Entry gate

The beta does not open until every item in `docs/launch/GO-NO-GO-CRITERIA.md`
marked *private beta* is genuinely satisfied. As of 2026-08-03, none of the
manual test cases has been executed and eight blockers are open.
