# A field-less required message is an enumerated set, not a heuristic

## Context

#2227's three halves landed on 2026-09-17: #2712 rewrote 199 recipe fields,
#2711 added `scripts/required-error-guards.ts` so the trunk rejects a required
field whose message names none, #2715 fixed the Form Builder's authoring
surfaces. The summary from that day
(`docs/summaries/2026-09-17-required-message-names-the-field.md`) closed on an
explicit open question:

> Whether `"Select an option"` and `"Select an answer"` count as generic for the
> #2714 gate is unresolved, and decides how much that gate catches.

This session answers it: yes. Scope was set deliberately to guard hardening —
**not** option (iii) from the audit (a label-aware default in
`packages/form-validation/src/validate-field.ts` plus dropping the sentinel from
the 11 generic primitives), which remains unimplemented.

## What we did

One branch against `main`. `FIELDLESS_MESSAGES` in
`scripts/required-error-guards.ts` grew from the runtime default alone to five
strings, compared after a `normalise` that folds case and a trailing full stop.
The `date` exemption narrowed to the unauthored case. 93 recipe fields across
19 recipes rewritten.

## Why we did it that way

**Guard hardening over the platform fix, and they are not additive.** The audit
recommended composing the message from the label in the shared validator. That
was rejected for this session, and the reason is worth recording because it
looks like a free win: the guard treats `error === undefined` as a defect, while
a label-aware default makes `undefined` the *correct* state. Landing both means
relaxing the guard to catch only hand-typed generics — the narrowing #2714's
"Blocked by" note already anticipates. There is also a copy argument. The guard
forces an author to write `"Enter the name of your employer"`; a derived default
silently ships `"Enter employer"`. The tradeoff is real in the other direction
too: the guard cannot help an author who has not yet published, which is what
#2710 was for.

**An enumeration, not a heuristic.** The alternative was inferring genericness —
"the message must share a word with the label". Cheaper to maintain and it would
have caught strings nobody thought to list. Rejected because it produces
arguable failures on good copy (`"Select your parish"` shares nothing with a
label of "Parish" under a naive token match) and because #2714's deploy gate and
the builder both need to ban *exactly* the same strings. An explicit set is a
contract those layers can mirror; a heuristic is not.

**Normalising the comparison.** Exact matching let `"Select an option."` through,
and trailing full stops are a live habit in this recipe set
(`apply-for-hotel-licence.json` has `"Enter your address."`). Normalising is two
lines and removes a whole class of silent escape.

**Dates: authored and unauthored are different cases.** The exemption existed
because `validateDateField` composes `Enter ${asPhrase(label)}` when no message
is authored — so a bare date already names itself. But it was applied
unconditionally, so an *authored* generic on a date field was skipped even
though it is shown to the applicant verbatim. Narrowing the exemption to the
unauthored case turned up five live fields, two of them in `public` recipes
(`get-death-certificate`, `get-marriage-certificate`) that show citizens "This
field is required" today.

Four of those five were fixed by **deleting** the authored message rather than
writing a better one, so `validateDateField` derives it from the label — the
state the exemption assumes, and the one that survives a rename (ADR 0073). The
fifth, `restaurant-expected-start-date`, has a question-shaped label ("What date
do you expect the restaurant to start operations?") that derives as "Enter what
date do you expect…", so it got an authored string. That is the
question-shaped-label problem the 2026-09-17 summary already flagged, met for
the first time in practice.

**Recipe copy followed the file it was in, not a house rule imposed from
outside.** The 8 elder-care messages were first written as "Select the
applicant's sight"; they became "Select your sight" because the conditional
follow-up rendered directly beneath is labelled "Please describe **your** sight
condition" and the same file already ships "Select **your** marital status". The
form is genuinely ambiguous about whether it addresses the applicant or a
caseworker filling it in on their behalf — the tie-break was internal
consistency, not a general preference.

## What we almost got wrong

**Counting by grep undercounted by 6.** The two strings named in the issue gave
82 fields. Resolving refs through `applyFieldOverrides` the way the server does,
and including the two strings folded in on the user's call, gave 88 — the extras
being two bare `"Select yes or no"` fields (`exit-survey`,
`term-leave-application`) and four checkbox `"Select at least one option"`.
Anything that counts affected fields has to resolve, not grep.

**The first date fix silently did nothing.** It tried to delete
`overrides.validations.required.error`, but those five fields have no override
`required` rule at all — they inherit the sentinel from `components/generic-date`.
The fix is to *write* `required: { value: true }` into the override, which
replaces the base rule wholesale (rule-level merge) and takes the message with
it. Same rule-level-replacement trap the 2026-09-17 summary names, hit from the
opposite direction: there it destroyed a good message by accident, here it was
needed on purpose.

**A review claim was wrong and running it caught that.** Code review reported
the date-exemption gap as "latent — no live instance today". Narrowing the
exemption and running `validate-recipes` produced five, in two public recipes.
Worth remembering that a scan asserting absence is only as good as the path it
resolves.

## Open questions

- **The guard still does not check what its own doc comment describes.** The
  stated defect is two identical links on one step; the implementation is a
  denylist, which catches that only when the duplicate is a known string.
  **27 duplicate groups / 138 fields / 13 recipes** remain — `project-dawn-application`
  shows 12 identical "You must confirm the declaration to continue" links on one
  step, and `nhc-land-property-application` (edited by this very branch) still
  shows two identical "Select a house type". Deliberately deferred to **#2723**:
  it is a relational check rather than a denylist, it would roughly triple this
  diff, and #2714 needs the same logic. **#2227 is therefore not fully closed by
  this work.**
- The Form Builder's `required-message.ts` still knows only the one-string
  sentinel, so an author typing "Select an option" gets no in-product warning
  and first learns of it when CI fails their publication PR — **#2724**.
- Messages that name *something* but not the field — "Select a type", "Select an
  area", "Select a role" — are still allowed. The line is currently drawn at
  "names nothing at all".
- Option (iii) — the label-aware validator default — remains unimplemented, as
  does #2714.
- `apps/landing/src/routes/money-financial-support/calculate-severance-pay/-ui/SeveranceCalculator.tsx:198`
  hand-writes `'Select yes or no'` in landing UI, outside any guard's reach.
