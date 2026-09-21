# Landing EHO contact lines follow the canonical polyclinic names

## Context

#2645 normalised the seven Environmental Health polyclinic names on the two
confirmation surfaces — the confirmation page and the applicant email — because
the contact line has to agree with the `{polyclinic}` name rendered in the same
body, and that name comes from the routing GeoJSON. It also collapsed the
recipes' duplicated contact lists into one table, `POLYCLINIC_CONTACTS` in
`packages/form-conditions/src/confirmation-markdown.ts`.

The landing service pages were the third copy, and nobody updated them. So the
same clinic carried one spelling on the page a citizen reads first and another
on the confirmation page and in their email. #2660 is the follow-up.

## What we did

One commit against `main`: 14 markdown files under `apps/landing/src/content/`,
79 lines, content only. No code, no phone numbers, no email addresses, no
`tel:`/`mailto:` targets changed.

Four names were wrong everywhere they appeared — `Randall Phillips` →
`Randal Phillips`, `Winston Scott` → `Sir Winston Scott`, `St. Phillip` →
`St. Philip`, and `Health and Social Services Complex` →
`Health & Social Services Complex`.

The user also asked to settle the formatting drift in the same bullets, which
the issue had explicitly left out of scope: the name/details separator was `:`
on six pages and ` - ` on the rest, and three pages
(`offensive-waste`, `offensive-matter`, `restaurant-licence`) rendered the phone
without the `(246)` prefix the canonical line carries. Both are now canonical.

Code review then caught a third divergence: the pages list the seven clinics in
a different order from `ALL_POLYCLINIC_CONTACTS_MARKDOWN`, which renders in
`POLYCLINIC_CONTACTS` key order. The landing lists were alphabetical under the
_old_ names, and the rename broke that — `Sir Winston Scott` sorts before
`St. Philip`, where `Winston Scott` sorted after `St. Phillip`. So the rename
left the pages neither alphabetical nor in canonical order. All 14 now match
`POLYCLINIC_CONTACTS` order exactly.

## Why we did it that way

**The rewrite keyed on the `tel:` number, not the name.** The obvious approach
is a find-and-replace per misspelling, but that keys the edit on exactly the
field that had drifted, and it cannot fix the separator or the missing area
code without a second, differently-shaped pass. Instead the script parsed the
seven canonical lines straight out of `POLYCLINIC_CONTACTS`, indexed them by
the phone number in their `tel:` href, and replaced each bullet's content
wholesale. The phone number is the one part of the line that never drifted, so
it is a stable join key; and because the canonical strings were read from the
source file rather than retyped, there was no opportunity to transcribe a name
wrong or pair a clinic with another clinic's details.

**Each file kept its own list marker.** The 14 files disagree about bullet
indentation (`-   ` vs `- `). That difference is invisible once rendered, and
markdown is not prettier-managed here — the repo's `lint-staged` only covers
`*.{json,ts}`, which is why the two styles coexisted in the first place. Only
the content after the marker was rewritten, so the diff stays legible as a
content change.

**No decision record.** The rule this establishes — landing's contact lines
must match `POLYCLINIC_CONTACTS` — is real, but #2661 ("Decide where the public
polyclinic contact lines live: code or `catchment_contact`") is open and is
exactly the decision that would supersede it. Writing an ADR now would
pre-empt that and be overturned by it.

**No regression test.** Agreed with the user up front. Landing has no
content-linting test today, and a guard that imports `@govtech-bb/form-conditions`
into landing runs into landing's separate tsconfig path resolution. The
throwaway checker used during the work is the shape such a guard would take if
#2661 decides landing should keep restating the data.

## What we almost got wrong

**A verification grep was vacuously true.** The check for "did any line outside
the contact bullets change?" was `git diff -U0 | grep -E '^[-+][^-+]'`. A
removed markdown bullet appears in a diff as `--   Name …` — dash for the
deletion, dash for the list marker — so the pattern matched nothing and
reported a clean zero for the wrong reason. It was caught only because the
count disagreed with `--stat`. The corrected check confirmed all 158 changed
lines (79 removed, 79 added) carry an EHO `tel:` link. **A verification that
returns "zero problems" should be made to return non-zero at least once before
it is believed** — the red run of the contact-line checker did that job; this
grep never had one.

**A rename can silently break an ordering that nothing asserts.** The contact
lists were sorted by clinic name, but nothing recorded that they were sorted, so
renaming one clinic quietly destroyed the property. This is the second-order
cost of the same duplication #2661 is about: a list restated by hand has
invariants that only a reader can see. The reorder here was done by sorting the
whole seven-bullet run by canonical index rather than by swapping the two
offending lines, so the fix holds if `POLYCLINIC_CONTACTS` is ever reordered
again.

**The worktree based off a stale local `main`.** `EnterWorktree` branched from
the local ref, 9 commits behind `origin/main`, despite a fetch immediately
beforehand. Reset to `origin/main` before any edit.

## Open questions

- **All 14 pages are `visibility: preview`.** None is live to the public yet,
  so this corrects no spelling a citizen can currently read — it stops the
  inconsistency from shipping when those pages go public. Worth knowing if
  anyone tries to verify the fix against the live site and finds no page.
- The three pages that were missing the `(246)` prefix suggest the contact
  block was pasted between pages at different times rather than generated.
  #2661 is where that gets fixed properly.
- A **fourth** copy of the clinic names exists that nobody had counted:
  `apps/landing/src/routes/health-and-emergency-services/find-an-open-pharmacy/-data/pharmacies.json`,
  which still says `"Winston Scott Polyclinic"` at line 6 while already using
  `Randal Phillips` and `St. Philip` elsewhere in the same file. Deliberately
  not touched here — different dataset, different phone numbers, and the
  `winston-scott-polyclinic` slug is URL-bearing, so it needs its own thought
  about redirects. Filed separately.
