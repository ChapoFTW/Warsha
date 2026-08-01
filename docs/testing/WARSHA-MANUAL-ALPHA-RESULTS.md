# Warsha manual alpha results

Runbook: `docs/testing/WARSHA-MANUAL-ALPHA.md` (version 1.0)
Overall status: **NOT RUN**
Tester: __
Device(s): __
App mode(s) used: __ (supabase / mock)
Session date(s): __

No result below may be inferred from automated tests. Update Result to PASS /
FAIL / BLOCKED as cases are executed; add Severity (P0–P3) only for FAIL.
Screenshots go in `docs/testing/alpha-screenshots/`.

## 1. Environment setup

| ID | Case | Result | Severity | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- |
| A01-01 | Workstation prerequisites | NOT RUN | — | | |
| A01-02 | Windows Firewall allowances | NOT RUN | — | | |
| A01-03 | LAN environment file | NOT RUN | — | | |

## 2. Local Supabase startup

| ID | Case | Result | Severity | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- |
| A02-01 | Start and reset the local stack | NOT RUN | — | | |
| A02-02 | Prepare smoke personas and fixtures | NOT RUN | — | | |
| A02-03 | Default financial safety (fail-closed) | NOT RUN | — | | |

## 3. Expo / mobile-device startup

| ID | Case | Result | Severity | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- |
| A03-01 | Start Metro and load on iPhone | NOT RUN | — | | |
| A03-02 | Branding (splash, BrandLogo) | NOT RUN | — | | |
| A03-03 | Deep links and router health | NOT RUN | — | | |

## 5. Customer onboarding and authentication

| ID | Case | Result | Severity | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- |
| A05-01 | New customer sign-up | NOT RUN | — | | |
| A05-02 | Sign out and sign back in | NOT RUN | — | | |
| A05-03 | Wrong password | NOT RUN | — | | |
| A05-04 | Password reset entry point | NOT RUN | — | | |

## 6. Worker phone OTP and worker-profile creation

| ID | Case | Result | Severity | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- |
| A06-01 | Register Worker W1 by phone | NOT RUN | — | | |
| A06-02 | Rejected phone inputs | NOT RUN | — | | |
| A06-03 | OTP errors, double-tap, rate limit | NOT RUN | — | | |
| A06-04 | Existing worker re-login | NOT RUN | — | | |
| A06-05 | Email customer becomes worker | NOT RUN | — | | |
| A06-06 | Hosted phone auth fails closed | NOT RUN | — | | |

## 7. Worker verification gating

| ID | Case | Result | Severity | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- |
| A07-01 | Upload and submit documents | NOT RUN | — | | |
| A07-02 | Oversized/invalid document rejected | NOT RUN | — | | |
| A07-03 | Staff approval | NOT RUN | — | | |
| A07-04 | Unverified worker not eligible | NOT RUN | — | | |

## 8. Browse Workers

| ID | Case | Result | Severity | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- |
| A08-01 | Categories and catalog | NOT RUN | — | | |
| A08-02 | Search | NOT RUN | — | | |
| A08-03 | Profile routes to Request a Quote | NOT RUN | — | | |
| A08-04 | Favourites | NOT RUN | — | | |

## 9. Get Quotes

| ID | Case | Result | Severity | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- |
| A09-01 | Create a Get Quotes request | NOT RUN | — | | |
| A09-02 | Quotes arrive progressively | NOT RUN | — | | |
| A09-03 | Six deterministic sorts | NOT RUN | — | | |
| A09-04 | Expiry and recovery actions | NOT RUN | — | | |
| A09-05 | Supabase mode honestly unavailable | NOT RUN | — | | |

## 10. Quote revisions

| ID | Case | Result | Severity | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- |
| A10-01 | Worker revises a quote | NOT RUN | — | | |
| A10-02 | Withdraw a quote | NOT RUN | — | | |
| A10-03 | Decline an invitation | NOT RUN | — | | |

## 11. Customer selection and worker confirmation

| ID | Case | Result | Severity | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- |
| A11-01 | Selection gate during collection | NOT RUN | — | | |
| A11-02 | Select a quote | NOT RUN | — | | |
| A11-03 | Worker confirms; booking created | NOT RUN | — | | |
| A11-04 | Selection lock | NOT RUN | — | | |
| A11-05 | Worker confirmation timeout | NOT RUN | — | | |

## 12. Scheduling

| ID | Case | Result | Severity | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- |
| A12-01 | ASAP and Today | NOT RUN | — | | |
| A12-02 | Scheduled with Cairo time | NOT RUN | — | | |
| A12-03 | Flexible window | NOT RUN | — | | |

## 13. Worker availability and capacity

| ID | Case | Result | Severity | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- |
| A13-01 | Binary availability toggle | NOT RUN | — | | |
| A13-02 | Unavailable worker gets no invitation | NOT RUN | — | | |
| A13-03 | Capacity exclusion | NOT RUN | — | | |

## 14. Booking lifecycle

| ID | Case | Result | Severity | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- |
| A14-01 | Customer booking detail and timeline | NOT RUN | — | | |
| A14-02 | Provider job progression | NOT RUN | — | | |
| A14-03 | Completion evidence upload | NOT RUN | — | | |

## 15. Chat

| ID | Case | Result | Severity | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- |
| A15-01 | Two-way conversation | NOT RUN | — | | |
| A15-02 | Image attachment rules | NOT RUN | — | | |
| A15-03 | Cancelled booking locks immediately | NOT RUN | — | | |
| A15-04 | Completed booking 48-hour window | NOT RUN | — | | |

## 16. Request edits

| ID | Case | Result | Severity | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- |
| A16-01 | Minor clarification within window | NOT RUN | — | | |
| A16-02 | Major change creates replacement | NOT RUN | — | | |
| A16-03 | Edits blocked after selection | NOT RUN | — | | |

## 17. Request cancellation

| ID | Case | Result | Severity | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- |
| A17-01 | Cancel before selection, no fee | NOT RUN | — | | |
| A17-02 | Post-cancellation recovery | NOT RUN | — | | |

## 18. Worker cancellation and Rescue Mode

| ID | Case | Result | Severity | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- |
| A18-01 | Rescue rematching excludes worker | NOT RUN | — | | |
| A18-02 | Different terms need reapproval | NOT RUN | — | | |

## 19. Running Late

| ID | Case | Result | Severity | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- |
| A19-01 | Worker reports Running Late | NOT RUN | — | | |

## 20. Customer and worker no-shows

| ID | Case | Result | Severity | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- |
| A20-01 | Customer reports worker no-show | NOT RUN | — | | |
| A20-02 | Worker reports customer no-show | NOT RUN | — | | |
| A20-03 | No punishment from single events | NOT RUN | — | | |

## 21. Emergency flow

| ID | Case | Result | Severity | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- |
| A21-01 | Surcharge preview and approval | NOT RUN | — | | |
| A21-02 | ETA-first dispatch, single winner | NOT RUN | — | | |

## 22. Cash payment

| ID | Case | Result | Severity | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- |
| A22-01 | Cash selection and instructions | NOT RUN | — | | |
| A22-02 | Dual cash confirmation | NOT RUN | — | | |
| A22-03 | Cash disputed | NOT RUN | — | | |
| A22-04 | Cash restriction above EGP 500 | NOT RUN | — | | |

## 23. Mock online payment

| ID | Case | Result | Severity | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- |
| A23-01 | Online mock success | NOT RUN | — | | |
| A23-02 | Failure then retry | NOT RUN | — | | |
| A23-03 | Duplicate gateway event | NOT RUN | — | | |

## 24. Price adjustment

| ID | Case | Result | Severity | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- |
| A24-01 | Accepted price revision | NOT RUN | — | | |
| A24-02 | Rejected price revision | NOT RUN | — | | |

## 25. Completion

| ID | Case | Result | Severity | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- |
| A25-01 | Customer-confirmed release | NOT RUN | — | | |
| A25-02 | Six-hour release eligibility | NOT RUN | — | | |
| A25-03 | Pending earnings display | NOT RUN | — | | |

## 26. Reviews and replies

| ID | Case | Result | Severity | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- |
| A26-01 | Submit a review with photos | NOT RUN | — | | |
| A26-02 | Worker reply | NOT RUN | — | | |
| A26-03 | Profile rating aggregates | NOT RUN | — | | |
| A26-04 | Review gating | NOT RUN | — | | |

## 27. Warranty / comeback behavior

| ID | Case | Result | Severity | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- |
| A27-01 | Warranty is fail-closed everywhere | NOT RUN | — | | |

## 28. Local-data import

| ID | Case | Result | Severity | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- |
| A28-01 | One-time import of mock data | NOT RUN | — | | |
| A28-02 | Retry is idempotent | NOT RUN | — | | |
| A28-03 | Bookings and files never imported | NOT RUN | — | | |

## 29. English / Arabic / RTL

| ID | Case | Result | Severity | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- |
| A29-01 | Global language switch and RTL | NOT RUN | — | | |
| A29-02 | Arabic financial surfaces | NOT RUN | — | | |
| A29-03 | Arabic marketplace flow | NOT RUN | — | | |

## 30. Accessibility

| ID | Case | Result | Severity | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- |
| A30-01 | Screen reader pass | NOT RUN | — | | |
| A30-02 | Dynamic type | NOT RUN | — | | |
| A30-03 | Contrast and touch targets | NOT RUN | — | | |

## 31. App restart / background / reconnect

| ID | Case | Result | Severity | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- |
| A31-01 | Background during quote collection | NOT RUN | — | | |
| A31-02 | Kill and restart | NOT RUN | — | | |
| A31-03 | Network loss and reconnect | NOT RUN | — | | |
| A31-04 | Notification deduplication | NOT RUN | — | | |

## 32. Account isolation

| ID | Case | Result | Severity | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- |
| A32-01 | Persona cross-visibility | NOT RUN | — | | |
| A32-02 | Automated probes | NOT RUN | — | | |

## 33. Safe-mode restoration

| ID | Case | Result | Severity | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- |
| A33-01 | Disable all financial modes | NOT RUN | — | | |
| A33-02 | Final restoration checklist | NOT RUN | — | | |
