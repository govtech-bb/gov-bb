# Chat empty-state starter cards (#969)

Implement the content-backed starter-card empty state for `apps/chat`. Today
the empty state shows only a single `WelcomeBubble` ("Welcome to alpha.gov.bb.
What would you like help with today?"). Issue #969 was originally framed as
"swap out two broken hardcoded prompts," but live-code review (see Laron's
comment on the issue, 2026-06-08) confirmed the four prompts referenced there
come from a stale SPEC.md section and were never implemented. The fix is to
implement them, sourced against the live corpus.

## Problem

When a citizen first opens alpha.gov.bb's chatbot, the only visible affordance
is a free-form text input and a one-line welcome message. There is no signal
about *what the assistant can help with* — users have to guess. The original
SPEC anticipated four starter prompts ("How do I get a passport?", driver's
licence, etc.) but those services don't exist in `@govtech-bb/content`; even
if they were shown, clicking them would surface unrelated top RAG matches
(notarisation, conductor's licence) and degrade trust in the assistant.

The user-facing symptoms today:

- High bounce on the empty state — no visible "what to try" cues.
- The text input alone signals "type something" but not "type what."
- Any future copy that names a service must be verifiable against the
  corpus or it will break the moment a content rename happens.

## Decisions (locked during brainstorming)

| Dimension | Decision | Rejected alternatives |
|---|---|---|
| Source of truth | Hardcoded `readonly` TS array in `apps/chat/src/lib/chat/starter-prompts.ts` | Frontmatter `featured_in_chat` flag with build-time JSON emit; runtime API endpoint |
| Card set | 4 cards: `register-a-birth`, `get-birth-certificate`, `apply-financial-assistance`, `apply-for-a-school-uniform-grant` | 3 cards (under-coverage); 6 cards (visual weight); passport/driver's-licence (no corpus content) |
| Click behavior | Auto-send — clicking calls the same `submit()` path that typed input uses | Fill-input-only; fill + undo affordance |
| Layout | 2×2 card grid; collapses to single column below the Tailwind `sm` breakpoint (640px) | Compact pill row (tap targets too small); vertical stack (too menu-like) |
| Drift detection | Unit test loads `@govtech-bb/content` and asserts every starter slug resolves to an on-disk service | No test (manual review); separate CI guard script |

## Design

### 1. Data — `apps/chat/src/lib/chat/starter-prompts.ts`

```ts
export interface StarterPrompt {
  readonly slug: string;
  readonly prompt: string;
}

export const STARTER_PROMPTS: readonly StarterPrompt[] = [
  { slug: "register-a-birth",                 prompt: "How do I register a birth?" },
  { slug: "get-birth-certificate",            prompt: "How do I get a birth certificate?" },
  { slug: "apply-financial-assistance",       prompt: "Apply for financial assistance" },
  { slug: "apply-for-a-school-uniform-grant", prompt: "School uniform grant for my child" },
];
```

The `slug` field has no current UI consumer — it exists so the drift test
(§4) can verify each starter resolves to a corpus entry, and to give a v1.1
"deeplink to the service page" feature a hook to wire into without changing
the data shape. No `category`/`title`/`description` is duplicated from the
corpus; anything beyond `slug`+`prompt` must be looked up live to avoid rot.

### 2. Component — `apps/chat/src/components/chat/starter-cards.tsx`

```tsx
import { cn } from "@govtech-bb/react";
import { STARTER_PROMPTS } from "#/lib/chat/starter-prompts";

interface StarterCardsProps {
  onPick: (prompt: string) => void;
}

export function StarterCards({ onPick }: StarterCardsProps) {
  return (
    <div
      aria-label="Suggested questions"
      className="grid grid-cols-1 gap-xs sm:grid-cols-2"
      role="group"
    >
      {STARTER_PROMPTS.map(({ slug, prompt }) => (
        <button
          key={slug}
          aria-label={prompt}
          className={cn(
            "text-bubble min-h-[44px] rounded-[12px]",
            "border border-mid-grey-00 bg-white-00 px-4 py-3 text-left text-black-00",
            "transition-colors hover:border-black-00",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-00",
          )}
          onClick={() => onPick(prompt)}
          type="button"
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}
```

Pure-presentational, zero internal state, one prop. Notes:

- `<button type="button">` per card — free keyboard nav (Tab + Enter/Space)
  and free screen-reader role. `type="button"` prevents accidental form
  submission if a future refactor nests the cards under a `<form>`.
- `role="group"` + `aria-label="Suggested questions"` groups the four buttons
  for assistive tech, mirroring the chat's existing `aria-label="Chat messages"`
  pattern on the log region.
- All design tokens (`bg-white-00`, `border-mid-grey-00`, `text-black-00`,
  `hover:border-black-00`, `focus-visible:outline-teal-00`) are pulled from
  existing `apps/chat/src/components/chat/bubble.tsx` usage — no new tokens.
  In particular, the hover state changes border only (no fill blend), matching
  the citation-pill convention in `bubble.tsx` (the source-link `<a>` element).
- `text-bubble` is the chat's typography token, so card text reads at the same
  scale as the welcome bubble.
- `min-h-[44px]` enforces WCAG 2.5.5 tap-target sizing on mobile.

### 3. Integration — `apps/chat/src/routes/index.tsx`

The chat already builds a flat `ChatRow` discriminated union and renders each
row through a virtualizer (the `ChatRow` type definition and the `renderRow`
switch inside `apps/chat/src/routes/index.tsx`). Cards plug in as a new row
kind, mirroring how `thinking`, `submitting`, `optimistic`, and `error` are
already handled.

Three edits:

**a. Extend the `ChatRow` union** (top-level type in `index.tsx`):
```ts
type ChatRow =
  | { kind: "welcome"; key: string }
  | { kind: "starter-cards"; key: string }   // NEW
  | { kind: "optimistic"; key: string; text: string }
  | { kind: "message"; key: string; message: UIMessage; index: number }
  | { kind: "thinking"; key: string }
  | { kind: "submitting"; key: string }
  | { kind: "error"; key: string; text: string };
```

**b. Push the row in the empty state** (inside the `rows` useMemo in `ChatPage`):
```ts
const out: ChatRow[] = [{ kind: "welcome", key: "welcome" }];
const isEmpty =
  messages.length === 0 && !pendingQuery && !submitting && !error;
if (isEmpty) {
  out.push({ kind: "starter-cards", key: "starter-cards" });
}
// ...existing optimistic / messages / thinking / submitting / error logic
```

The four-condition `isEmpty` gate matters: without `!pendingQuery && !submitting
&& !error`, the cards would flash back into view if "Start again" is clicked
mid-stream (`messages.length` is briefly 0 again before the new turn lands).

**c. Render in the row switch** (the `renderRow` switch in `ChatPage`):
```ts
case "starter-cards":
  return <StarterCards onPick={submit} />;
```

`submit` is the existing local function inside `ChatPage` that already powers
typed input and `?q=` URL auto-send — so cards add no new entry point to the
conversation lifecycle.

### 4. Testing — `apps/chat/src/lib/chat/starter-prompts.spec.ts`

```ts
/**
 * @jest-environment node
 *
 * Requires monorepo workspace context — @govtech-bb/content resolves the
 * content dir by walking up to pnpm-workspace.yaml.
 */
import { loadContent } from "@govtech-bb/content";
import { STARTER_PROMPTS } from "./starter-prompts";

describe("STARTER_PROMPTS", () => {
  it("every slug resolves to a service in @govtech-bb/content", async () => {
    const { services } = await loadContent();
    const onDisk = new Set(services.map((s) => s.slug));
    const missing = STARTER_PROMPTS.filter(({ slug }) => !onDisk.has(slug));
    expect(missing).toEqual([]);
  });
});
```

The per-file `@jest-environment node` pragma is required because
`@govtech-bb/content/load` uses `node:fs`; the chat app's default test env
may be jsdom (this is what kept the package itself usable in a browser SPA —
the loader is never bundled into the SPA, only into tests/build scripts).

The assertion compares `missing` against `[]` rather than looping with
`expect(... .toBe(true))` per slug, so a failure lists every broken slug in
one shot instead of bailing on the first.

What this test catches:
- Service renamed in the content repo without updating the starter array.
- Service file removed during cleanup without the starter array being updated.
- Typo in a starter slug.

What it deliberately does **not** check:
- Prompt copy quality (editorial, not enforceable).
- Whether the LLM gives a useful answer (covered by the RAG eval suite).
- Whether a service is `featured`/published vs draft (out of scope).

No new visual / interaction test is added for `<StarterCards>` itself in v1 —
the component is pure render, zero state, and its only behavior (click →
parent's `onPick`) is exercised end-to-end the moment a CI smoke run loads
the empty state. If `<StarterCards>` later grows internal state, a focused
component test should follow.

## Alternatives considered

**Approach Y — content-frontmatter driven (`featured_in_chat: true`).**
Add a flag to `serviceFrontmatterSchema`, write a small build-time script that
emits `apps/chat/src/lib/chat/generated/starter-prompts.json` by calling
`loadContent()`, and a CI step that fails the build on drift. *Rejected:*
introduces a new flag, a new script, a new generated file, and a new CI step
for content that changes at a monthly cadence. The drift-detection test
(§4) achieves the same correctness guarantee at fraction of the cost.
Revisit when non-engineers start asking to curate cards without a chat PR,
or when card count grows past ~8.

**Approach Z — runtime API endpoint (`apps/chat/src/routes/api.starter-prompts.ts`).**
Fetch cards from a server route on every chat-page load. *Rejected:* adds a
network round-trip to first paint, a loading-state UI, and a failure mode
("API down → no starter cards"). All three are real costs for content that
could be a build-time constant.

**4 cards vs 6 cards.** Six gives broader category coverage (could add
`get-disaster-relief-assistance` and `apply-to-jobstart-plus-programme`) but
doubles visual weight and breaks the clean 2×2 grid into either 2×3 (deeper
empty state, pushes the input below the fold on small screens) or a 6-wide
single row (too small targets). Four is the right balance.

**Fill-input click behavior vs auto-send.** Fill mode supports editing the
prompt before sending, but the four chosen prompts are all complete intents
that need no editing. Fill mode would add one click for zero new capability.
Auto-send matches ChatGPT / Claude.ai / Gemini convention.

## Out of scope / non-goals

| Not in this PR | When to revisit |
|---|---|
| Click telemetry / CTR tracking | After 2 weeks of live usage if we want data to refine the card set. |
| Card description / supporting text | If click-through is uneven and we hypothesize unclear titles are the cause. |
| Content-frontmatter mechanism (Approach Y) | When non-engineers want to curate cards, or when card count grows past ~8. |
| Localization | When the broader site i18n story is decided. |
| Per-service deeplink after the chat answer | Likely v1.1 — the `slug` field is the carry-over hook. |
| A/B testing of prompt copy | Only if a stakeholder pushes back on editorial choice. |

## Workspace

Spec written on branch `feat/chat-starter-cards-969`, based on
`origin/sandbox`. Implementation plan to follow under `docs/plans/`
(generated by the writing-plans skill) and is not committed per
[CLAUDE.md](../../../CLAUDE.md) repo convention. Final PR opens against
`sandbox`.
