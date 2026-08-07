# WPS-024 — Manual governance test suite

**Every case below is NOT RUN.** No case has been executed, on any device or in
any browser. Automated tests are not manual evidence and none is counted as
such here.

Execution belongs to **WPS-025**, which owns manual QA, UX friction review,
defect closure and release certification. WPS-024 does not begin it.

**Total: 96 cases · Executed: 0 · Passed: 0 · Failed: 0 · NOT RUN: 96**

---

## How to use this

Each case names a precondition, an action and the observable result. A case
passes only when the result is observed — not when the code looks right.

Several cases require a feature flag to be enabled first. All WPS-024 surfaces
ship disabled; enabling them is part of the case, and restoring them is part of
finishing it.

---

## A. Legal centre and reader (14)

| # | Case | Status |
| --- | --- | --- |
| A-01 | Signed out, the legal centre lists all twenty-six documents | NOT RUN |
| A-02 | Signed out, a document opens and renders in full | NOT RUN |
| A-03 | Signed out with the network disabled, a document still renders | NOT RUN |
| A-04 | Signed in as a customer, worker-only documents are not listed | NOT RUN |
| A-05 | Signed in as a worker, customer terms are not listed | NOT RUN |
| A-06 | Every document shows version, published date and effective date | NOT RUN |
| A-07 | Every document states which language governs | NOT RUN |
| A-08 | In Arabic, a summary document says on the page that it is a summary | NOT RUN |
| A-09 | In Arabic, a full-text document does **not** show the summary notice | NOT RUN |
| A-10 | Outstanding documents appear above the full list | NOT RUN |
| A-11 | An unknown document key shows the unavailable state, not a crash | NOT RUN |
| A-12 | Back navigation returns to the legal centre, not the app root | NOT RUN |
| A-13 | Long documents scroll without horizontal overflow at 320pt width | NOT RUN |
| A-14 | The reader makes no network request (observed in a proxy) | NOT RUN |

## B. Customer consent flow (10)

| # | Case | Status |
| --- | --- | --- |
| B-01 | A new customer is asked for Customer Terms and Privacy Policy only | NOT RUN |
| B-02 | Accepting records the version, the language and the instant | NOT RUN |
| B-03 | The acceptance appears in the account's acceptance list | NOT RUN |
| B-04 | Accepting in Arabic records `ar` | NOT RUN |
| B-05 | Accepting in English records `en` | NOT RUN |
| B-06 | An accepted document no longer appears as outstanding | NOT RUN |
| B-07 | Worker documents are never offered to a customer | NOT RUN |
| B-08 | Signing out and back in preserves the acceptance | NOT RUN |
| B-09 | Switching accounts shows no trace of the previous account's acceptances | NOT RUN |
| B-10 | An offline acceptance attempt fails visibly and records nothing | NOT RUN |

## C. Worker consent flow (10)

| # | Case | Status |
| --- | --- | --- |
| C-01 | A new worker is asked for Worker Terms, Privacy Policy and Verification Policy | NOT RUN |
| C-02 | Customer Terms are never offered to a worker | NOT RUN |
| C-03 | Accepting all three satisfies the legal gate | NOT RUN |
| C-04 | An unsatisfied legal gate blocks provisional activation | NOT RUN |
| C-05 | The worker sees why activation is blocked, in terms they can act on | NOT RUN |
| C-06 | Accepting the last outstanding document unblocks activation | NOT RUN |
| C-07 | An account that is both customer and worker satisfies both sets separately | NOT RUN |
| C-08 | Accepting Worker Terms does not satisfy Customer Terms | NOT RUN |
| C-09 | The worker's status reads *provisionally active*, not *verified* | NOT RUN |
| C-10 | A customer viewing that worker sees review-in-progress, not verified | NOT RUN |

## D. Material change and re-consent (16)

Requires publishing a test version in a local environment.

| # | Case | Status |
| --- | --- | --- |
| D-01 | A material version makes the document outstanding again | NOT RUN |
| D-02 | The change summary is shown before any choice is offered | NOT RUN |
| D-03 | The document is reachable in one tap from the consent screen | NOT RUN |
| D-04 | An **editorial** version does **not** ask for re-acceptance | NOT RUN |
| D-05 | A **non-material** version does **not** ask for re-acceptance | NOT RUN |
| D-06 | An editorial version still appears in the version history | NOT RUN |
| D-07 | A version with a future effective date does not ask yet | NOT RUN |
| D-08 | The same version becomes askable on its effective date | NOT RUN |
| D-09 | Re-accepting records a new row and preserves the old one | NOT RUN |
| D-10 | A customer material change does not ask a worker to re-accept worker terms | NOT RUN |
| D-11 | A worker material change does not ask for customer terms | NOT RUN |
| D-12 | An urgent change restricts the affected functionality immediately | NOT RUN |
| D-13 | With `reconsent_enforced` off, nothing is blocked | NOT RUN |
| D-14 | With it on, the declared functionality is blocked and nothing else | NOT RUN |
| D-15 | The kill switch lifts the gate without republishing | NOT RUN |
| D-16 | A stale bundle is refused with the "update the app" message | NOT RUN |

## E. Decline handling (12)

| # | Case | Status |
| --- | --- | --- |
| E-01 | "I do not agree" is the same size and prominence as "I agree" | NOT RUN |
| E-02 | Declining shows what stops before it is recorded | NOT RUN |
| E-03 | Declining shows what keeps working | NOT RUN |
| E-04 | The decline can be cancelled without recording anything | NOT RUN |
| E-05 | Declining an editorial change says nothing stops working | NOT RUN |
| E-06 | A recorded decline reads as declined, never as accepted | NOT RUN |
| E-07 | After declining, export is still reachable | NOT RUN |
| E-08 | After declining, support is still reachable | NOT RUN |
| E-09 | After declining, deletion is still reachable | NOT RUN |
| E-10 | After declining, appeals are still reachable | NOT RUN |
| E-11 | Previous acceptances survive a decline of a later version | NOT RUN |
| E-12 | Leaving the screen without choosing records nothing | NOT RUN |

## F. Provisional activation (10)

| # | Case | Status |
| --- | --- | --- |
| F-01 | Completing submission activates the worker without staff action | NOT RUN |
| F-02 | The worker can take work immediately afterwards | NOT RUN |
| F-03 | A missing gate prevents activation and says which | NOT RUN |
| F-04 | The activation kill switch prevents provisional activation | NOT RUN |
| F-05 | Staff see the case in the vetting queue after activation | NOT RUN |
| F-06 | Staff suspension takes effect immediately | NOT RUN |
| F-07 | A suspended worker cannot take new work | NOT RUN |
| F-08 | A correction request restricts new work but not booked work | NOT RUN |
| F-09 | Full approval moves the worker from provisional to full | NOT RUN |
| F-10 | Earnings for completed work survive a later adverse finding | NOT RUN |

## G. Staff governance (8)

| # | Case | Status |
| --- | --- | --- |
| G-01 | Without the capability, the governance screen shows access denied | NOT RUN |
| G-02 | With it, all twenty-six documents are listed with counts | NOT RUN |
| G-03 | No account identity is visible anywhere on the screen | NOT RUN |
| G-04 | Subprocessors show in-use versus approved-not-integrated | NOT RUN |
| G-05 | The AI register shows training as not permitted | NOT RUN |
| G-06 | Every processing activity shows pending review | NOT RUN |
| G-07 | The enforcement section reflects the real flag state | NOT RUN |
| G-08 | An unreadable register shows denied, not empty | NOT RUN |

## H. Language, RTL and accessibility (12)

| # | Case | Status |
| --- | --- | --- |
| H-01 | Every legal screen renders fully in English | NOT RUN |
| H-02 | Every legal screen renders fully in Egyptian Arabic | NOT RUN |
| H-03 | No untranslated English string appears in Arabic | NOT RUN |
| H-04 | Layout direction flips correctly in Arabic on every legal screen | NOT RUN |
| H-05 | Bullet markers sit on the correct side in Arabic | NOT RUN |
| H-06 | The logo is not mirrored on any legal screen | NOT RUN |
| H-07 | Light theme renders correctly | NOT RUN |
| H-08 | Dark theme renders correctly | NOT RUN |
| H-09 | System theme follows the device | NOT RUN |
| H-10 | Text scales with the OS text-size setting without clipping | NOT RUN |
| H-11 | A screen reader announces each section heading as a heading | NOT RUN |
| H-12 | Accept and decline controls meet the minimum touch target | NOT RUN |

## I. Mock parity (4)

| # | Case | Status |
| --- | --- | --- |
| I-01 | In Mock, the legal centre renders with no network | NOT RUN |
| I-02 | In Mock, acceptance and decline behave as on Supabase | NOT RUN |
| I-03 | In Mock, switching accounts isolates acceptances | NOT RUN |
| I-04 | A Supabase failure never falls back to Mock | NOT RUN |

---

## Combined outstanding manual backlog

| Specification | Cases | Executed |
| --- | ---: | ---: |
| WPS-018 through WPS-022 | 728 | 0 |
| WPS-023 | 108 | 0 |
| **WPS-024** | **96** | **0** |
| **Total** | **932** | **0** |
