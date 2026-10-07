# Forms smoke audit — 9 September 2026

All 40 active cases were exercised against the stable sandbox deployment. Final results, including the hotel rerun: **18 passed, 22 failed, 4 existing fixme cases skipped**. The suite is not green.

The four standard sandbox deployment smokes (JobStart, Sports Training, Project Protege and Beach/Park) all pass independently in [Deploy Sandbox](https://github.com/govtech-bb/gov-bb/actions/runs/34373894386). The target included the selector fixes merged in #2652.

## Changes and verification

- All smoke files now use the configured preview token when opening a form. This replaces duplicated opening logic and lets the older private-form cases reach their fields.
- The hotel visibility check now locates its radio through the fieldset and option value. Both hotel cases passed on rerun.
- The previously local-only catchment case now supplies the two documents required by the published recipe and was exercised against sandbox. It reaches confirmation but its reference-prefix assertion fails.
- 911 forms unit tests, 103 local browser tests (mocked APIs), TypeScript, installed ESLint and the required 20-project build pass. Landing is excluded locally as instructed by the repository.
- The sandbox smoke token disables email, webhook and payment processors. All 11 captured HTTP 400 submission failures carried the matching smoke token.
- An earlier run against the PR preview was interrupted when #2652 merged and removed that preview; those infrastructure failures are excluded from these totals.

## Remaining failures

- **11 private submissions:** the same-site URL cleanup removes the preview token; submission requests then omit X-Recipe-Preview and receive HTTP 400. That cleanup dates to commit 2ef79f31c (25 June), before this package migration. Loading through the preview cookie succeeds; submitting requires the secret header.
- **7 recipe mismatches:** food business (2), funeral establishment (1), swimming pool (2) and NHC (2) expect older fields, option values or step order.
- **3 stale dates:** postal redirection fixtures use August/September dates that now fail the future-date rule.
- **1 reference mismatch:** the catchment recipe returns RAEHO while its test expects MOH-EHO. The request was saved and the confirmation displays St. Philip Polyclinic; the test remains failed.

## Results by form

| Form                                    | Passed | Failed | Skipped | Finding                                                                                   |
| --------------------------------------- | -----: | -----: | ------: | ----------------------------------------------------------------------------------------- |
| apply-for-conductor-licence             |      0 |      1 |       0 | Preview token lost before submission (HTTP 400).                                          |
| apply-for-food-business-licence         |      0 |      2 |       0 | Recipe now uses yes instead of myself; applicant telephone moved.                         |
| apply-for-funeral-director-licence      |      1 |      0 |       0 | Passed.                                                                                   |
| apply-for-funeral-embalmer-licence      |      1 |      0 |       0 | Passed.                                                                                   |
| apply-for-funeral-establishment-licence |      0 |      1 |       0 | Applicant email moved out of the tested step.                                             |
| apply-for-hair-salon-licence            |      2 |      0 |       0 | Passed.                                                                                   |
| apply-for-hairdresser-licence           |      3 |      0 |       0 | Passed.                                                                                   |
| apply-for-hotel-licence                 |      2 |      0 |       0 | Both pass after correcting the remaining radio selector.                                  |
| apply-for-restaurant-licence            |      2 |      0 |       0 | Passed.                                                                                   |
| apply-for-swimming-pool-licence         |      0 |      2 |       0 | Recipe starts at your-details; tests expect about-application.                            |
| apply-for-temporary-restaurant-permit   |      1 |      0 |       0 | Passed.                                                                                   |
| barbados-secondary-entrance-exam-choice |      0 |      1 |       0 | Preview token lost before submission (HTTP 400).                                          |
| cape-exam-registration-2024             |      0 |      1 |       0 | Preview token lost before submission (HTTP 400).                                          |
| csec-private-candidate-registration     |      0 |      1 |       0 | Preview token lost before submission (HTTP 400).                                          |
| duties-performed-exam-claim             |      0 |      1 |       0 | Preview token lost before submission (HTTP 400).                                          |
| eho-frederick-miller-local              |      0 |      1 |       0 | Submission succeeds and St. Philip is displayed; expected MOH-EHO prefix, received RAEHO. |
| get-a-primary-school-textbook-grant     |      0 |      1 |       0 | Preview token lost before submission (HTTP 400).                                          |
| get-birth-certificate                   |      0 |      0 |       1 | Existing fixme: payment confirmation issue.                                               |
| get-death-certificate                   |      0 |      0 |       1 | Existing fixme: payment confirmation issue.                                               |
| get-marriage-certificate                |      0 |      0 |       1 | Existing fixme: payment confirmation issue.                                               |
| homeschooling-application-2024          |      0 |      1 |       0 | Preview token lost before submission (HTTP 400).                                          |
| jobstart-plus-programme                 |      1 |      0 |       0 | Passed.                                                                                   |
| nhc-land-property-application           |      0 |      2 |       0 | Recipe reaches other-income; tests expect household-income.                               |
| post-office-redirection-business        |      0 |      1 |       0 | Hard-coded 1 September 2026 start date is now in the past.                                |
| post-office-redirection-deceased        |      0 |      1 |       0 | Hard-coded 1 August 2026 start date is now in the past.                                   |
| post-office-redirection-individual      |      0 |      1 |       0 | Hard-coded 1 August 2026 start date is now in the past.                                   |
| project-protege-mentor                  |      1 |      0 |       0 | Passed.                                                                                   |
| referral-student-support-services       |      0 |      0 |       1 | Existing fixme: required checkbox has no options.                                         |
| request-an-environmental-health-officer |      2 |      0 |       0 | Passed.                                                                                   |
| sell-goods-services-beach-park          |      1 |      0 |       0 | Passed.                                                                                   |
| sports-training-programme-form-schema   |      1 |      0 |       0 | Passed.                                                                                   |
| statement-of-travelling-form            |      0 |      1 |       0 | Preview token lost before submission (HTTP 400).                                          |
| temp-teacher-application                |      0 |      1 |       0 | Preview token lost before submission (HTTP 400).                                          |
| term-leave-application                  |      0 |      1 |       0 | Preview token lost before submission (HTTP 400).                                          |
| vendor-registration                     |      0 |      1 |       0 | Preview token lost before submission (HTTP 400).                                          |

React Doctor was not run for these fixes: automatic approval review blocked downloading and executing the external package. The installed checks listed above were used.
