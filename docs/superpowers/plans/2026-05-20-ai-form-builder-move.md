# AI Form Builder Move — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the AI form builder (chat UI + backend) out of `apps/api` and `apps/forms` and into the standalone `apps/form_builder/` TanStack Start app. Restructure routes so `/builder` is a chooser, `/builder/ui` is the manual builder, and `/builder/ai` is the chat-based builder.

**Architecture:** Lift-and-shift the NestJS `FormBuilderModule` into TanStack Start server functions inside `apps/form_builder/app/server/ai-builder/`. Keep the in-memory session map, the Anthropic/Bedrock provider switch, the recipe extractor, and the publish-via-TypeORM flow byte-for-byte. The chat UI moves into the same app as a sibling route and calls the new server functions directly (no more `fetch(VITE_API_URL)`).

**Tech Stack:** TanStack Start (Vite + React 19), TanStack Router (file-based), TypeORM via `@govtech-bb/database`, `@anthropic-ai/sdk`, `@aws-sdk/client-bedrock-runtime`, Jest + ts-jest, Zod.

**Spec:** `docs/superpowers/specs/2026-05-20-ai-form-builder-move-design.md`

---

## File Structure Overview

**New files in `apps/form_builder/`:**

```
app/
├─ routes/
│  └─ builder/
│     ├─ index.tsx                                 (NEW — landing chooser)
│     ├─ ui/
│     │  ├─ index.tsx                              (moved from app/routes/builder/index.tsx)
│     │  └─ -*.tsx                                 (14 helpers moved from app/routes/builder/)
│     └─ ai/
│        └─ index.tsx                              (ported from apps/forms admin page)
└─ server/
   └─ ai-builder/
      ├─ types.ts                                  (chat message + session + publish types)
      ├─ session-store.ts                          (in-memory Map)
      ├─ ai-client.ts                              (Anthropic/Bedrock module)
      ├─ recipe-extractor.ts                       (extract recipe JSON from AI output)
      ├─ recipe-extractor.spec.ts
      ├─ sql-builder.ts                            (build INSERT SQL for export)
      ├─ sql-builder.spec.ts
      ├─ session-store.spec.ts
      ├─ sessions.ts                               (TanStack server functions — public surface)
      └─ prompts/
         ├─ system-prompt.md                       (copied verbatim from apps/api)
         └─ system-prompt.ts                       (copied verbatim from apps/api)
```

**Deletions:**

- `apps/api/src/form-builder/` (whole directory)
- `apps/forms/src/routes/admin/form-builder.tsx`
- `apps/forms/src/routes/admin/` (if empty after the above)

**Modifications:**

- `apps/form_builder/package.json` — add `@anthropic-ai/sdk`, `@aws-sdk/client-bedrock-runtime`
- `apps/form_builder/.env.example` — add AI env vars
- `apps/api/src/app.module.ts` — remove `FormBuilderModule` import + entry
- `apps/api/src/main.ts` — keep the 50 MB body limit (unrelated routes also benefit; removing is optional and out of scope)
- `apps/api/src/config/env.validation.ts` — remove `AI_PROVIDER`, `AI_MODEL`, `ANTHROPIC_API_KEY`
- `apps/api/package.json` — drop `@anthropic-ai/sdk`, `@aws-sdk/client-bedrock-runtime`
- `apps/form_builder/app/routeTree.gen.ts` — regenerated automatically
- `apps/forms/src/routeTree.gen.ts` — regenerated automatically

---

## Task 1: Add AI dependencies and env vars to form_builder

**Files:**
- Modify: `apps/form_builder/package.json`
- Modify: `apps/form_builder/.env.example`

- [ ] **Step 1: Add the two AI SDK dependencies**

Open `apps/form_builder/package.json`. Inside `"dependencies"`, add (alphabetically ordered):

```json
    "@anthropic-ai/sdk": "^0.39.0",
    "@aws-sdk/client-bedrock-runtime": "^3.0.0",
```

These exact versions are what `apps/api/package.json` already uses, so installing them won't move the workspace lockfile in unexpected ways.

- [ ] **Step 2: Append AI env vars to `.env.example`**

Open `apps/form_builder/.env.example` and append:

```
# AI form builder (used by /builder/ai)
AI_PROVIDER=anthropic
AI_MODEL=claude-sonnet-4-20250514
ANTHROPIC_API_KEY=
# AWS_REGION=us-east-1   # only needed when AI_PROVIDER=bedrock
```

- [ ] **Step 3: Install**

Run from the monorepo root:

```bash
npm install --workspace=apps/form_builder
```

Expected: completes without errors. The two new packages appear in `node_modules`. `package-lock.json` updates.

- [ ] **Step 4: Commit**

```bash
git add apps/form_builder/package.json apps/form_builder/.env.example package-lock.json
git commit -m "feat(form_builder): add AI SDK deps for AI form builder"
```

---

## Task 2: Copy system prompt into form_builder

**Files:**
- Create: `apps/form_builder/app/server/ai-builder/prompts/system-prompt.md`
- Create: `apps/form_builder/app/server/ai-builder/prompts/system-prompt.ts`

- [ ] **Step 1: Create the directory and copy both files**

```bash
mkdir -p apps/form_builder/app/server/ai-builder/prompts
cp apps/api/src/form-builder/prompts/system-prompt.md apps/form_builder/app/server/ai-builder/prompts/system-prompt.md
cp apps/api/src/form-builder/prompts/system-prompt.ts apps/form_builder/app/server/ai-builder/prompts/system-prompt.ts
```

The `.md` is informational; the `.ts` is what gets imported. Both stay byte-identical to the source — no edits.

- [ ] **Step 2: Commit**

```bash
git add apps/form_builder/app/server/ai-builder/prompts/
git commit -m "feat(form_builder): copy AI system prompt from apps/api"
```

---

## Task 3: Add shared types for AI builder

**Files:**
- Create: `apps/form_builder/app/server/ai-builder/types.ts`

- [ ] **Step 1: Write the file**

```ts
// apps/form_builder/app/server/ai-builder/types.ts

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SessionResponse {
  sessionId: string;
  messages: ChatMessage[];
  recipe: Record<string, unknown> | null;
}

export interface PublishResponse {
  formId: string;
  message: string;
  sql: string;
  previewUrl?: string;
}
```

These mirror the existing `apps/api/src/form-builder/dto/chat-message.dto.ts` interfaces. We drop `CreateSessionDto`, `SendMessageDto`, `PublishDto` — those were Nest body-shape contracts; TanStack Start server functions consume Zod schemas instead, defined directly in `sessions.ts` in Task 9.

- [ ] **Step 2: Commit**

```bash
git add apps/form_builder/app/server/ai-builder/types.ts
git commit -m "feat(form_builder): add AI builder shared types"
```

---

## Task 4: Recipe extractor (TDD)

The recipe extractor's job: given a string of AI output (which may contain prose, fenced code, SQL wrappers, or raw JSON), return the embedded form-recipe JSON object or `null`.

**Files:**
- Test: `apps/form_builder/app/server/ai-builder/recipe-extractor.spec.ts`
- Create: `apps/form_builder/app/server/ai-builder/recipe-extractor.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/form_builder/app/server/ai-builder/recipe-extractor.spec.ts
import { extractRecipe } from "./recipe-extractor";

describe("extractRecipe", () => {
  it("extracts recipe from ```json fenced block", () => {
    const text = "Here is the form:\n```json\n" +
      JSON.stringify({ formId: "x", steps: [{ stepId: "s1" }] }) +
      "\n```\nLet me know if you want changes.";
    const recipe = extractRecipe(text);
    expect(recipe).toEqual({ formId: "x", steps: [{ stepId: "s1" }] });
  });

  it("extracts recipe from unfenced JSON in body", () => {
    const text = "prose " +
      JSON.stringify({ formId: "y", steps: [{ stepId: "s2" }] }) +
      " more prose";
    const recipe = extractRecipe(text);
    expect(recipe).toEqual({ formId: "y", steps: [{ stepId: "s2" }] });
  });

  it("strips $recipe$ wrappers when AI emits SQL form", () => {
    const json = JSON.stringify({ formId: "z", steps: [{ stepId: "s3" }] });
    const text = "```\n$recipe$" + json + "$recipe$\n```";
    const recipe = extractRecipe(text);
    expect(recipe).toEqual({ formId: "z", steps: [{ stepId: "s3" }] });
  });

  it("strips INSERT SQL wrapper around JSON", () => {
    const json = JSON.stringify({ formId: "q", steps: [] });
    const text =
      "```sql\nINSERT INTO form_definitions (schema) VALUES (" + json + ");\n```";
    const recipe = extractRecipe(text);
    expect(recipe).toEqual({ formId: "q", steps: [] });
  });

  it("returns null when no recipe JSON is present", () => {
    expect(extractRecipe("Just a plain message, no JSON here.")).toBeNull();
  });

  it("rejects JSON missing formId or steps", () => {
    expect(extractRecipe("```json\n" + JSON.stringify({ formId: "only" }) + "\n```")).toBeNull();
    expect(extractRecipe("```json\n" + JSON.stringify({ steps: [] }) + "\n```")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest --config apps/form_builder/jest.config.ts apps/form_builder/app/server/ai-builder/recipe-extractor.spec.ts
```

Expected: FAIL with `Cannot find module './recipe-extractor'`.

- [ ] **Step 3: Write the implementation**

Port the two private methods from `apps/api/src/form-builder/form-builder.service.ts:301-385` verbatim, exporting them as module functions:

```ts
// apps/form_builder/app/server/ai-builder/recipe-extractor.ts

/**
 * Try to extract a JSON recipe from an assistant response.
 * Tries fenced JSON blocks, fenced code blocks, then the largest brace-balanced
 * substring that contains "formId" and "steps".
 */
export function extractRecipe(text: string): Record<string, unknown> | null {
  // Strategy 1: ```json ... ``` fenced blocks
  const jsonBlockRegex = /```json\s*([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = jsonBlockRegex.exec(text)) !== null) {
    const parsed = tryParseRecipe(match[1]);
    if (parsed) return parsed;
  }

  // Strategy 2: ``` ... ``` fenced blocks (no language tag)
  const codeBlockRegex = /```\s*([\s\S]*?)```/g;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    const parsed = tryParseRecipe(match[1]);
    if (parsed) return parsed;
  }

  // Strategy 3: brace-balanced search for an object containing "formId" and "steps"
  const bracePositions: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") bracePositions.push(i);
  }
  for (const start of bracePositions) {
    let depth = 0;
    let end = -1;
    for (let i = start; i < text.length; i++) {
      if (text[i] === "{") depth++;
      if (text[i] === "}") depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
    if (end > start) {
      const candidate = text.substring(start, end);
      if (candidate.includes('"formId"') && candidate.includes('"steps"')) {
        const parsed = tryParseRecipe(candidate);
        if (parsed) return parsed;
      }
    }
  }
  return null;
}

function tryParseRecipe(text: string): Record<string, unknown> | null {
  try {
    let cleaned = text.trim();
    if (cleaned.includes("$recipe$")) {
      const start = cleaned.indexOf("$recipe$") + "$recipe$".length;
      const end = cleaned.lastIndexOf("$recipe$");
      if (end > start) cleaned = cleaned.substring(start, end).trim();
    }
    if (cleaned.toUpperCase().startsWith("INSERT")) {
      const jsonStart = cleaned.indexOf("{");
      const jsonEnd = cleaned.lastIndexOf("}");
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
      }
    }
    const parsed = JSON.parse(cleaned);
    if (
      parsed &&
      typeof parsed === "object" &&
      parsed.formId &&
      parsed.steps &&
      Array.isArray(parsed.steps)
    ) {
      return parsed;
    }
  } catch {
    /* not valid JSON */
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest --config apps/form_builder/jest.config.ts apps/form_builder/app/server/ai-builder/recipe-extractor.spec.ts
```

Expected: 6 passing tests.

- [ ] **Step 5: Commit**

```bash
git add apps/form_builder/app/server/ai-builder/recipe-extractor.ts apps/form_builder/app/server/ai-builder/recipe-extractor.spec.ts
git commit -m "feat(form_builder): port recipe extractor with tests"
```

---

## Task 5: SQL builder (TDD)

**Files:**
- Test: `apps/form_builder/app/server/ai-builder/sql-builder.spec.ts`
- Create: `apps/form_builder/app/server/ai-builder/sql-builder.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/form_builder/app/server/ai-builder/sql-builder.spec.ts
import { buildSql } from "./sql-builder";

describe("buildSql", () => {
  it("renders INSERT INTO form_definitions with the recipe as a JSON literal", () => {
    const recipe = { formId: "my-form", steps: [], version: "1.0.0" };
    const sql = buildSql("my-form", recipe);
    expect(sql).toContain("INSERT INTO form_definitions");
    expect(sql).toContain("'my-form'");
    expect(sql).toContain("$recipe$");
    expect(sql).toContain('"formId": "my-form"');
  });

  it("formats the recipe JSON with 2-space indentation", () => {
    const recipe = { formId: "f", steps: [{ stepId: "s1" }] };
    const sql = buildSql("f", recipe);
    expect(sql).toContain('  "formId": "f"');
    expect(sql).toContain('    "stepId": "s1"');
  });

  it("escapes formId by interpolation (current behavior — caller passes trusted slug)", () => {
    const sql = buildSql("trusted-slug", { formId: "trusted-slug", steps: [] });
    expect(sql).toContain("'trusted-slug'");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest --config apps/form_builder/jest.config.ts apps/form_builder/app/server/ai-builder/sql-builder.spec.ts
```

Expected: FAIL with `Cannot find module './sql-builder'`.

- [ ] **Step 3: Write the implementation**

Port from `apps/api/src/form-builder/form-builder.service.ts:283-295`:

```ts
// apps/form_builder/app/server/ai-builder/sql-builder.ts

/**
 * Build the INSERT INTO form_definitions statement for export/download.
 * Uses Postgres dollar-quoted strings ($recipe$ ... $recipe$) so the JSON
 * literal can contain single quotes without escaping.
 */
export function buildSql(formId: string, recipe: Record<string, unknown>): string {
  const json = JSON.stringify(recipe, null, 2);
  return `INSERT INTO form_definitions (id, form_id, version, schema, published_at, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  '${formId}',
  '1.0.0',
  $recipe$${json}$recipe$,
  NOW(),
  NOW(),
  NOW()
);`;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest --config apps/form_builder/jest.config.ts apps/form_builder/app/server/ai-builder/sql-builder.spec.ts
```

Expected: 3 passing tests.

- [ ] **Step 5: Commit**

```bash
git add apps/form_builder/app/server/ai-builder/sql-builder.ts apps/form_builder/app/server/ai-builder/sql-builder.spec.ts
git commit -m "feat(form_builder): port AI recipe SQL builder with tests"
```

---

## Task 6: Session store (TDD)

**Files:**
- Test: `apps/form_builder/app/server/ai-builder/session-store.spec.ts`
- Create: `apps/form_builder/app/server/ai-builder/session-store.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/form_builder/app/server/ai-builder/session-store.spec.ts
import { create, get, getOrThrow, _resetForTests } from "./session-store";

describe("session-store", () => {
  beforeEach(() => _resetForTests());

  it("create() returns a session with a UUID id and the given name", () => {
    const session = create("My session");
    expect(session.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(session.name).toBe("My session");
    expect(session.messages).toEqual([]);
    expect(session.recipe).toBeNull();
    expect(session.systemPrompt).toBe("");
  });

  it("create() with no name generates a timestamp-based name", () => {
    const session = create();
    expect(session.name).toMatch(/^Session /);
  });

  it("get() returns null for unknown ids", () => {
    expect(get("does-not-exist")).toBeNull();
  });

  it("get() returns the session after create()", () => {
    const session = create();
    expect(get(session.id)).toBe(session);
  });

  it("getOrThrow() throws on unknown id", () => {
    expect(() => getOrThrow("nope")).toThrow("Session nope not found");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest --config apps/form_builder/jest.config.ts apps/form_builder/app/server/ai-builder/session-store.spec.ts
```

Expected: FAIL with `Cannot find module './session-store'`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/form_builder/app/server/ai-builder/session-store.ts
import { randomUUID } from "crypto";
import type { ChatMessage } from "./types";

export interface Session {
  id: string;
  name: string;
  messages: ChatMessage[];
  recipe: Record<string, unknown> | null;
  systemPrompt: string;
  pdfPages?: string[];
  publishedFormId?: string;
  createdAt: Date;
}

const sessions = new Map<string, Session>();

export function create(name?: string): Session {
  const id = randomUUID();
  const session: Session = {
    id,
    name: name ?? `Session ${new Date().toISOString()}`,
    messages: [],
    recipe: null,
    systemPrompt: "",
    createdAt: new Date(),
  };
  sessions.set(id, session);
  return session;
}

export function get(id: string): Session | null {
  return sessions.get(id) ?? null;
}

export function getOrThrow(id: string): Session {
  const session = sessions.get(id);
  if (!session) throw new Error(`Session ${id} not found`);
  return session;
}

/** Test helper — never call in app code. */
export function _resetForTests(): void {
  sessions.clear();
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest --config apps/form_builder/jest.config.ts apps/form_builder/app/server/ai-builder/session-store.spec.ts
```

Expected: 5 passing tests.

- [ ] **Step 5: Commit**

```bash
git add apps/form_builder/app/server/ai-builder/session-store.ts apps/form_builder/app/server/ai-builder/session-store.spec.ts
git commit -m "feat(form_builder): add in-memory AI session store"
```

---

## Task 7: AI client module (Anthropic + Bedrock)

No unit tests — the client talks to external APIs. We rely on the smoke test in Task 13.

**Files:**
- Create: `apps/form_builder/app/server/ai-builder/ai-client.ts`

- [ ] **Step 1: Write the file**

Port `apps/api/src/form-builder/ai.service.ts`. Convert the NestJS injectable into a module with a lazy-initialised singleton. Read env vars directly from `process.env`.

```ts
// apps/form_builder/app/server/ai-builder/ai-client.ts
import { getSystemPrompt } from "./prompts/system-prompt";
import type { ChatMessage } from "./types";

let initialised = false;
let initPromise: Promise<void> | null = null;
let client: any = null;
let provider: "anthropic" | "bedrock" = "anthropic";
let model = "claude-sonnet-4-20250514";
let bedrockModelId = "us.anthropic.claude-sonnet-4-6";
let systemPrompt = "";

export async function ensureInitialised(): Promise<void> {
  if (initialised) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    systemPrompt = getSystemPrompt();
    provider = (process.env.AI_PROVIDER as "anthropic" | "bedrock") ?? "anthropic";
    model = process.env.AI_MODEL ?? "claude-sonnet-4-20250514";
    bedrockModelId = process.env.AI_MODEL ?? "us.anthropic.claude-sonnet-4-6";
    if (provider === "bedrock") {
      try {
        const { BedrockRuntimeClient } = await import("@aws-sdk/client-bedrock-runtime");
        client = new BedrockRuntimeClient({
          region: process.env.AWS_REGION ?? "us-east-1",
        });
      } catch {
        console.warn(
          "@aws-sdk/client-bedrock-runtime not installed — AI features disabled",
        );
      }
    } else {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        console.warn("ANTHROPIC_API_KEY not set — AI features will not work");
      } else {
        try {
          const { default: Anthropic } = await import("@anthropic-ai/sdk");
          client = new Anthropic({ apiKey });
        } catch {
          console.warn("@anthropic-ai/sdk not installed — AI features disabled");
        }
      }
    }
    initialised = true;
  })();
  return initPromise;
}

export async function isAvailable(): Promise<boolean> {
  await ensureInitialised();
  return !!client;
}

export async function buildSystemPromptFor(customComponentsList: string): Promise<string> {
  await ensureInitialised();
  if (!customComponentsList) return systemPrompt;
  return `${systemPrompt}\n\n## Live Custom Components (from database)\n${customComponentsList}`;
}

export async function chat(
  sessionSystemPrompt: string,
  messages: ChatMessage[],
  pdfPages?: string[],
): Promise<string> {
  await ensureInitialised();
  if (!client) {
    throw new Error("AI service not configured. Set ANTHROPIC_API_KEY.");
  }
  if (provider === "bedrock") {
    return chatBedrock(sessionSystemPrompt, messages, pdfPages);
  }
  return chatAnthropic(sessionSystemPrompt, messages, pdfPages);
}

async function chatAnthropic(
  sessionSystemPrompt: string,
  messages: ChatMessage[],
  pdfPages?: string[],
): Promise<string> {
  const apiMessages = messages.map((msg, idx) => {
    if (msg.role === "user" && pdfPages && idx === 0) {
      const content: any[] = pdfPages.map((page) => ({
        type: "image",
        source: { type: "base64", media_type: "image/png", data: page },
      }));
      content.push({ type: "text", text: msg.content });
      return { role: "user" as const, content };
    }
    return { role: msg.role as "user" | "assistant", content: msg.content };
  });
  const response = await client.messages.create({
    model,
    max_tokens: 8192,
    system: sessionSystemPrompt,
    messages: apiMessages,
  });
  const textBlock = response.content.find((block: any) => block.type === "text");
  return textBlock?.text ?? "";
}

async function chatBedrock(
  sessionSystemPrompt: string,
  messages: ChatMessage[],
  pdfPages?: string[],
): Promise<string> {
  const { ConverseCommand } = await import("@aws-sdk/client-bedrock-runtime");
  const bedrockMessages = messages.map((msg, idx) => {
    if (msg.role === "user" && pdfPages && idx === 0) {
      const content: any[] = pdfPages.map((page) => ({
        document: {
          format: "pdf" as const,
          name: "uploaded-form",
          source: { bytes: Buffer.from(page, "base64") },
        },
      }));
      content.push({ text: msg.content });
      return { role: "user" as const, content };
    }
    return {
      role: msg.role as "user" | "assistant",
      content: [{ text: msg.content }],
    };
  });
  const command = new ConverseCommand({
    modelId: bedrockModelId,
    system: [{ text: sessionSystemPrompt }],
    messages: bedrockMessages as any,
    inferenceConfig: { maxTokens: 16384 },
  });
  const response = await client.send(command);
  const textBlock = response.output?.message?.content?.find((b: any) => b.text);
  return textBlock?.text ?? "";
}
```

- [ ] **Step 2: Type-check the module compiles**

```bash
npx tsc --noEmit -p apps/form_builder/tsconfig.json
```

Expected: no errors. (If `tsconfig.json` doesn't include the new file because of an `include` pattern, double-check the path matches `app/**/*`.)

- [ ] **Step 3: Commit**

```bash
git add apps/form_builder/app/server/ai-builder/ai-client.ts
git commit -m "feat(form_builder): port AI client (Anthropic + Bedrock)"
```

---

## Task 8: Session server functions

This is the public surface the chat UI calls. Each function maps to one of the 9 NestJS endpoints from the spec.

**Files:**
- Create: `apps/form_builder/app/server/ai-builder/sessions.ts`

- [ ] **Step 1: Write the file**

```ts
// apps/form_builder/app/server/ai-builder/sessions.ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { CustomComponent, FormDefinitionEntity } from "@govtech-bb/database";
import { getDataSource } from "../db";
import {
  buildSystemPromptFor,
  chat,
  ensureInitialised,
  isAvailable,
} from "./ai-client";
import { extractRecipe } from "./recipe-extractor";
import { buildSql } from "./sql-builder";
import { create, get, getOrThrow } from "./session-store";
import type { PublishResponse, SessionResponse } from "./types";

const sessionIdSchema = z.object({ sessionId: z.string() });

export const getAiStatus = createServerFn({ method: "GET" }).handler(async () => {
  await ensureInitialised();
  const available = await isAvailable();
  return {
    available,
    message: available
      ? "AI service is ready"
      : "AI service not configured. Set ANTHROPIC_API_KEY in environment.",
  };
});

export const createSession = createServerFn({ method: "POST" })
  .inputValidator(z.object({ name: z.string().optional() }))
  .handler(async ({ data }): Promise<SessionResponse> => {
    const session = create(data?.name);
    const ds = await getDataSource();
    const customs = await ds.getRepository(CustomComponent).find();
    const componentList = customs
      .map((c) => {
        const def = c.definition as Record<string, unknown>;
        return `- \`components/${c.namespace}/${c.type}\` — ${def?.htmlType ?? "unknown"} (${def?.label ?? "no label"})`;
      })
      .join("\n");
    session.systemPrompt = await buildSystemPromptFor(componentList);
    return { sessionId: session.id, messages: [], recipe: null };
  });

export const sendMessage = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      sessionId: z.string(),
      message: z.string().min(1),
      pdfBase64: z.string().optional(),
    }),
  )
  .handler(async ({ data }): Promise<SessionResponse> => {
    if (!(await isAvailable())) {
      throw new Error("AI service not configured. Set ANTHROPIC_API_KEY.");
    }
    const session = getOrThrow(data.sessionId);
    if (data.pdfBase64 && !session.pdfPages) {
      session.pdfPages = [data.pdfBase64];
    }
    session.messages.push({ role: "user", content: data.message });
    const assistantText = await chat(
      session.systemPrompt,
      session.messages,
      session.pdfPages,
    );
    session.messages.push({ role: "assistant", content: assistantText });

    let recipe = extractRecipe(assistantText);
    if (!recipe) {
      for (let i = session.messages.length - 1; i >= 0; i--) {
        if (session.messages[i].role === "assistant") {
          recipe = extractRecipe(session.messages[i].content);
          if (recipe) break;
        }
      }
    }
    if (recipe) session.recipe = recipe;

    return {
      sessionId: session.id,
      messages: session.messages,
      recipe: session.recipe,
    };
  });

export const getSession = createServerFn({ method: "GET" })
  .inputValidator(sessionIdSchema)
  .handler(async ({ data }): Promise<SessionResponse> => {
    const session = get(data.sessionId);
    if (!session) throw new Error("Session not found");
    return {
      sessionId: session.id,
      messages: session.messages,
      recipe: session.recipe,
    };
  });

export const getRecipe = createServerFn({ method: "GET" })
  .inputValidator(sessionIdSchema)
  .handler(async ({ data }) => {
    const session = get(data.sessionId);
    if (!session?.recipe) throw new Error("No recipe generated yet");
    return { recipe: session.recipe };
  });

export const extractRecipeFromSession = createServerFn({ method: "POST" })
  .inputValidator(sessionIdSchema)
  .handler(async ({ data }) => {
    const session = getOrThrow(data.sessionId);
    for (let i = session.messages.length - 1; i >= 0; i--) {
      if (session.messages[i].role === "assistant") {
        const recipe = extractRecipe(session.messages[i].content);
        if (recipe) {
          session.recipe = recipe;
          return { recipe };
        }
      }
    }
    throw new Error(
      "Could not find a valid recipe in the conversation. The AI must output JSON with formId and steps fields.",
    );
  });

export const getSql = createServerFn({ method: "GET" })
  .inputValidator(sessionIdSchema)
  .handler(async ({ data }) => {
    const session = get(data.sessionId);
    if (!session?.recipe) throw new Error("No recipe generated yet");
    const recipe = session.recipe as Record<string, unknown> & { formId?: string };
    const formId = recipe.formId ?? "unnamed-form";
    return { sql: buildSql(formId, recipe) };
  });

export const publishSession = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ sessionId: z.string(), formId: z.string().optional() }),
  )
  .handler(async ({ data }): Promise<PublishResponse> => {
    const session = getOrThrow(data.sessionId);
    if (!session.recipe) {
      throw new Error("No recipe generated yet. Continue the conversation.");
    }
    const recipe = session.recipe as any;
    const formId = data.formId ?? recipe.formId;
    if (!formId) {
      throw new Error("Recipe has no formId. Provide one via the request.");
    }
    if (!recipe.formId || !recipe.steps || !Array.isArray(recipe.steps)) {
      throw new Error("Recipe must have formId and steps array.");
    }
    for (let i = 0; i < recipe.steps.length; i++) {
      const step = recipe.steps[i];
      if (
        !step.stepId ||
        !step.title ||
        !step.elements ||
        !Array.isArray(step.elements)
      ) {
        throw new Error(`Step ${i} must have stepId, title, and elements array.`);
      }
      for (let j = 0; j < step.elements.length; j++) {
        const el = step.elements[j];
        if (
          !el.ref ||
          (!el.ref.startsWith("components/") && !el.ref.startsWith("blocks/"))
        ) {
          throw new Error(
            `Step "${step.stepId}" element ${j}: ref must start with "components/" or "blocks/" (got "${el.ref}").`,
          );
        }
        if (el.ref.startsWith("components/") && !el.overrides?.fieldId) {
          throw new Error(
            `Step "${step.stepId}" element ${j} (ref: ${el.ref}): missing fieldId in overrides.`,
          );
        }
      }
    }
    if (!recipe.createdAt || !recipe.updatedAt || !recipe.version) {
      throw new Error("Recipe must have createdAt, updatedAt, and version fields.");
    }
    const sql = buildSql(formId, recipe);
    const ds = await getDataSource();
    const repo = ds.getRepository(FormDefinitionEntity);
    if (session.publishedFormId) {
      await repo.delete({ formId: session.publishedFormId });
    }
    const entity = repo.create({
      formId,
      version: recipe.version ?? "1.0.0",
      schema: recipe,
      publishedAt: new Date(),
    });
    await repo.save(entity);
    session.publishedFormId = formId;
    return {
      formId,
      message: `Form "${formId}" published successfully.`,
      sql,
      previewUrl: `https://app-sandbox.alpha.gov.bb/forms/${formId}`,
    };
  });

export const deletePublished = createServerFn({ method: "POST" })
  .inputValidator(sessionIdSchema)
  .handler(async ({ data }) => {
    const session = getOrThrow(data.sessionId);
    if (!session.publishedFormId) {
      throw new Error("No form has been published in this session.");
    }
    const ds = await getDataSource();
    await ds
      .getRepository(FormDefinitionEntity)
      .delete({ formId: session.publishedFormId });
    const deletedFormId = session.publishedFormId;
    session.publishedFormId = undefined;
    return { message: `Form "${deletedFormId}" deleted successfully.` };
  });
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit -p apps/form_builder/tsconfig.json
```

Expected: no errors. If `CustomComponent` or `FormDefinitionEntity` are not re-exported from `@govtech-bb/database`, the existing `apps/form_builder/app/server/registry.ts` already imports `CustomComponent` from there — copy that import. `FormDefinitionEntity` is imported from `@govtech-bb/database` in `apps/form_builder/app/server/forms.ts` — confirm the same export exists.

- [ ] **Step 3: Commit**

```bash
git add apps/form_builder/app/server/ai-builder/sessions.ts
git commit -m "feat(form_builder): add AI builder server functions"
```

---

## Task 9: Move the manual builder to `/builder/ui`

The current manual builder lives at `app/routes/builder/` (one `index.tsx` plus 14 `-*.tsx` helpers + 1 `-*.ts` reducer + 1 `-recipe-reducer.spec.ts` + 1 `-recipe-refs.ts`). It needs to move one level deeper into `app/routes/builder/ui/`.

**Files (all moves preserve git history via `git mv`):**
- Move: `app/routes/builder/index.tsx` → `app/routes/builder/ui/index.tsx`
- Move: `app/routes/builder/-*.tsx` → `app/routes/builder/ui/-*.tsx` (14 files)
- Move: `app/routes/builder/-recipe-reducer.ts` → `app/routes/builder/ui/-recipe-reducer.ts`
- Move: `app/routes/builder/-recipe-reducer.spec.ts` → `app/routes/builder/ui/-recipe-reducer.spec.ts`
- Move: `app/routes/builder/-recipe-refs.ts` → `app/routes/builder/ui/-recipe-refs.ts`

- [ ] **Step 1: Create the new directory and move all files**

```bash
mkdir -p apps/form_builder/app/routes/builder/ui
git mv apps/form_builder/app/routes/builder/index.tsx apps/form_builder/app/routes/builder/ui/index.tsx
for f in apps/form_builder/app/routes/builder/-*; do
  git mv "$f" "apps/form_builder/app/routes/builder/ui/$(basename $f)"
done
```

Verify with `ls apps/form_builder/app/routes/builder/ui/` — you should see `index.tsx` plus the 14 dash-prefixed components plus `-recipe-reducer.ts`, `-recipe-reducer.spec.ts`, and `-recipe-refs.ts`.

- [ ] **Step 2: Update the route literal in the moved `index.tsx`**

Open `apps/form_builder/app/routes/builder/ui/index.tsx`. Find the `createFileRoute("/builder/")` call near line 23:

Replace:

```ts
export const Route = createFileRoute("/builder/")({
```

With:

```ts
export const Route = createFileRoute("/builder/ui/")({
```

- [ ] **Step 3: Update relative imports in `ui/index.tsx`**

The moved `index.tsx` references files outside the `ui/` directory using `../../`. After the move those paths need one more `../`. In `apps/form_builder/app/routes/builder/ui/index.tsx`, update these import paths:

| Old | New |
|---|---|
| `"../../styles/builder.global.css"` | `"../../../styles/builder.global.css"` |
| `"../../server/registry"` | `"../../../server/registry"` |
| `"../../server/forms"` | `"../../../server/forms"` |
| `"../../lib/version"` | `"../../../lib/version"` |
| `"../../styles/builder.module.css"` | `"../../../styles/builder.module.css"` |

Imports beginning with `"./"` (the local helpers, e.g. `./-recipe-reducer`) are unchanged — those moved alongside the file.

- [ ] **Step 4: Update relative imports in each moved helper**

For every `apps/form_builder/app/routes/builder/ui/-*.tsx` and `-*.ts` file, perform the same path bump on imports going up to `server/`, `styles/`, `types/`, `lib/`:

```bash
cd apps/form_builder/app/routes/builder/ui
for f in -*.tsx -*.ts; do
  [ -f "$f" ] || continue
  sed -i 's|"\.\./\.\./server/|"../../../server/|g' "$f"
  sed -i 's|"\.\./\.\./styles/|"../../../styles/|g' "$f"
  sed -i 's|"\.\./\.\./types/|"../../../types/|g' "$f"
  sed -i 's|"\.\./\.\./lib/|"../../../lib/|g' "$f"
done
cd -
```

Note: the spec file `-recipe-reducer.spec.ts` should not require path changes if it only imports from `./` siblings — the `sed` is a no-op on files without those patterns.

- [ ] **Step 5: Verify type-check passes**

```bash
npx tsc --noEmit -p apps/form_builder/tsconfig.json
```

Expected: no errors. If any helper had an import path the `sed` didn't catch (e.g. a single-quoted string), the type check surfaces it — fix and re-run.

- [ ] **Step 6: Run existing reducer tests to confirm nothing broke**

```bash
npx jest --config apps/form_builder/jest.config.ts apps/form_builder/app/routes/builder/ui/-recipe-reducer.spec.ts
```

Expected: all reducer tests pass (same set that passed before the move).

- [ ] **Step 7: Commit**

```bash
git add apps/form_builder/app/routes/builder/
git commit -m "refactor(form_builder): move manual builder to /builder/ui"
```

---

## Task 10: Port the AI chat UI to `/builder/ai`

Port `apps/forms/src/routes/admin/form-builder.tsx` into the form_builder app and rewire it to use server functions instead of `fetch(VITE_API_URL)`.

**Files:**
- Create: `apps/form_builder/app/routes/builder/ai/index.tsx`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p apps/form_builder/app/routes/builder/ai
```

- [ ] **Step 2: Write the route file**

Create `apps/form_builder/app/routes/builder/ai/index.tsx`. The structure mirrors the original (chat panel left, recipe preview right) but every `fetch` becomes a server-fn call. PDF upload reads the file in the browser into base64 (`await file.arrayBuffer()` then `btoa(...)`) and passes that string to `sendMessage` — keeping the binary out of the multipart layer entirely. Inline styles preserved verbatim from the source.

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import {
  createSession,
  sendMessage,
  publishSession,
  deletePublished,
  extractRecipeFromSession,
  getSql,
} from "../../../server/ai-builder/sessions";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface SessionState {
  sessionId: string | null;
  messages: ChatMessage[];
  recipe: Record<string, unknown> | null;
  loading: boolean;
  error: string | null;
}

export const Route = createFileRoute("/builder/ai/")({
  component: AiFormBuilderPage,
});

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function AiFormBuilderPage() {
  const [session, setSession] = useState<SessionState>({
    sessionId: null,
    messages: [],
    recipe: null,
    loading: false,
    error: null,
  });
  const [input, setInput] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfName, setPdfName] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session.messages]);

  const startSession = async (): Promise<string | null> => {
    setSession((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await createSession({ data: { name: pdfName ?? "New form" } });
      setSession((s) => ({ ...s, sessionId: data.sessionId, loading: false }));
      return data.sessionId;
    } catch (err: any) {
      setSession((s) => ({ ...s, loading: false, error: err.message }));
      return null;
    }
  };

  const send = async (overrideSessionId?: string) => {
    const sessionId = overrideSessionId ?? session.sessionId;
    if (!sessionId || !input.trim()) return;
    const userMessage = input.trim();
    setInput("");
    setSession((s) => ({
      ...s,
      messages: [...s.messages, { role: "user", content: userMessage }],
      loading: true,
      error: null,
    }));
    try {
      const pdfBase64 = pdfFile ? await fileToBase64(pdfFile) : undefined;
      const data = await sendMessage({
        data: { sessionId, message: userMessage, pdfBase64 },
      });
      if (pdfFile) setPdfFile(null);
      setSession((s) => ({
        ...s,
        messages: data.messages,
        recipe: data.recipe,
        loading: false,
      }));
    } catch (err: any) {
      setSession((s) => ({ ...s, loading: false, error: err.message }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    if (!session.sessionId) {
      const newSessionId = await startSession();
      if (newSessionId) await send(newSessionId);
    } else {
      await send();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfName(file.name);
    setPdfFile(file);
  };

  const handlePublish = async () => {
    if (!session.sessionId || !session.recipe) return;
    setPublishing(true);
    try {
      const data = await publishSession({
        data: { sessionId: session.sessionId },
      });
      setPublishResult(data.message ?? "Published!");
      if (data.previewUrl) setPreviewUrl(data.previewUrl);
    } catch (err: any) {
      setPublishResult(`Error: ${err.message}`);
    }
    setPublishing(false);
  };

  const handleDelete = async () => {
    if (!session.sessionId) return;
    if (!confirm("Are you sure you want to delete this form?")) return;
    try {
      const data = await deletePublished({
        data: { sessionId: session.sessionId },
      });
      setPublishResult(data.message ?? "Deleted!");
      setPreviewUrl(null);
    } catch (err: any) {
      setPublishResult(`Error: ${err.message}`);
    }
  };

  const handleExportSql = async () => {
    if (!session.sessionId) return;
    try {
      const data = await getSql({ data: { sessionId: session.sessionId } });
      if (data.sql) {
        const blob = new Blob([data.sql], { type: "text/sql" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${(session.recipe as any)?.formId ?? "form"}.sql`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err: any) {
      setSession((s) => ({ ...s, error: err.message }));
    }
  };

  const handleExtract = async () => {
    if (!session.sessionId) return;
    try {
      const data = await extractRecipeFromSession({
        data: { sessionId: session.sessionId },
      });
      setSession((s) => ({ ...s, recipe: data.recipe }));
    } catch (err: any) {
      setPublishResult(err.message ?? "No recipe found in conversation");
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "system-ui" }}>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid #e0e0e0",
        }}
      >
        <div style={{ padding: "16px", borderBottom: "1px solid #e0e0e0", background: "#f8f9fa" }}>
          <h2 style={{ margin: 0 }}>Form Builder AI</h2>
          <p style={{ margin: "4px 0 0", color: "#666", fontSize: "14px" }}>
            Upload a PDF form and I'll convert it to a digital form recipe.
          </p>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
          {session.messages.length === 0 && (
            <div style={{ color: "#999", textAlign: "center", marginTop: "40px" }}>
              <p>Upload a PDF or describe a form to get started.</p>
            </div>
          )}
          {session.messages.map((msg, i) => (
            <div
              key={i}
              style={{
                marginBottom: "12px",
                padding: "12px",
                borderRadius: "8px",
                background: msg.role === "user" ? "#e3f2fd" : "#f5f5f5",
                maxWidth: "85%",
                marginLeft: msg.role === "user" ? "auto" : "0",
                whiteSpace: "pre-wrap",
                fontSize: "14px",
              }}
            >
              <strong style={{ fontSize: "12px", color: "#666" }}>
                {msg.role === "user" ? "You" : "AI Assistant"}
              </strong>
              <div style={{ marginTop: "4px" }}>{msg.content}</div>
            </div>
          ))}
          {session.loading && <div style={{ color: "#666", fontStyle: "italic" }}>Thinking...</div>}
          {session.error && (
            <div style={{ color: "red", padding: "8px" }}>Error: {session.error}</div>
          )}
          <div ref={chatEndRef} />
        </div>
        <form
          onSubmit={handleSubmit}
          style={{
            padding: "16px",
            borderTop: "1px solid #e0e0e0",
            display: "flex",
            gap: "8px",
            alignItems: "center",
          }}
        >
          <label
            style={{
              cursor: "pointer",
              padding: "8px 12px",
              background: pdfFile ? "#4caf50" : "#e0e0e0",
              borderRadius: "4px",
              fontSize: "14px",
              color: pdfFile ? "white" : "#333",
            }}
          >
            {pdfFile ? `✓ ${pdfName}` : "📎 PDF"}
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={handleFileUpload}
              style={{ display: "none" }}
            />
          </label>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe the form or ask a question..."
            style={{
              flex: 1,
              padding: "10px 12px",
              border: "1px solid #ddd",
              borderRadius: "4px",
              fontSize: "14px",
            }}
            disabled={session.loading}
          />
          <button
            type="submit"
            disabled={session.loading || !input.trim()}
            style={{
              padding: "10px 20px",
              background: "#1976d2",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            Send
          </button>
        </form>
      </div>
      <div style={{ width: "450px", display: "flex", flexDirection: "column", background: "#fafafa" }}>
        <div
          style={{
            padding: "16px",
            borderBottom: "1px solid #e0e0e0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h3 style={{ margin: 0 }}>Recipe Output</h3>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={handleExtract}
              disabled={!session.sessionId || !!session.recipe}
              style={{
                padding: "6px 12px",
                background: session.sessionId && !session.recipe ? "#2196f3" : "#e0e0e0",
                color: session.sessionId && !session.recipe ? "white" : "#999",
                border: "none",
                borderRadius: "4px",
                cursor: session.sessionId && !session.recipe ? "pointer" : "default",
                fontSize: "12px",
              }}
            >
              Extract
            </button>
            <button
              onClick={handleExportSql}
              disabled={!session.recipe}
              style={{
                padding: "6px 12px",
                background: session.recipe ? "#ff9800" : "#e0e0e0",
                color: session.recipe ? "white" : "#999",
                border: "none",
                borderRadius: "4px",
                cursor: session.recipe ? "pointer" : "default",
                fontSize: "12px",
              }}
            >
              Export SQL
            </button>
            <button
              onClick={handlePublish}
              disabled={!session.recipe || publishing}
              style={{
                padding: "6px 12px",
                background: session.recipe ? "#4caf50" : "#e0e0e0",
                color: session.recipe ? "white" : "#999",
                border: "none",
                borderRadius: "4px",
                cursor: session.recipe ? "pointer" : "default",
                fontSize: "12px",
              }}
            >
              {publishing ? "Publishing..." : "Publish"}
            </button>
          </div>
        </div>
        {publishResult && (
          <div
            style={{
              padding: "8px 16px",
              background: publishResult.startsWith("Error") ? "#ffebee" : "#e8f5e9",
              fontSize: "13px",
            }}
          >
            {publishResult}
          </div>
        )}
        {previewUrl && (
          <div
            style={{
              padding: "8px 16px",
              background: "#e3f2fd",
              fontSize: "13px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <a href={previewUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#1976d2" }}>
              🔗 Preview form
            </a>
            <button
              onClick={handleDelete}
              style={{
                padding: "4px 8px",
                background: "#f44336",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "11px",
              }}
            >
              Delete
            </button>
          </div>
        )}
        <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
          {session.recipe ? (
            <pre
              style={{
                fontSize: "11px",
                background: "#263238",
                color: "#eeffff",
                padding: "16px",
                borderRadius: "8px",
                overflow: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {JSON.stringify(session.recipe, null, 2)}
            </pre>
          ) : (
            <div style={{ color: "#999", textAlign: "center", marginTop: "40px" }}>
              <p>Recipe will appear here once the AI generates it.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit -p apps/form_builder/tsconfig.json
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/form_builder/app/routes/builder/ai/
git commit -m "feat(form_builder): port AI chat UI to /builder/ai"
```

---

## Task 11: Add `/builder` landing chooser

**Files:**
- Create: `apps/form_builder/app/routes/builder/index.tsx`

- [ ] **Step 1: Write the new landing route**

```tsx
// apps/form_builder/app/routes/builder/index.tsx
import "../../styles/builder.global.css";
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/builder/")({
  component: BuilderLanding,
});

const cardStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 12,
  padding: 32,
  border: "1px solid #e0e0e0",
  borderRadius: 12,
  background: "#fff",
  textDecoration: "none",
  color: "#222",
};

function BuilderLanding() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
        fontFamily: "system-ui",
        background: "#fafafa",
      }}
    >
      <div
        style={{
          maxWidth: 900,
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        <header style={{ textAlign: "center" }}>
          <h1 style={{ margin: 0, fontSize: 28 }}>Form Builder</h1>
          <p style={{ marginTop: 8, color: "#666" }}>
            Pick how you want to author this form.
          </p>
        </header>
        <div style={{ display: "flex", gap: 16 }}>
          <Link to="/builder/ui" style={cardStyle}>
            <div style={{ fontSize: 32 }}>🧱</div>
            <h2 style={{ margin: 0, fontSize: 20 }}>Build with the UI</h2>
            <p style={{ margin: 0, color: "#666", textAlign: "center" }}>
              Drag, configure, and validate. Full control via the visual editor.
            </p>
            <span style={{ color: "#1976d2", fontWeight: 600 }}>Open UI builder →</span>
          </Link>
          <Link to="/builder/ai" style={cardStyle}>
            <div style={{ fontSize: 32 }}>🤖</div>
            <h2 style={{ margin: 0, fontSize: 20 }}>Build with AI</h2>
            <p style={{ margin: 0, color: "#666", textAlign: "center" }}>
              Describe a form or upload a PDF — Claude turns it into a recipe.
            </p>
            <span style={{ color: "#1976d2", fontWeight: 600 }}>Open AI builder →</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit -p apps/form_builder/tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/form_builder/app/routes/builder/index.tsx
git commit -m "feat(form_builder): add /builder landing chooser"
```

---

## Task 12: Regenerate route tree and verify dev startup

**Files:**
- Modify: `apps/form_builder/app/routeTree.gen.ts` (auto-regenerated)

- [ ] **Step 1: Start the dev server (regenerates route tree on first scan)**

```bash
npm run --workspace=apps/form_builder dev
```

Wait until you see "Local: http://localhost:..." in the output. The TanStack router plugin emits a fresh `app/routeTree.gen.ts` listing `/`, `/builder/`, `/builder/ui/`, and `/builder/ai/`.

- [ ] **Step 2: Visit each route in a browser**

- `http://localhost:<port>/builder` → landing chooser (two cards).
- `http://localhost:<port>/builder/ui` → existing manual builder.
- `http://localhost:<port>/builder/ai` → empty chat UI ("Upload a PDF or describe a form to get started.").

Stop the dev server (Ctrl-C).

- [ ] **Step 3: Inspect the regenerated route tree**

```bash
grep -E "/builder/?(ui|ai)?" apps/form_builder/app/routeTree.gen.ts
```

Expected: lines for `/builder/`, `/builder/ui/`, and `/builder/ai/`.

- [ ] **Step 4: Commit the regenerated file**

```bash
git add apps/form_builder/app/routeTree.gen.ts
git commit -m "chore(form_builder): regenerate route tree after route reshuffle"
```

---

## Task 13: End-to-end smoke test

No code changes — this is a manual verification gate before deleting the old code paths. Both `apps/api` and `apps/form_builder` must run.

- [ ] **Step 1: Start the API (still hosts the AI endpoints at this point, but the form_builder no longer uses them)**

```bash
npm run --workspace=apps/api start:dev
```

- [ ] **Step 2: In a second terminal, start the form_builder**

```bash
npm run --workspace=apps/form_builder dev
```

Confirm both come up.

- [ ] **Step 3: Exercise the AI builder end-to-end**

In a browser:
1. Open `/builder/ai`.
2. Type a description (e.g. "A 2-step form: name + email on step 1, dropdown of provinces on step 2.") and submit.
3. Confirm a recipe appears in the right panel.
4. Click **Publish**. Confirm the "Form published successfully" banner with a preview URL.
5. Open a new tab to `/builder/ui`. Open the form picker — the form you just published should appear in the list.
6. Back in `/builder/ai`, click **Delete**. Confirm it disappears from the picker after a reload.

If any step fails, debug before continuing. Common causes:
- `ANTHROPIC_API_KEY` not set in `apps/form_builder/.env`.
- DB connection vars in `apps/form_builder/.env` don't match the running Postgres.

- [ ] **Step 4: Stop both servers (Ctrl-C in each terminal)**

No commit — verification only.

---

## Task 14: Remove the NestJS FormBuilderModule

**Files:**
- Delete: `apps/api/src/form-builder/` (whole directory)
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/config/env.validation.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Remove the module import + entry from `app.module.ts`**

In `apps/api/src/app.module.ts`:

Delete line 13:

```ts
import { FormBuilderModule } from "./form-builder/form-builder.module";
```

Delete line 46 (`FormBuilderModule,` inside the `imports` array). The trailing comma on `PaymentsModule,` stays valid.

- [ ] **Step 2: Remove AI env vars from `env.validation.ts`**

In `apps/api/src/config/env.validation.ts`, delete lines 67–70 (the four-line block):

```ts
  // AI / Form Builder (optional — required only for form-builder feature)
  AI_PROVIDER: Joi.string().valid("anthropic", "bedrock").default("anthropic"),
  AI_MODEL: Joi.string().default("claude-sonnet-4-20250514"),
  ANTHROPIC_API_KEY: Joi.string().optional().allow(""),
```

- [ ] **Step 3: Delete the form-builder directory**

```bash
git rm -r apps/api/src/form-builder/
```

- [ ] **Step 4: Drop unused AI deps from api package.json**

In `apps/api/package.json`, remove these two lines from `"dependencies"`:

```
"@anthropic-ai/sdk": "^0.39.0",
"@aws-sdk/client-bedrock-runtime": "^3.0.0",
```

Run from the monorepo root:

```bash
npm install
```

Expected: lockfile updates, no errors.

- [ ] **Step 5: Verify API still builds**

```bash
npm run --workspace=apps/api build
```

Expected: build succeeds. If any other file imports from `./form-builder/...`, the build fails — search and remove. The earlier check (`grep -rn "form-builder" apps/api/src --include="*.ts" -l`) flagged only `main.ts` (a comment) and `app.module.ts` + `env.validation.ts` (both handled above).

- [ ] **Step 6: Run API tests**

```bash
npm run --workspace=apps/api test
```

Expected: existing tests pass (none target the removed module directly; if any do, delete those test files too — they reference deleted code).

- [ ] **Step 7: Commit**

```bash
git add apps/api/ package-lock.json
git commit -m "refactor(api): remove FormBuilderModule (moved to apps/form_builder)"
```

---

## Task 15: Remove the forms admin route

**Files:**
- Delete: `apps/forms/src/routes/admin/form-builder.tsx`
- Delete: `apps/forms/src/routes/admin/` (if empty)
- Modify: `apps/forms/src/routeTree.gen.ts` (auto-regenerated)

- [ ] **Step 1: Delete the route file**

```bash
git rm apps/forms/src/routes/admin/form-builder.tsx
```

- [ ] **Step 2: Remove the admin directory if it is now empty**

```bash
rmdir apps/forms/src/routes/admin 2>/dev/null || ls apps/forms/src/routes/admin
```

If `rmdir` failed because other files exist, leave the directory; otherwise it's already gone.

- [ ] **Step 3: Regenerate the forms route tree**

Either start the dev server briefly (`npm run --workspace=apps/forms dev`) and stop it after the route tree regenerates, or trigger a build (`npm run --workspace=apps/forms build`). The plugin rewrites `apps/forms/src/routeTree.gen.ts` to drop the `admin/form-builder` route.

- [ ] **Step 4: Type-check forms**

```bash
npx tsc --noEmit -p apps/forms/tsconfig.json
```

Expected: no errors. (`apps/forms/src/lib/api/forms.ts` contains a `form-builder` substring match but it points at the runtime form-builder lib, not the admin page — leave it alone.)

- [ ] **Step 5: Commit**

```bash
git add apps/forms/src/routes/ apps/forms/src/routeTree.gen.ts
git commit -m "refactor(forms): remove AI form builder admin route"
```

---

## Task 16: Update docs

**Files:**
- Modify: `docs/form-builder-ai-guardrails.md` (only if it references the old endpoint URLs)
- Modify: `apps/api/README.md` (only if it lists the `/form-builder/*` endpoints)
- Modify: `apps/form_builder/docs/*` (mention the new `/builder/ai` route if relevant)

- [ ] **Step 1: Scan for stale references**

```bash
grep -rn "form-builder/sessions\|/admin/form-builder\|FormBuilderModule" docs apps/api/README.md apps/form_builder/docs 2>/dev/null
```

Review each hit. For each:
- If it describes the old NestJS endpoint or admin route, update to point at the new TanStack server functions / `/builder/ai` route.
- If it's a historical record (CHANGELOG, post-mortem), leave it.

- [ ] **Step 2: If any docs were edited, commit**

```bash
git add docs/ apps/api/README.md apps/form_builder/docs/ 2>/dev/null
git diff --cached --stat
git commit -m "docs: point AI form builder docs at apps/form_builder/builder/ai"
```

If `git diff --cached --stat` shows nothing, skip the commit.

---

## Final Verification

- [ ] **Step 1: Run the full test suite across all changed workspaces**

```bash
npm run --workspace=apps/form_builder test
npm run --workspace=apps/api test
```

Both should pass. The form_builder run now includes the new `recipe-extractor.spec.ts`, `sql-builder.spec.ts`, and `session-store.spec.ts` files alongside the existing reducer spec.

- [ ] **Step 2: One more end-to-end check**

Start `apps/form_builder` only (no more `apps/api` dependency for the AI builder). Repeat the publish flow from Task 13. Confirm the form lands in the DB and shows up in the manual builder's picker — same data path, just no NestJS in front.

- [ ] **Step 3: Final commit if anything changed**

If verification revealed bugs and you committed fixes, you're done. If everything was already clean, no extra commit needed.

Done. The AI form builder lives entirely inside `apps/form_builder/`, the manual and AI builders are siblings under `/builder/`, and `apps/api` no longer carries an AI dependency.
