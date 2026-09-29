# landing_v2: a 200 whose body cannot be read is a 503 (#2834)

## Context

#2702's `apiGet` classifies every api_v2 failure into a typed `ApiResult`, so a page only ever sees `ok`, `not_found`, `server_error` or `unreachable`. The one `await` outside that classification was `response.json()` on a 2xx: a body that was not JSON, empty or cut off rejected past the type, and the citizen got a raw 500 instead of the 503 naming api_v2 every other upstream failure gets. Found by #2702's final review; worked on `v2-rewrite`, which has no CI, so the gate was local.

## What we did

- `apps/landing_v2/src/server/api.ts`: the parse sits in a `try`; a rejection is `{ kind: "server_error", status, cause }`, `cause` being a new optional field that the non-2xx path never sets.
- `apps/landing_v2/src/server/pages.ts`: `bodyOf` turns a `server_error` with a cause into `ApiUnavailableError` — "api_v2 answered 200 for … with a body that could not be read", plus the undici code when there is one — and so a 503.
- Tests in `api.test.ts` (not JSON, cut off, stalled past the body timeout) and `pages.test.ts` (the message, with and without a code), against throwaway `node:http` servers. Comments in `api.ts`, `pages.ts`, `router.tsx` and the README follow.
- An end-to-end run of `vite dev` against a fake api_v2 answering `<html>`: both a page and the index came back 503 with the new message, and neither the parse error's text nor api_v2's host was on the page.

## Why we did it that way

- **`server_error`, not `unreachable`.** There was a response and it had a status; `unreachable` means there was none. Both end as a 503, so the choice is about what the type says, and the status (usually 200) stays in the message.
- **An optional `cause` on `server_error`, not a new `bad_body` variant.** The caller would treat a new variant exactly like `server_error`. The type stays closed with one variant fewer; `"cause" in result` is what tells the two apart in `bodyOf`.
- **The code, never the cause's message.** The message is rendered on the page. A JSON `SyntaxError` quotes part of the body, and an undici error's message can carry api_v2's host, so only `cause.cause.code` is shown — the same rule the `unreachable` branch already followed. A parse error has no code and reads without one.
- **The code was added because review found a body timeout lands here.** `bodyTimeout` only fires once a 2xx's headers are in, so `fetch` has resolved and it is `response.json()` that rejects. The module comment had said a body timeout was `unreachable` naming `UND_ERR_BODY_TIMEOUT`; before this change it was actually a raw 500, and after it, without the code, a stalled api_v2 would have read on the page like a malformed body. Naming the code (`UND_ERR_BODY_TIMEOUT`, `UND_ERR_SOCKET`) keeps the two apart.
- **The cut-off test destroys the socket in `write`'s callback.** Destroying straight after `write` could, in principle, let the reset beat the headers and turn the case into `unreachable`. In the callback the headers and partial body are already out; runs of 20 and 25 in a row never flaked.

## Open questions

- A complete 200 that is not JSON but carries a cacheable `Cache-Control` is stored by undici's cache, so every read is a 503 until it expires, and a revalidation could replace a good copy with it. A cut-off body is not stored. Unlikely, since only api_v2 sets those headers and it always sends JSON; filed as #2848.
- #2833's Start harness had not landed, so the 503 on the page is covered by the end-to-end run above, not by a test. Whichever of the two lands second can add the by-url-answers-`<html>` case.
