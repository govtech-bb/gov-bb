# The parish house style reaches data files, not just prose

## Context

#2144 was filed after a reviewer flagged parish formatting on a marriage
certificate page that turned out to be correct. It listed three stragglers
missing the `St.` period on the self-employed NIS pages, twelve `Saint X`
spellings in the emergency shelter dataset, and ended with an explicit open
question: does the `St.` house style — set by 08c47774 — apply to data files
at all, or only to hand-written prose?

By the time this session picked it up the issue was half-stale. #2148 had
already fixed the NIS pages, which is why the issue stayed open: only the
data-file question was live.

## What we did

One commit against `main`: 24 parish tokens in the `address` strings of
`apps/landing/.../find-an-emergency-shelter/-data/emergency-shelters.json`,
plus two `St Michael` lines in
`apps/landing/src/content/temporary-restaurants-what-you-need-to-know.md`.
Content only — no code, no test.

## Why we did it that way

**The data-file question answered itself, so we never had to settle it in the
abstract.** Every shelter record already carried a house-style `parish` field
(`"St. Michael"`) alongside a Nominatim-geocoded `address` that spelled the
same parish out in full (`"…, Saint Michael"`). `ShelterCard` renders the
parish on one line and the address two lines below it, so a single card was
already contradicting itself on screen. That reframed the decision: not
"should house style govern data?" but "should one record be allowed to
disagree with itself?" — which needs no policy. We deliberately did not write
a decision record, because the general principle was never the thing that
justified the change.

**The style binds the parish token, not every "St".** 08c47774's message says
place names like Port St. Charles and St. Ann's are unaffected, so the
replacement was scoped to the eleven parish names rather than a blanket
`Saint` → `St.`. `"St Christopher's Road, St. Christopher, Hopewell"` survives
untouched as a result. It is internally inconsistent and looks like a bug, but
it is a street and a district, not a parish, and widening the rule to cover it
would have quietly overturned the precedent this change is meant to follow.

**`pharmacies.json` was left alone on scope, not on principle.** It holds an
unpunctuated parish token (`"… White Main Road St Michael Tel/Fax"`) in a
different dataset behind a different feature that #2144 never scoped in, so
it belongs in its own ticket rather than inflating a content PR. That ticket
is **#2716**.

**No enforcement exists, and we chose not to add any.** A data-consistency
test was offered and declined, so the convention rests on review alone. Worth
knowing that the typed `Parish` union is not a backstop either:
`emergency-shelters.ts:83` is `shelterData as Shelter[]`, an assertion, so
nothing checks the JSON's parish strings at build time. The `.ts` and the
`.json` agree by convention, not by the compiler.

## What we almost got wrong

**Trusting the issue body.** It cited
`temporary-restaurants-what-you-need-to-know.md:86` as an example of *correct*
usage. That occurrence no longer exists; the file's two surviving parish
mentions both lacked the period, and they were added to scope only because we
re-verified against a fresh `origin/main` instead of reading the issue. The
local checkout was nine commits behind at the time.

**Reading a pre-existing prettier failure as our own.** The markdown file fails
`prettier --check` on whole-file list-marker style (`-   ` vs `- `). A first
check against a copy in a temp directory passed, which suggested the two-
character edit had broken formatting — it had not; prettier simply resolved a
different config outside the repo. Re-checking pristine `origin/main` content
at the real path reproduced the failure. It is pre-existing, there is no
prettier gate in CI, and reformatting would have buried a two-character fix
under ~60 lines.

**Assuming the address string was load-bearing.** It is render-only. The
directions link, search, sort and distance ordering all key off `parish` or
`coords`, never `address` — so the edit has no behaviour surface at all.

## Open questions

- **Gordon Greenidge Primary School has a genuine parish/address mismatch** —
  `parish: "St. James"` against `address: "Ronald Mapp Highway, Westmoreland,
  St. Peter"`. Pre-existing, and the only record where the two disagree, but
  this change sharpens it: `Saint Peter` read as raw geocoder output, whereas
  `St. Peter` now reads as a deliberate house-style label. Needs the DEM
  booklet checked rather than a guess — Westmoreland is a St. James district,
  so it looks like a Nominatim border misattribution. Split out as **#2722**.
- **`pharmacies.json:4914`** is not scoped here — **#2716**. It was described
  as the *last* unpunctuated token in `apps/landing`, which was true only of
  the `St X` / `Saint X` shapes this sweep matched:
  `get-a-primary-school-textbook-grant/index.md:54` carried `St.Michael` with
  no space, which neither pattern caught. Fixed here; it was tracked as
  **#2733**.
- **Content fixes on CMS-owned pages are not durable.** The temporary
  restaurant page's parish spelling has been rewritten several times by
  "Update landing page…" commits, and a correct `St. Michael` that once existed
  in it is gone. Nothing stops this regressing again.
