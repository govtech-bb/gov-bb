# Preview branch-only form recipes in PR previews — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a reviewer walk a new/changed form (render + flow) from a PR preview link before merge, by hydrating branch recipes into `ServiceContract` JSON at Amplify build time and serving them from the forms app under a preview flag.

**Architecture:** A `tsx` generator hydrates every recipe into a public `ServiceContract` (stripping `processors`) using the API's real pure `hydrateForm` engine + `BUILTIN_REGISTRY`. In preview builds only (`VITE_PREVIEW_CONTRACTS=1`), the Amplify forms build runs the generator, the forms loader prefers the bundled contract, and submission is stubbed. Production/sandbox never set the flag, so all of it is dead code there. Recipes are **not** relocated (deferred — see the design doc's Decisions section).

**Tech Stack:** TypeScript, `tsx`, Vitest 4, Zod, TanStack Router/Query, Vite (`import.meta.glob`), nx, AWS Amplify build (`amplify.yml`), GitHub Actions.

**Design doc:** [docs/superpowers/specs/2026-07-23-preview-branch-recipes-in-forms-design.md](../specs/2026-07-23-preview-branch-recipes-in-forms-design.md)

## Global Constraints

- Use **pnpm** for everything — never `npm`.
- Branch names must not contain a `.` — use `-`. Open PRs against `main`.
- Tests run on **Vitest 4** via nx. Run the build before pushing: `pnpm exec nx run-many -t build --exclude=landing`.
- The generator must depend only on **pure** code (`resolution.ts` + `@govtech-bb/form-types` + `@govtech-bb/registry`) — no NestJS, no DB, no secrets.
- The generated preview contract must **not** contain `processors` (the API strips them on the public path; they carry endpoint/`secretEnv`/mapping config).
- Preview behaviour is gated entirely behind `import.meta.env.VITE_PREVIEW_CONTRACTS`; when unset, forms behaviour is byte-for-byte unchanged.
- SHA-pin any new GitHub Action with its exact release-tag comment (not `# vN`). (No new actions are expected in this plan.)

---

### Task 1: Preview contract generator

Produces `apps/forms/contracts/preview/<formId>.json` for every recipe, using the real hydration engine, with `processors` stripped. Models the existing `scripts/validate-recipes.ts`.

> **Executed variant:** `scripts/` is not a tested nx project, so the pure core + its spec live in **`apps/api/src/registry/`** (covered by apps/api's nx vitest); `scripts/generate-preview-contracts.ts` is the thin fs wrapper that imports it. Confirmed during execution: `tsx` resolves `@govtech-bb/registry` and the apps/api import with **no prior package build**, so the `amplify.yml` step needs no `registry:build` prefix.

**Files:**
- Create: `apps/api/src/registry/preview-contract.ts` (pure `hydrateRecipeForPreview`)
- Test: `apps/api/src/registry/preview-contract.spec.ts`
- Create: `scripts/generate-preview-contracts.ts` (thin fs wrapper)
- Modify: `package.json` (add `generate:preview-contracts` script, next to `validate-recipes` at line 30)
- Create: `apps/forms/contracts/preview/.gitkeep`
- Modify: `.gitignore` (ignore generated preview contracts)

**Interfaces:**
- Produces: `hydrateRecipeForPreview(recipe: ServiceContractRecipe): Promise<ServiceContract>` (exported from `apps/api/src/registry/preview-contract.ts`) — hydrates + strips `processors` + validates. Throws `UnresolvableComponentError` on an unknown ref.
- Produces: the CLI `pnpm generate:preview-contracts`, writing `apps/forms/contracts/preview/<formId>.json`.

- [ ] **Step 1: Add the output dir placeholder and gitignore rule**

Create `apps/forms/contracts/preview/.gitkeep` (empty file) so the directory exists for `import.meta.glob` even when no contracts are generated.

Add to `.gitignore` (append near the existing `apps/forms/test-results/` line ~164):

```gitignore
# Generated at Amplify preview build time (VITE_PREVIEW_CONTRACTS=1); never committed.
apps/forms/contracts/preview/*.json
```

- [ ] **Step 2: Write the failing test**

Create `scripts/generate-preview-contracts.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  serviceContractRecipeSchema,
  serviceContractSchema,
} from "@govtech-bb/form-types";
import { hydrateRecipeForPreview } from "./generate-preview-contracts";

const RECIPES_ROOT = path.resolve(
  __dirname,
  "../apps/api/src/forms/form-definitions/recipes",
);

async function recipeFiles(): Promise<string[]> {
  const entries = await fs.readdir(RECIPES_ROOT, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".json"))
    .map((e) => e.name);
}

describe("hydrateRecipeForPreview", () => {
  it("hydrates every real recipe to a schema-valid contract with processors stripped", async () => {
    const files = await recipeFiles();
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const raw = JSON.parse(
        await fs.readFile(path.join(RECIPES_ROOT, file), "utf8"),
      );
      const recipe = serviceContractRecipeSchema.parse(raw);
      const contract = await hydrateRecipeForPreview(recipe);
      expect(() => serviceContractSchema.parse(contract)).not.toThrow();
      expect(contract).not.toHaveProperty("processors");
    }
  });

  it("throws when a recipe references an unknown component", async () => {
    const files = await recipeFiles();
    const rawText = await fs.readFile(
      path.join(RECIPES_ROOT, files[0]),
      "utf8",
    );
    // Recipes contain `"ref": "components/..."` / `"blocks/..."` entries;
    // corrupt the first so hydration cannot resolve it.
    const corrupted = rawText.replace(
      /"ref":\s*"[^"]+"/,
      '"ref": "components/__does_not_exist__"',
    );
    expect(corrupted).not.toEqual(rawText); // guard: the recipe had a ref
    const recipe = serviceContractRecipeSchema.parse(JSON.parse(corrupted));
    await expect(hydrateRecipeForPreview(recipe)).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm exec vitest run scripts/generate-preview-contracts.spec.ts`
Expected: FAIL — `Failed to resolve import "./generate-preview-contracts"` (module doesn't exist yet).

(If Vitest can't find a config for `scripts/`, use the same invocation that runs `scripts/validate-recipes.spec.ts`; confirm with `pnpm exec vitest run scripts/validate-recipes.spec.ts` first.)

- [ ] **Step 4: Write the generator**

Create `scripts/generate-preview-contracts.ts`:

```ts
#!/usr/bin/env node
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  serviceContractRecipeSchema,
  serviceContractSchema,
} from "@govtech-bb/form-types";
import type {
  ServiceContract,
  ServiceContractRecipe,
} from "@govtech-bb/form-types";
import { BUILTIN_REGISTRY } from "@govtech-bb/registry";
import {
  hydrateForm,
  type Resolver,
} from "../apps/api/src/registry/resolution";

// Same recipes dir the API loader, validate-recipes, and the Dockerfile point
// at. Resolve from this file's location (tsx provides __dirname) so it works
// regardless of cwd — matching scripts/validate-recipes.ts.
const RECIPES_ROOT = path.resolve(
  __dirname,
  "../apps/api/src/forms/form-definitions/recipes",
);

// Bundled into the forms preview build (see form-fetcher.ts / preview-contracts.ts).
// Git-ignored; the dir itself is kept via .gitkeep.
const OUTPUT_ROOT = path.resolve(__dirname, "../apps/forms/contracts/preview");

// Builtin-only resolver. Repo recipes are guarded (scripts/recipe-ref-guards.ts)
// to reference only BUILTIN_REGISTRY entries, so a custom (DB-backed) ref
// returns null and hydrateForm throws UnresolvableComponentError — a loud
// failure is correct here rather than a silently-wrong preview contract.
const resolver: Resolver = async (ref) => BUILTIN_REGISTRY[ref] ?? null;

/**
 * Hydrate a raw recipe into the ServiceContract the API serves on the public
 * path, minus `processors` (which FormDefinitionsService.findByFormId strips
 * before the client sees them — never bundle endpoint/secretEnv/mapping config
 * into the public preview client). Throws on an unresolvable ref.
 */
export async function hydrateRecipeForPreview(
  recipe: ServiceContractRecipe,
): Promise<ServiceContract> {
  const hydrated = await hydrateForm(recipe, resolver);
  const { processors: _processors, ...publicContract } = hydrated;
  return serviceContractSchema.parse(publicContract);
}

async function main(): Promise<void> {
  const entries = await fs.readdir(RECIPES_ROOT, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && e.name.endsWith(".json"))
    .map((e) => e.name);

  await fs.mkdir(OUTPUT_ROOT, { recursive: true });

  let count = 0;
  for (const file of files) {
    const raw = JSON.parse(
      await fs.readFile(path.join(RECIPES_ROOT, file), "utf8"),
    );
    const recipe = serviceContractRecipeSchema.parse(raw);
    const contract = await hydrateRecipeForPreview(recipe);
    await fs.writeFile(
      path.join(OUTPUT_ROOT, `${recipe.formId}.json`),
      `${JSON.stringify(contract, null, 2)}\n`,
    );
    count++;
  }
  console.log(`Generated ${count} preview contract(s) into ${OUTPUT_ROOT}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 5: Add the package.json script**

In `package.json`, add after the `"validate-recipes"` entry (line 30):

```json
    "generate:preview-contracts": "tsx scripts/generate-preview-contracts.ts",
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm exec vitest run scripts/generate-preview-contracts.spec.ts`
Expected: PASS (both tests).

- [ ] **Step 7: Run the generator end-to-end and confirm output**

Run: `pnpm generate:preview-contracts`
Expected: prints `Generated N preview contract(s) into .../apps/forms/contracts/preview.` with N = number of recipe files.

Run: `git status --porcelain apps/forms/contracts/preview/`
Expected: no output — the generated `*.json` are git-ignored (only `.gitkeep` is tracked). Spot-check one file:

Run: `node -e "const c=require('./apps/forms/contracts/preview/'+require('fs').readdirSync('apps/forms/contracts/preview').find(f=>f.endsWith('.json'))); console.log('processors' in c, c.formId)"`
Expected: `false <someFormId>` (no `processors` key).

> **Note on Amplify resolution:** `pnpm generate:preview-contracts` here must resolve `@govtech-bb/registry` without a prior package build (same as `validate-recipes`). If Step 7 only works after building packages, record the required prefix — it feeds the exact `amplify.yml` command in Task 4 Step 2.

- [ ] **Step 8: Commit**

```bash
git add scripts/generate-preview-contracts.ts scripts/generate-preview-contracts.spec.ts package.json apps/forms/contracts/preview/.gitkeep .gitignore
git commit -m "feat(forms): generator hydrating recipes into preview ServiceContracts"
```

---

### Task 2: Forms loader prefers bundled preview contract

In preview mode, `fetchContract` returns the bundled contract for the requested `formId` (if present) instead of hitting the API — so both new and changed branch forms render.

**Files:**
- Create: `apps/forms/src/lib/form-builder/preview-contracts.ts`
- Modify: `apps/forms/src/lib/form-builder/form-fetcher.ts`
- Test: `apps/forms/src/lib/form-builder/form-fetcher.spec.ts`

**Interfaces:**
- Consumes (Task 1): bundled JSON at `apps/forms/contracts/preview/<formId>.json`.
- Produces: `getPreviewContract(formId: string): ServiceContract | undefined` (from `preview-contracts.ts`).
- Modifies: `fetchContract(id, preview?, draft?): Promise<ClientServiceContract>` (unchanged signature).

- [ ] **Step 1: Write the preview-contracts loader module**

Create `apps/forms/src/lib/form-builder/preview-contracts.ts`:

```ts
// Build-time index of generated preview contracts (Task 1 output). Vite's
// import.meta.glob resolves these at build time; in a normal build the dir
// holds only `.gitkeep`, so the glob is empty and this module is inert. Only
// the Amplify preview build (VITE_PREVIEW_CONTRACTS=1) populates the dir.
import {
  serviceContractSchema,
  type ServiceContract,
} from "@govtech-bb/form-types";

const modules = import.meta.glob("../../../contracts/preview/*.json", {
  eager: true,
  import: "default",
});

const byFormId = new Map<string, unknown>();
for (const [filePath, mod] of Object.entries(modules)) {
  const formId = filePath.split("/").pop()?.replace(/\.json$/, "");
  if (formId) byFormId.set(formId, mod);
}

/**
 * Returns the bundled preview contract for a form, or undefined if none was
 * generated for it. Caller gates on import.meta.env.VITE_PREVIEW_CONTRACTS.
 */
export const getPreviewContract = (
  formId: string,
): ServiceContract | undefined => {
  const mod = byFormId.get(formId);
  return mod ? serviceContractSchema.parse(mod) : undefined;
};
```

- [ ] **Step 2: Write the failing test**

Create `apps/forms/src/lib/form-builder/form-fetcher.spec.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { serviceContractSchema } from "@govtech-bb/form-types";
import exampleContract from "../../../contracts/example-service-contract.json";

vi.mock("./preview-contracts", () => ({ getPreviewContract: vi.fn() }));
vi.mock("@forms/form-api", () => ({ fetchFormDefinition: vi.fn() }));

import { fetchContract } from "./form-fetcher";
import { getPreviewContract } from "./preview-contracts";
import { fetchFormDefinition } from "@forms/form-api";

const parsedExample = serviceContractSchema.parse(exampleContract);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("fetchContract preview mode", () => {
  it("prefers the bundled preview contract when VITE_PREVIEW_CONTRACTS is set", async () => {
    vi.stubEnv("VITE_PREVIEW_CONTRACTS", "1");
    vi.mocked(getPreviewContract).mockReturnValue(parsedExample);

    const result = await fetchContract("any-form");

    expect(result).toBeDefined();
    expect(getPreviewContract).toHaveBeenCalledWith("any-form");
    expect(fetchFormDefinition).not.toHaveBeenCalled();
  });

  it("falls through to the API when no bundled contract exists", async () => {
    vi.stubEnv("VITE_PREVIEW_CONTRACTS", "1");
    vi.mocked(getPreviewContract).mockReturnValue(undefined);
    vi.mocked(fetchFormDefinition).mockResolvedValue(parsedExample);

    await fetchContract("any-form");

    expect(fetchFormDefinition).toHaveBeenCalledWith(
      "any-form",
      undefined,
      undefined,
    );
  });

  it("ignores preview contracts when the flag is unset", async () => {
    vi.mocked(fetchFormDefinition).mockResolvedValue(parsedExample);

    await fetchContract("any-form");

    expect(getPreviewContract).not.toHaveBeenCalled();
    expect(fetchFormDefinition).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm exec nx run forms:test -- form-fetcher`
Expected: FAIL — preview branch not implemented (first test fails: `fetchFormDefinition` IS called / `getPreviewContract` not called).

- [ ] **Step 4: Wire the preference into `fetchContract`**

In `apps/forms/src/lib/form-builder/form-fetcher.ts`, add the import (below the existing imports at the top):

```ts
import { getPreviewContract } from "./preview-contracts";
```

Then modify the `fetchContract` body — insert the preview-preference block after the `example`/`master` short-circuit and before the `fetchFormDefinition` call:

```ts
export const fetchContract = async (
  id: string,
  preview?: string,
  draft?: string,
): Promise<ClientServiceContract> => {
  if (id === "example" || id === "master") {
    return fetchExampleContract(id);
  }

  // Preview builds (VITE_PREVIEW_CONTRACTS=1) prefer the branch's bundled
  // contract for this form — so both NEW and CHANGED branch forms render from
  // the branch, not a stale sandbox copy. Inert in every normal build.
  if (import.meta.env.VITE_PREVIEW_CONTRACTS) {
    const previewContract = getPreviewContract(id);
    if (previewContract) {
      return mapContractToLocale(previewContract);
    }
  }

  const contract = await fetchFormDefinition(id, preview, draft);

  return mapContractToLocale(contract);
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec nx run forms:test -- form-fetcher`
Expected: PASS (all three tests).

- [ ] **Step 6: Commit**

```bash
git add apps/forms/src/lib/form-builder/preview-contracts.ts apps/forms/src/lib/form-builder/form-fetcher.ts apps/forms/src/lib/form-builder/form-fetcher.spec.ts
git commit -m "feat(forms): prefer bundled preview contract in preview mode"
```

---

### Task 3: Stub submission in preview mode

A branch form doesn't exist on the sandbox API, so a real `POST /submissions` would fail. In preview mode, return a synthetic success so the reviewer reaches the confirmation step. Nothing is persisted.

**Files:**
- Modify: `apps/forms/src/lib/api/forms.ts` (`postFormSubmission`, ~L229-268)
- Test: `apps/forms/src/lib/api/forms.spec.ts` (create if absent; otherwise add a `describe` block)

**Interfaces:**
- Consumes: `FormMeta` (`formId`, `idempotencyKey`), `FormSubmissionResponse`, `formSubmissionResponseBodySchema`.
- Modifies: `postFormSubmission(formMeta, valuesBySteps, previewToken?)` — unchanged signature; short-circuits when the flag is set.

- [ ] **Step 1: Write the failing test**

Create/extend `apps/forms/src/lib/api/forms.spec.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { postFormSubmission } from "./forms";
import type { FormMeta } from "@forms/types";
import { formSubmissionResponseBodySchema } from "../../types/api/form-submission.type";
import { resolveSubmissionOutcome } from "../submission-outcome";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("postFormSubmission preview mode", () => {
  const meta = {
    formId: "some-form",
    idempotencyKey: "idem-123",
  } as unknown as FormMeta;

  it("returns a synthetic success without hitting the network", async () => {
    vi.stubEnv("VITE_PREVIEW_CONTRACTS", "1");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = await postFormSubmission(meta, {});

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res.status).toBe("success");
    const data = formSubmissionResponseBodySchema.parse(res.data);
    expect(data.referenceCode).toBe("PREVIEW-NOT-SAVED");
    // The existing outcome machinery must read it as a green-path success.
    const { subState } = resolveSubmissionOutcome(res);
    expect(subState?.submissionSuccess).toBe(true);
  });

  it("hits the network when the flag is unset", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            status: "success",
            data: {
              id: "x",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
              idempotencyKey: "idem-123",
              formId: "some-form",
              status: "submitted",
              values: {},
              meta: {},
              submittedAt: "2026-01-01T00:00:00.000Z",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    await postFormSubmission(meta, {});

    expect(fetchSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec nx run forms:test -- forms.spec`
Expected: FAIL — first test fails (`fetch` IS called; no `PREVIEW-NOT-SAVED`).

- [ ] **Step 3: Add the stub + guard**

In `apps/forms/src/lib/api/forms.ts`, add a builder above `postFormSubmission`:

```ts
// In preview mode the branch form doesn't exist on the sandbox API, so a real
// POST would fail. Return a synthetic success (clearly-fake reference) so the
// existing resolveSubmissionOutcome → setSubmissionState flow advances to the
// confirmation step. Nothing is persisted.
const buildPreviewSubmissionStub = (
  formId: string,
  idempotencyKey: string,
): FormSubmissionResponse => {
  const now = new Date().toISOString();
  return {
    status: "success",
    data: {
      id: `preview-${idempotencyKey}`,
      createdAt: now,
      updatedAt: now,
      idempotencyKey,
      formId,
      status: "submitted",
      values: {},
      meta: {},
      submittedAt: now,
      referenceCode: "PREVIEW-NOT-SAVED",
    },
  };
};
```

Then add the guard as the first statement inside `postFormSubmission` (before `const endpoint = ...`):

```ts
  if (import.meta.env.VITE_PREVIEW_CONTRACTS) {
    return buildPreviewSubmissionStub(formId, idempotencyKey);
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec nx run forms:test -- forms.spec`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add apps/forms/src/lib/api/forms.ts apps/forms/src/lib/api/forms.spec.ts
git commit -m "feat(forms): stub submission in preview mode"
```

---

### Task 4: CI wiring (Amplify build + PR-preview workflow)

Wire the generator into the Amplify forms build, force a forms preview when a recipe changes, enable the flag branch-scoped, and add direct links to the PR comment. No unit tests — verified by CI behaviour + a local build check.

**Files:**
- Modify: `amplify.yml` (forms `build` phase, ~L89-93)
- Modify: `.github/workflows/pr-preview.yml` (`setup` outputs ~L51-58 & affected step ~L116; `preview-forms` step env ~L168-173 & run block; `comment` render env ~L767-783 & table ~L826)

**Interfaces:**
- Consumes (Tasks 1-3): `pnpm generate:preview-contracts`, `VITE_PREVIEW_CONTRACTS`.
- Produces: `setup` output `preview-recipe-ids` (comma-separated formIds of changed recipes).

- [ ] **Step 1: Local pre-flight — build forms with the flag and confirm the preview path**

```bash
pnpm generate:preview-contracts
VITE_PREVIEW_CONTRACTS=1 pnpm exec nx run forms:build
```

Expected: build succeeds; `apps/forms/dist` is produced. Grep the bundle to confirm a generated contract was inlined (pick a real formId from `apps/forms/contracts/preview/`):

Run: `grep -rl "PREVIEW-NOT-SAVED\|<someFormId>" apps/forms/dist/assets | head`
Expected: at least one bundle chunk matches the formId (the contract was bundled). Then confirm a normal build does **not** bundle them:

Run: `pnpm exec nx run forms:build && grep -rc "\"formId\":\"<someFormId>\"" apps/forms/dist/assets || echo "not bundled (correct)"`
Expected: `not bundled (correct)` — without the flag, the glob is empty.

- [ ] **Step 2: Add the generator to the Amplify forms build**

In `amplify.yml`, in the `apps/forms` `build.commands` (L91-93), insert the conditional generator line **before** `forms:build`. Use whatever prefix Task 1 Step 7 proved necessary (shown here with the safe `registry:build` prefix; drop it if the generator resolved without a build):

```yaml
        build:
          commands:
            - pnpm exec nx run form-types:build
            - pnpm exec nx run form-conditions:build
            - if [ "$VITE_PREVIEW_CONTRACTS" = "1" ]; then pnpm generate:preview-contracts; fi
            - pnpm exec nx run forms:build
```

- [ ] **Step 3: `setup` job — force forms preview on recipe change + emit ids**

In `.github/workflows/pr-preview.yml`, add to the `setup` job `outputs` block (after L52 `forms:` line):

```yaml
      preview-recipe-ids: ${{ steps.affected.outputs.preview-recipe-ids }}
```

Replace the single line at L116 (`echo "forms=$(has forms)" >> "$GITHUB_OUTPUT"`) with:

```bash
          # A recipe JSON lives in apps/api and is NOT a forms nx-dependency, so
          # a PR that only adds/edits a recipe leaves forms "unaffected" and no
          # forms preview would build. Force the forms preview when recipe files
          # change, and emit the changed formIds so preview-forms can enable
          # VITE_PREVIEW_CONTRACTS and the comment can link them.
          CHANGED_RECIPES=$(git diff --name-only "$NX_BASE" "$NX_HEAD" \
            | grep -E '^apps/api/src/forms/form-definitions/recipes/[^/]+\.json$' || true)
          FORMS=$(has forms)
          RECIPE_IDS=""
          if [ -n "$CHANGED_RECIPES" ]; then
            FORMS=true
            RECIPE_IDS=$(echo "$CHANGED_RECIPES" | sed -E 's#.*/##; s#\.json$##' | paste -sd, -)
          fi
          echo "forms=$FORMS" >> "$GITHUB_OUTPUT"
          echo "preview-recipe-ids=$RECIPE_IDS" >> "$GITHUB_OUTPUT"
```

- [ ] **Step 4: `preview-forms` job — enable the flag branch-scoped**

Add to the `Create branch and trigger preview build` step `env` block (after L173 `BRANCH_NAME:`):

```yaml
          PREVIEW_RECIPE_IDS: ${{ needs.setup.outputs.preview-recipe-ids }}
```

In that step's `run:` script, immediately **after** the URL is constructed and written to `$GITHUB_OUTPUT` (the `SUBDOMAIN`/`URL` block ~L191-195) and **before** the cancel-in-flight / `aws amplify start-job` logic, insert:

```bash
          # Enable branch-only recipe previews for this build (Tasks 1-3). Only
          # when recipes changed, so ordinary frontend-only previews keep
          # talking to the sandbox API with real submissions (behaviour
          # preserved). Branch-scoped env var merges with the app-level
          # VITE_API_URL. Mirrors the preview-analytics update-branch pattern.
          if [ -n "$PREVIEW_RECIPE_IDS" ]; then
            aws amplify update-branch \
              --app-id "$AMPLIFY_APP_ID" \
              --branch-name "$BRANCH_NAME" \
              --region "$AWS_REGION" \
              --environment-variables "VITE_PREVIEW_CONTRACTS=1" \
              >/dev/null
            echo "Enabled VITE_PREVIEW_CONTRACTS=1 on $BRANCH_NAME for recipes: $PREVIEW_RECIPE_IDS"
          fi
```

- [ ] **Step 5: `comment` job — append direct form links**

Add to the `Render comment body` step `env` block (after L770 `FORMS_URL:`):

```yaml
          PREVIEW_RECIPE_IDS: ${{ needs.setup.outputs.preview-recipe-ids }}
```

Inside the `{ ... } > comment.md` group, after the analytics `row` line (L826) and before the trailing `echo ""` (L827), insert:

```bash
            if [ -n "$PREVIEW_RECIPE_IDS" ] && [ -n "$FORMS_URL" ]; then
              echo ""
              echo "**Branch form previews** (render + flow only — submissions are not saved):"
              IFS=',' read -ra PREVIEW_IDS <<< "$PREVIEW_RECIPE_IDS"
              for pid in "${PREVIEW_IDS[@]}"; do
                echo "- [\`$pid\`]($FORMS_URL/forms/$pid)"
              done
            fi
```

- [ ] **Step 6: Validate the workflow + amplify YAML**

Run: `pnpm exec prettier --check amplify.yml .github/workflows/pr-preview.yml` (or the repo's YAML check if different)
Expected: no formatting errors. Optionally run `actionlint` if available on the workflow file.

- [ ] **Step 7: Commit**

```bash
git add amplify.yml .github/workflows/pr-preview.yml
git commit -m "ci(forms): build + serve branch recipe previews behind VITE_PREVIEW_CONTRACTS"
```

---

### Task 5: Full build + suite, then PR

- [ ] **Step 1: Build everything (except landing) and run the touched suites**

Run: `pnpm exec nx run-many -t build --exclude=landing`
Expected: all packages compile.

Run: `pnpm exec nx run forms:test && pnpm exec vitest run scripts/generate-preview-contracts.spec.ts`
Expected: PASS.

Run: `pnpm validate-recipes`
Expected: `Validated N recipe file(s). OK.` (unchanged — we didn't touch recipes).

- [ ] **Step 2: Open the PR against `main`**

```bash
git push -u origin preview-branch-recipes-in-forms
gh pr create --base main --title "feat(forms): preview branch-only recipes in PR previews" --body "Implements docs/superpowers/specs/2026-07-23-preview-branch-recipes-in-forms-design.md"
```

- [ ] **Step 3: Verify on the live preview**

On the PR (which must change at least one recipe to exercise the path), confirm the sticky preview comment lists the branch form link(s), open one, and walk the form through to the confirmation screen (reference shows `PREVIEW-NOT-SAVED`). Confirm a form NOT changed in the branch still renders.

---

## Self-Review

**Spec coverage:**
- Component 1 (generator) → Task 1. ✓ (strips `processors`, fails loudly on bad ref, generates all.)
- Component 2 (loader prefers bundled) → Task 2. ✓
- Component 3 (submission short-circuit) → Task 3. ✓
- Component 4 (CI wiring: amplify.yml gen, setup force + ids, preview-forms flag, comment links) → Task 4. ✓
- Decisions (no relocation; API stays authoritative; flag-gated) → honored throughout; generator reads recipes in place, all preview code gated on `VITE_PREVIEW_CONTRACTS`. ✓
- Testing section (generator parity/guard, loader flag on/off, submission stub) → Tasks 1-3 tests. ✓

**Placeholder scan:** `<someFormId>`/`<n>` in Task 1 Step 7 & Task 4 Step 1 are live substitutions the engineer makes from real output, not unfilled specs; all code blocks are complete. No TBD/TODO.

**Type consistency:** `hydrateRecipeForPreview` (Task 1) ↔ used only in its own spec. `getPreviewContract` returns `ServiceContract | undefined` (Task 2 create) ↔ consumed in `form-fetcher.ts` and mocked identically in its spec. `buildPreviewSubmissionStub` returns `FormSubmissionResponse` ↔ matches `postFormSubmission`'s return. `preview-recipe-ids` output name consistent across `setup`, `preview-forms`, `comment`. `VITE_PREVIEW_CONTRACTS` spelled identically in generator gate (amplify.yml), loader, submission, and the `update-branch` call.

**Known integration risk (flagged, not a placeholder):** whether `tsx` resolves `@govtech-bb/registry` in the Amplify build without a prior `registry:build`. Task 1 Step 7 determines the exact command locally; Task 4 Step 2 carries it. The safe `registry:build &&` prefix is included by default.
