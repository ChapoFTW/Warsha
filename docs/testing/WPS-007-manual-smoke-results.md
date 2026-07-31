# WPS-007 manual smoke results

Do not change a result to `PASS` unless the visible UI, local database, ledger,
and notification expectations in the runbook were manually observed. Allowed
results are `NOT RUN`, `PASS`, `FAIL`, and `BLOCKED`.

| ID | Scenario | Result | Notes |
|----|----------|--------|-------|
| C-01 | Online mock payment success | NOT RUN | |
| C-02 | Online mock payment failure and retry | NOT RUN | |
| C-03 | Duplicate gateway event | NOT RUN | |
| C-04 | Cash selection | NOT RUN | |
| C-05 | Cash confirmation accepted | NOT RUN | |
| C-06 | Cash confirmation rejected or disputed | NOT RUN | |
| C-07 | Full pre-release refund | NOT RUN | |
| C-08 | Partial pre-release refund | NOT RUN | |
| C-09 | Accepted price revision | NOT RUN | |
| C-10 | Rejected price revision | NOT RUN | |
| C-11 | Warsha-funded promotion | NOT RUN | |
| C-12 | Receipt display | NOT RUN | |
| C-13 | Arabic financial UI | NOT RUN | |
| P-01 | Pending earnings | NOT RUN | |
| P-02 | Six-hour eligibility display | NOT RUN | |
| P-03 | Immediate release after customer confirmation | NOT RUN | |
| P-04 | Dispute hold | NOT RUN | |
| P-05 | Available earnings / no rolling reserve | NOT RUN | |
| P-06 | Minimum withdrawal | NOT RUN | |
| P-07 | Successful mock withdrawal | NOT RUN | |
| P-08 | Failed mock withdrawal | NOT RUN | |
| P-09 | Cash commission debt | NOT RUN | |
| P-10 | EGP 500 threshold behavior | NOT RUN | |
| P-11 | Online earnings debt offset | NOT RUN | |
| P-12 | Payout destination masking | NOT RUN | |
| P-13 | Post-release refund recovery | NOT RUN | |
| S-01 | Place and remove an earning hold | NOT RUN | |
| S-02 | Review a withdrawal | NOT RUN | |
| S-03 | Create a partial refund | NOT RUN | |
| S-04 | Duplicate trusted event | NOT RUN | |
| S-05 | Account isolation | NOT RUN | |
| S-06 | Live mode fail-closed | NOT RUN | |

## Defect log

| Defect | Case | Severity | Status | Evidence / reproduction |
| --- | --- | --- | --- | --- |
| | | | | |

## Sign-off

- Tester:
- Date:
- App commit:
- Database migration state:
- Android result:
- iOS result:
- Known defects:
- Deployment recommendation:
