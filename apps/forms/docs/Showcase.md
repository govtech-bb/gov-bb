# Forms showcase

From `apps/forms`, run `pnpm demo` and open **http://127.0.0.1:4175/forms/showcase**.

This uses the actual forms app with a local mock API. Normal `dev` and `build` are unchanged. File bytes are discarded; submissions are not saved or sent. No email or payment processor runs. Stop the server with Ctrl+C. Use `DEMO_PORT=4176 pnpm demo` if the port is occupied.

The introduction links to sample answers, reset, draft mode, closed/not-found/error pages and every confirmation state. These shortcuts replace only this demo's session storage. Sample answers mark steps complete so you can jump to review with `?step=check-your-answers`; the blank journey exercises the normal step guards. The pending-payment button simulates a successful payment locally. Separate shortcuts show payment failure and payment setup failure.

`contracts/showcase-contract.json` is a resolved service contract for the forms renderer, not a registry-ref recipe for the form builder. The demo serves it at `/__demo/contract.json`. Keep its mock-only links and submission choices out of published services.

## Manual checks

| Area                   | What to try                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page layout            | Check header, official/stage banners, skip link, footer, heading/caption, back/continue buttons at desktop, 390 px and 320 px. Tab from the top to reveal the skip link.                                                                                                                                                                                      |
| Contact                | Continue with required fields blank; follow an error-summary link. Enter an invalid email. Switch contact method to make telephone required. Type a masked reference. Check short/medium/full widths, disabled and hidden fields.                                                                                                                             |
| Choices                | Select Organisation, Other and An interpreter to reveal their questions. Change back and confirm hidden questions stop blocking. Check the changing event label and dates title. Open activity groups, choose items, collapse them and check the selections and higher-risk badge. Disabled options must stay disabled. Select too many items to show errors. |
| Conditional step       | Organisation shows a registration step; Individual skips it. Use `ORG-123`.                                                                                                                                                                                                                                                                                   |
| Dates and numbers      | Omit one date part; enter 31 February, a future birth date, an event less than 14 days away, or an end date before its start. Check per-part errors. Enter attendance outside 1–500. Use the time picker.                                                                                                                                                     |
| Address                | Type `Demo` and choose a suggestion: line 2 and parish fill in. Type `offline` for the fallback hint, or `nothing` for no results. Enter an address manually. Open/close directions and confirm its answer is kept.                                                                                                                                           |
| Opening hours          | Add/remove sets, toggle shared weekdays, edit weekends, leave one time blank and continue. Check focus after adding/removing and how closed days appear in review.                                                                                                                                                                                            |
| Uploads                | Download the sample files on the upload step. Test a successful upload, visible progress, `upload-fails.png`, wrong type, oversized file, remove/dismiss/retry, and duplicate filenames. Single plan upload; up to 3 supporting files.                                                                                                                        |
| Repeated fields        | Add/remove text, textarea, number, email and telephone answers; stop at the 3-answer limit. Check numbered labels and retained values when navigating back.                                                                                                                                                                                                   |
| Repeated steps         | Enter the shared team name once. Add a second volunteer, then return and remove it by changing the add-another answer. Check numbering, maximum and review sections.                                                                                                                                                                                          |
| Guidance               | Check plain, inset, warning and details blocks; headings, lists, table, emphasis and links. Open details by keyboard. Leave optional notes blank for an empty review section.                                                                                                                                                                                 |
| Review and declaration | Use Change and return to review. Check file names, selected labels, date/time/hours formatting and repeated sections. Hidden fields and guidance must be excluded. Check applicant name/date and markdown consent; submit without ticking it.                                                                                                                 |
| Submission             | Choose success, processing, failure, server validation error or payment outcomes. For a server error, change the result to Successful submission and retry. Check the organisation-dependent confirmation wording.                                                                                                                                            |
| Confirmation           | Use the introduction's state shortcuts. Check payment due/receipt/failure, reference hidden, reload persistence, Print, contact details and the local feedback form.                                                                                                                                                                                          |
| Markdown               | Check all heading levels used, lists, blockquote, rule, table, long reference, code and links in the introduction, content, consent and confirmation. Check narrow screens and print preview.                                                                                                                                                                 |

All 16 supported field types, four content variants and six behaviour types are present. This is a UI exercise; the mock API does not reproduce production processors or every validation-rule combination. Multi-select dropdowns remain unsupported.

## Existing issues exposed by the demo

- Individual disabled choices can still be selected in radio, select, checkbox and grouped-checkbox fields. Disabling a whole field works.
- Grouped-checkbox answers show stored values such as `cooking, crafts` in review; they should show the option labels.
- `optionalIf` relaxes validation, but the telephone label and its required accessibility attributes do not update when email is selected.

These are existing renderer issues. The demo retains cases that expose them.

## Checks

- `pnpm test -- src/lib/form-builder/showcase-contract.spec.ts` checks schema, full field/behaviour coverage and repeat-step construction.
- `node scripts/demo.mjs --check` starts the demo, checks its API scenarios and shuts it down. Use another `DEMO_PORT` if a preview is already running.
