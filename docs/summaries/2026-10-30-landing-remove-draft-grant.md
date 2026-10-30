# Landing: remove the draft grant (#3456)

## Context

#3247 decided landing drops its `draft` viewer level. `?draft=<DRAFT_SECRET>`
had never unlocked anything: `DRAFT_SECRET` was unset in every environment
(#3367) and `decideViewLevel` fails closed on an unset secret. api_v2 and
editor_v2 already only know `public` and `preview`.

## What we did

- Removed the `?draft=` token, `draft` cookie value, `DRAFT_SECRET` build input
  and the draft branch of `decideViewLevel` from `apps/landing`, with its tests,
  comments and README section.
- Amended ADR 0058 (Status line + end-of-file `## Amendment`).
- Checked alpha-infra: three comment-only `DRAFT_SECRET` mentions in
  `amplify-landing.tf`, no variable declared, nothing to remove.

## Why we did it that way

- **A stale `draft` cookie reads as `public`**, not aliased to `preview` like
  the legacy `'1'`. Nothing deployed ever minted one, the TTL is 4h, and
  fail-closed is the file's posture — a compatibility line for a cookie that
  cannot exist is dead code.
- **`ViewLevel`/`VIEW_LEVELS` keep `draft`.** Narrowing the type would flip the
  10 static `draft` education pages to visible-to-preview, which is a content
  decision. `draft` stays as a page value no token grants (hidden from every
  site viewer); `ReviewBanner`'s draft copy and the static ranking tests go with
  it in #3220.
- **ADR amended, not edited.** Repo precedent (0027, 0046) is an appended
  `## Amendment` plus a Status-line note; no ADR here rewrites its Decision
  text, so ADR 0058's "`DRAFT_SECRET` … untouched" line stays and is superseded
  by name.
- **No alpha-infra issue.** Its comments ("DRAFT_SECRET is deliberately NOT
  set") remain true; noted on #3456 for whoever next edits those files.
- Lands before #2961, so token forwarding to api_v2 has one non-public level.

## Open questions

None. Out of scope by design: the forms-side `?draft=` (ADR 0011) and the v1
API cookie bypass set, which still accepts `draft` harmlessly.
