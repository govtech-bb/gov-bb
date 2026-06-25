# ask_field: server-enriched field rendering (future design)

**Status:** implemented 2026-06-09 (same branch). `ask_field` asks every schema
field; `present_choices` remains for non-field closed questions (e.g. the
offer-turn "Start the application" affordance); `present_multi_choices` was
absorbed before ever shipping.
**Context:** apps/chat form collection, 2026-06-09.

## Problem

Chat form questions render from model-authored tool args. For closed sets this
works (`present_choices` / `present_multi_choices`), but the model must copy
options/labels faithfully from the schema disclosure into args — a
hallucination surface. The "generative UI" pattern from AI SDK + AI Elements
(`ask_field({ name, type, label, options, validation })` → component per type)
makes that surface *bigger*: the whole field spec becomes model-generated.

The genuinely painful field type today is `date` (format friction), not text —
the composer already is the input for free-text fields, and an in-bubble text
box would duplicate it (focus + a11y cost for no gain).

## Design

One tool, model passes only the field id:

```ts
const askFieldDef = toolDefinition({
  name: "ask_field",
  description: "Ask the user for one form field. Pass ONLY the fieldId from the FORM SCHEMA.",
  inputSchema: z.object({ fieldId: z.string() }),
  outputSchema: z.object({
    fieldId: z.string(),
    label: z.string(),
    htmlType: z.string(),          // text | date | select | checkbox | ...
    options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
    multiple: z.boolean().optional(),
    hint: z.string().optional(),
  }),
});
```

The `.server<FormTurnContext>()` implementation looks the field up in the
**contract** (`ctx.context.form`) and returns the canonical spec as the tool
result. The UI renders from `part.output`, not `part.arguments` — the spec
comes from the source of truth, so the model cannot mangle options, labels, or
validation. Plain documented tool mechanics (result feeds both the model and
the UI); no AI-Elements-style component registry dependency.

Client renders per `htmlType`:
- `select`/`radio`/boolean `checkbox` → single-pick pills (today's `present_choices` UI)
- option-backed `checkbox` / `multiple` select → toggle pills + confirm (today's `present_multi_choices` UI)
- `date` → date picker, submits ISO `YYYY-MM-DD` (the payoff that justifies the work)
- everything else → no widget; the composer remains the input

Answer path is unchanged: the pick/value goes back as a new user message
(turn-based, refresh-safe — form state stays server-side keyed by threadId; do
NOT switch to client tools / approval-resume for this, see
`form/tools.ts` present_choices comment and the 0.28.0 approval-input bug).

## Why not now

- `present_choices` + `present_multi_choices` + immediate `set_field`
  validation (shared `@govtech-bb/form-validation` engine) already cover the
  closed-set cases; prompts are eval-tested against them.
- Migration cost includes re-tuning the collection prompts (`prompts.ts` lines
  that name the choice tools) and re-running the behavioral eval.
- Worth doing only bundled with the date-picker widget, where the UX gain is
  real.
