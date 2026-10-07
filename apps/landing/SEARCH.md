# Alpha search

Alpha uses MiniSearch in the browser to search service entry pages. Routes and
components receive application-owned `SearchHit` objects through `search()` and
`suggest()`; MiniSearch result types stay inside `src/lib/search.ts`.

## Indexed fields and ranking

The index contains every page in `PAGES` except service sub-pages such as
`/start`. Visibility is checked with the existing frontmatter and runtime
overlay rules before results leave the search module.

| Field         | Purpose                            | Boost | Full search  | Autocomplete |
| ------------- | ---------------------------------- | ----: | ------------ | ------------ |
| `title`       | Official service name              |     8 | Yes          | Yes          |
| `keywords`    | Reviewed aliases and citizen terms |     5 | Yes          | Yes          |
| `description` | Short service purpose              |     2 | Yes          | No           |
| `body`        | Supporting detail                  |   0.2 | Ranking only | No           |

Results are ordered by:

1. exact normalized title
2. exact phrase within the normalized title
3. all terms in the title
4. all terms in `keywords`
5. all terms in the description
6. matches split across identity fields
7. MiniSearch score, including the small body contribution, then title for a
   deterministic tie-break

Body text can improve the order of an already eligible strict result. It can
never make a service eligible, and it is not searched by the fallback or
autocomplete paths.

## Query normalization

Index text and incoming queries use the same normalization:

- Unicode compatibility normalization
- splitting on punctuation and whitespace, including straight and curly
  apostrophes
- lower-casing and collapsing repeated whitespace
- removing question scaffolding such as `where can I`, `please`, `government`
  and `service`
- a small reviewed spelling map, including `license` → `licence`, `color` →
  `colour`, `program` → `programme`, `center` → `centre`, and common inflected
  forms

Duplicate normalized query terms are removed. There is no broad stemming,
semantic expansion, or global concept synonym list. Add normalization only for
an orthographic variant that is safe for every service; add alternative
language for one service as a keyword instead.

Prefix matching starts at three characters and applies only to the final query
word. Fuzzy matching allows at most one edit and starts at five characters.
Exact matches retain more weight than prefix or fuzzy matches. These values are
covered by typo, partial-word, and negative relevance cases rather than tuned
against one example.

## Strict search and controlled fallback

Full search first requires every meaningful query term to match a service
identity field: title, keywords, or description. A one-term description-only
match is rejected as too weak; the term must occur in the title or an explicit
keyword. This prevents incidental copy such as an agency acronym from
discovering an unrelated page.

Only when there are no strong strict matches does full search run an `OR`
fallback. The fallback disables fuzzy and prefix matching and accepts a result
only when all of these centralized conditions hold:

- at least 2 exact query terms matched
- at least 50% of meaningful query terms matched
- at least 2 matched terms occur in the title or keywords

Description terms can improve fallback coverage but cannot clear the fallback
by themselves. Body terms are excluded. If the threshold is not met, search
returns no results. A hidden strong match also does not cause search to relax
towards an unrelated public result.

This supports wording such as `I lost my death certificate and need another
copy` while keeping `renew passport` and `fishing licence` at no results.

## Search aliases (`keywords`)

Markdown services declare aliases beside the content:

```yaml
keywords:
  - open pharmacy
  - chemist
  - BDS
```

Interactive features use the same `keywords` array in their `-meta.ts` file.
The shared schemas trim entries and reject blank values.

A keyword must identify that specific service. Suitable entries are:

- an abbreviation citizens use
- a common local or colloquial name
- an alternative or older name for the same service
- a service-specific spelling or wording variant

Do not add broad topics, related services, or agency acronyms that do not
identify the service. For example, `doctor` is not an alias for every health
page and `permit` is not an alias for every licence. Add one clear phrase per
item, confirm the term through research or search feedback, and add a relevance
case with the expected URL. Review aliases like content because an overly broad
term changes both search and autocomplete.

## Autocomplete

Autocomplete is deliberately separate from full search. It combines literal
official-title prefixes with strict MiniSearch matches from title and keywords
only. It does not use descriptions, body text, or the relaxed fallback.

Suggestions start after three trimmed characters, retain the conservative
prefix and typo rules, prefer literal title prefixes, apply visibility, and
return at most five real service titles. Selecting one submits its official
title. Unmatched free text can still be submitted normally.

## Relevance suite and metrics

Run the dedicated production-content quality report with:

```sh
pnpm search:quality
```

It also runs in CI through the normal `pnpm test` command. The dataset and
evaluator live in `src/lib/search-relevance.ts`; focused search mechanics and
regressions live in `src/lib/search.test.ts`.

The report includes:

- `expectedAtRank1`, `expectedInTop3`, and `expectedInTop5`: percentage of
  positive and ranking cases containing the expected service at that rank
- `negativeQuerySuccessRate`: percentage of negative cases returning nothing
- `zeroResultRate`: percentage of all cases returning nothing, including
  intentional negative cases; interpret it with the dataset mix, not as a
  standalone failure rate
- `incorrectResultRate`: percentage of cases that miss their declared rank
  target or return anything for a negative query

The CI gates are at least 85% at rank 1, 100% in the top 3 and top 5, 100%
negative-query success, and 0% incorrect cases. Each individual case also has
to meet its own expected rank. The current 50-case baseline is 96.7% for rank
1 and 100% for top 3, top 5, and negative success; 40% zero results (the 20
intended negatives); and 0% incorrect.

Add confirmed poor queries from aggregate Umami analytics, support, or research
directly to `SEARCH_RELEVANCE_CASES`. Use the real expected URL and viewer
level. A query for a service Alpha does not offer should be a negative case.
Every fixed search bug belongs in this dataset permanently; only retain
analytics wording that contains no personal data.

## Analytics review (3 September 2026)

The aggregate Umami report for the previous 30 days contained 180 searches, a
34.4% live zero-result rate, and a 31.1% result click-through rate. The 90-day
view was also checked to avoid tuning to one short window.

That review added real wording for textbook grants, NHC, Crop Over, state land,
and a birth-certificate misspelling. `NHC` and the observed `text book grant`
variant are now explicit service aliases. Repeated certificate-of-character,
sewerage-tax, EZpay, licensing-authority, security-guard, and procurement
queries are negative cases because Alpha has no matching page. Several of those
queries previously received results but almost no clicks, supporting stricter
suppression rather than broader synonyms. Pharmacy demand is a content
visibility issue while that page remains preview-only, not a lexical search
limitation.

## MiniSearch assessment

MiniSearch still meets Alpha's current needs. The catalogue is small, lookup is
fast and local, and its field selection, boosts, prefix, fuzzy, and combination
controls support the measured policy above without exposing engine-specific
types to the UI.

Its limits remain lexical English matching, editorially maintained aliases, no
learned ranking, and an index that ships to the browser. Reassess a server-side
engine when content must not ship to clients, search spans products or a much
larger corpus, or representative query data shows a measured relevance gap that
cannot be fixed safely with service metadata and these controls.
