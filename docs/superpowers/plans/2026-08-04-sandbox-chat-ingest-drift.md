# Sandbox chat-ingest fix + content-drift guard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the orphaned sandbox chat jobs from gov-bb's `deploy-sandbox.yml` (closes #2149) and add a gov-bb CI content-contract test so a monorepo content change that would break govbb-chatbot's chat ingest fails at PR time, not 15 minutes after merge.

**Architecture:** Two independent changes. (1) A content-contract test under `apps/landing/src/content/` that mirrors govbb-chatbot's raw ingest parser and validates the live corpus; it auto-runs via gov-bb's existing `nx affected` test job when content changes. (2) Deletion of the `amplify-chat` and `deploy-chat-ingest` jobs plus their `chat` wiring in `deploy-sandbox.yml`; govbb-chatbot already owns those jobs post-2026-07-30 cutover.

**Tech Stack:** TypeScript, Vitest (`apps/landing` runs `vitest run`), Nx (`pnpm exec nx test landing`), the `yaml` package (already a dependency), GitHub Actions YAML.

## Global Constraints

- Scope is **sandbox only**. Do NOT edit `deploy-prod.yml` or `deploy-staging.yml` — prod/staging chat still deploy from gov-bb `apps/chat` and are healthy.
- Do NOT pin the ingest tarball or change govbb-chatbot; the per-run `main` fetch is the anti-drift feature.
- Branch is already created: `chore/sandbox-chat-jobs-removal-and-content-contract` off `origin/main`. The design doc is committed at `docs/superpowers/specs/2026-08-04-sandbox-chat-ingest-drift-design.md`.
- Contract source of truth is govbb-chatbot `src/lib/rag/content.ts` (`loadContentDir`) — mirror it, cross-link it in a comment. Keep the mirror minimal (four rules below).
- The four contract rules (verbatim): each `*.md` except `README.md`, recursively, (1) has a `---`-fenced YAML frontmatter block that parses to a mapping; (2) has a non-empty trimmed body; (3) resolves a usable title (frontmatter `title` string, else the path slug); (4) the corpus dir exists and is non-empty.
- Commit messages end with the repo's `Co-Authored-By` trailer.

## File Structure

- `apps/landing/src/content/ingest-contract.ts` — **new.** The mirrored validator: `checkIngestDoc`, `collectIngestViolations`, `countMarkdownDocs`. One responsibility: express govbb-chatbot's ingest contract as pure functions.
- `apps/landing/src/content/ingest-contract.test.ts` — **new.** Unit tests for the validator (positive + negative fixtures) and the live-corpus gate. Sits beside the existing `registry.test.ts`.
- `.github/workflows/deploy-sandbox.yml` — **modify.** Delete the two chat jobs and all `chat` wiring.

---

### Task 1: Content-contract validator + tests (Component 2)

**Files:**
- Create: `apps/landing/src/content/ingest-contract.ts`
- Test: `apps/landing/src/content/ingest-contract.test.ts`

**Interfaces:**
- Produces:
  - `checkIngestDoc(raw: string, sourceId: string, slug: string): IngestViolation[]` — `[]` means the file passes.
  - `collectIngestViolations(dir: string): Promise<IngestViolation[]>` — validates every non-README `*.md` under `dir` (recursive).
  - `countMarkdownDocs(dir: string): Promise<number>`
  - `interface IngestViolation { file: string; reason: string }`

- [ ] **Step 1: Write the failing test**

Create `apps/landing/src/content/ingest-contract.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import {
  checkIngestDoc,
  collectIngestViolations,
  countMarkdownDocs,
} from './ingest-contract'

// The real corpus lives in this same directory.
const CORPUS_DIR = fileURLToPath(new URL('.', import.meta.url))

describe('checkIngestDoc — govbb-chatbot ingest contract', () => {
  it('passes a well-formed page', () => {
    expect(checkIngestDoc('---\ntitle: "A"\n---\nBody text.', 'a', 'a')).toEqual([])
  })

  it('rejects a page with no frontmatter fence', () => {
    const v = checkIngestDoc('just a body, no fence', 'a', 'a')
    expect(v).toHaveLength(1)
    expect(v[0].reason).toMatch(/frontmatter/)
  })

  it('rejects malformed frontmatter YAML', () => {
    const v = checkIngestDoc('---\ntitle: "unterminated\n---\nBody.', 'a', 'a')
    expect(v[0].reason).toMatch(/invalid frontmatter YAML/)
  })

  it('rejects an empty body', () => {
    const v = checkIngestDoc('---\ntitle: A\n---\n   \n', 'a', 'a')
    expect(v[0].reason).toMatch(/empty body/)
  })

  it('falls back to the slug when frontmatter title is absent', () => {
    expect(checkIngestDoc('---\ncategory: x\n---\nBody.', 'a', 'a')).toEqual([])
  })
})

describe('collectIngestViolations — fixture dir', () => {
  it('names the offending file and passes the good one', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'corpus-'))
    try {
      await writeFile(join(dir, 'good.md'), '---\ntitle: Good\n---\nHello.')
      await writeFile(join(dir, 'bad.md'), 'no frontmatter here')
      const v = await collectIngestViolations(dir)
      expect(v).toHaveLength(1)
      expect(v[0].file).toBe('bad')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('the live landing corpus satisfies the chat ingest contract', () => {
  it('has zero contract violations', async () => {
    const violations = await collectIngestViolations(CORPUS_DIR)
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([])
  })

  it('is non-empty at the expected path (guards a corpus move/wipe)', async () => {
    expect(await countMarkdownDocs(CORPUS_DIR)).toBeGreaterThanOrEqual(50)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/landing && pnpm exec vitest run src/content/ingest-contract.test.ts`
Expected: FAIL — `Failed to resolve import "./ingest-contract"` (module does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `apps/landing/src/content/ingest-contract.ts`:

```ts
// The raw contract govbb-chatbot's RAG ingest applies to this corpus.
//
// chat.sandbox.alpha.gov.bb is served by govtech-bb/govbb-chatbot, whose
// ingest fetches gov-bb `main` per run and reads THIS directory
// (apps/landing/src/content) with its own raw parser
// (govbb-chatbot/src/lib/rag/content.ts → loadContentDir). A content change
// here that breaks that parser passes gov-bb CI today and only breaks later,
// in govbb-chatbot's ingest. This mirrors that parser's hard rules so such a
// change fails THIS repo's CI instead. Keep it minimal; if the contract grows,
// promote it to a shared package. Design:
// docs/superpowers/specs/2026-08-04-sandbox-chat-ingest-drift-design.md
import { readdir, readFile } from 'node:fs/promises'
import { join, posix, relative, sep } from 'node:path'
import { parse as parseYaml } from 'yaml'

// Same expression govbb-chatbot uses: frontmatter must open at the file start.
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

export interface IngestViolation {
  file: string
  reason: string
}

async function markdownFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true })
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.md') && e.name !== 'README.md')
    .map((e) => join(e.parentPath, e.name))
}

/** Apply the ingest contract to one file's raw text. `[]` = passes. */
export function checkIngestDoc(
  raw: string,
  sourceId: string,
  slug: string,
): IngestViolation[] {
  const file = sourceId
  const match = FRONTMATTER.exec(raw)
  if (!match) {
    return [{ file, reason: 'no --- fenced frontmatter block at file start' }]
  }
  let meta: unknown
  try {
    meta = parseYaml(match[1])
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return [{ file, reason: `invalid frontmatter YAML: ${message}` }]
  }
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return [{ file, reason: 'frontmatter is not a YAML mapping' }]
  }
  const body = raw.slice(match[0].length).trim()
  if (!body) {
    return [{ file, reason: 'empty body — chat ingest would drop this page' }]
  }
  const title = (meta as Record<string, unknown>).title
  const resolved = typeof title === 'string' && title ? title : slug
  if (!resolved) {
    return [{ file, reason: 'no usable title (frontmatter title missing and slug empty)' }]
  }
  return []
}

/** Validate every non-README markdown page under `dir` (recursive). */
export async function collectIngestViolations(
  dir: string,
): Promise<IngestViolation[]> {
  const files = await markdownFiles(dir)
  const violations: IngestViolation[] = []
  for (const file of files.sort()) {
    const sourceId = relative(dir, file)
      .split(sep)
      .join(posix.sep)
      .replace(/\.md$/, '')
    const slug = sourceId.replace(/\/index$/, '')
    violations.push(...checkIngestDoc(await readFile(file, 'utf8'), sourceId, slug))
  }
  return violations
}

export async function countMarkdownDocs(dir: string): Promise<number> {
  return (await markdownFiles(dir)).length
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/landing && pnpm exec vitest run src/content/ingest-contract.test.ts`
Expected: PASS — all cases green, including the live-corpus case (verified: 101 files, 0 violations).

- [ ] **Step 5: Run lint/typecheck for the new files**

Run: `pnpm exec nx lint landing && pnpm exec nx typecheck landing`
Expected: PASS (no unused imports, types resolve).

- [ ] **Step 6: Commit**

```bash
git add apps/landing/src/content/ingest-contract.ts apps/landing/src/content/ingest-contract.test.ts
git commit -m "$(printf 'test(landing): gate content against govbb-chatbot ingest contract\n\nFail gov-bb CI when a content page would break chat ingest (malformed\nfrontmatter, empty body, unusable title, or a moved/empty corpus) instead\nof silently breaking govbb-chatbot ingest 15 min after merge. Refs #2149.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 2: Remove orphaned sandbox chat jobs (Component 1, closes #2149)

**Files:**
- Modify: `.github/workflows/deploy-sandbox.yml`

**Interfaces:**
- Consumes: nothing from Task 1 (independent).
- Produces: a `deploy-sandbox.yml` with no `chat` job or output references.

- [ ] **Step 1: Delete the two chat job blocks**

In `.github/workflows/deploy-sandbox.yml`, delete these whole job blocks (each runs from its `  <job>:` line up to the line before the next top-level `  <job>:`):
- `amplify-chat:` (the "Amplify build (chat)" job).
- `deploy-chat-ingest:` (the "Build, Push & Trigger chat-ingest" job).

- [ ] **Step 2: Remove the `chat` affected output from `setup`**

In the `setup` job, delete the output declaration line:
```yaml
      chat: ${{ steps.affected.outputs.chat }}
```
and, in the "Compute affected deploy targets" step, delete the line:
```bash
          echo "chat=$(has chat)" >> "$GITHUB_OUTPUT"
```

- [ ] **Step 3: Remove `chat` from downstream `needs` and the summary**

- In every `needs: [ ... ]` list that includes them, remove `amplify-chat` and `deploy-chat-ingest` (the `summary` job and the two Slack-notify jobs reference both).
- In the `summary` job's env, delete `CHAT_RESULT:` and `CHAT_INGEST_RESULT:`.
- In the summary step's heredoc, delete the two table rows that print `Amplify chat` and `chat-ingest image`, and delete the `**Chat URL:** https://chat.sandbox.alpha.gov.bb` line.

- [ ] **Step 4: Verify no dangling chat references remain**

Run:
```bash
grep -nE 'amplify-chat|deploy-chat-ingest|CHAT_RESULT|CHAT_INGEST_RESULT|outputs\.chat|steps\.affected\.outputs\.chat' .github/workflows/deploy-sandbox.yml
```
Expected: **no output** (exit 1). Any hit is a dangling reference — fix it. (Note: `has chat` is gone; unrelated substrings like a `chat.sandbox` URL should no longer exist either.)

- [ ] **Step 5: Verify the workflow still parses as valid YAML**

Run:
```bash
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/deploy-sandbox.yml')); print('YAML OK')"
```
Expected: `YAML OK`. If `actionlint` is installed, also run `actionlint .github/workflows/deploy-sandbox.yml` and expect no errors.

- [ ] **Step 6: Sanity-check the remaining job graph**

Run:
```bash
grep -nE '^  [a-z][a-zA-Z-]*:' .github/workflows/deploy-sandbox.yml
```
Expected: the job list no longer contains `amplify-chat` or `deploy-chat-ingest`; all other jobs (setup, deploy-api, amplify-forms, amplify-landing, amplify-analytics, form-builder jobs, feature-flagging, summary, promote-to-staging, notify jobs) are still present.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/deploy-sandbox.yml
git commit -m "$(printf 'ci(sandbox): drop orphaned chat jobs; chat deploys from its own repo now\n\nSince the 2026-07-30 cutover, chat.sandbox.alpha.gov.bb is built and\ningested by govtech-bb/govbb-chatbot. gov-bb deploy-chat-ingest triggered\nan ingest but then verified against that repo-owned /api/health, so it\ntimed out and red-X'"'"'d every chat-affected sandbox deploy (skipping\npromote-to-staging). amplify-chat merely RELEASE-built govbb-chatbot'"'"'s\napp. Remove both and their chat wiring.\n\nCloses #2149.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 3: Open the PR and verify end-to-end

**Files:** none (git/PR operations).

- [ ] **Step 1: Push the branch**

```bash
git push -u origin chore/sandbox-chat-jobs-removal-and-content-contract
```

- [ ] **Step 2: Open the PR (base `main`)**

```bash
gh pr create --repo govtech-bb/gov-bb --base main \
  --title "Fix sandbox chat-ingest failure + guard content drift (closes #2149)" \
  --body "$(cat <<'BODY'
## Why
Since the 2026-07-30 cutover, `chat.sandbox.alpha.gov.bb` deploys and ingests from `govtech-bb/govbb-chatbot`. gov-bb's leftover `deploy-chat-ingest` job triggered an ingest but verified against that repo-owned `/api/health`, so it timed out and failed **every** chat-affected sandbox deploy — which also skipped `Promote to staging`. `amplify-chat` only RELEASE-built govbb-chatbot's app.

## What
- Remove `amplify-chat` + `deploy-chat-ingest` and their `chat` wiring from `deploy-sandbox.yml` (**closes #2149**). Sandbox only — prod/staging chat still deploy from `apps/chat` and are untouched.
- Add a gov-bb CI content-contract test (`apps/landing/src/content/ingest-contract.*`) mirroring govbb-chatbot's raw ingest parser, so a content change that would break chat ingest fails **here** at PR time instead of 15 min after merge. Content data is already single-sourced from `main` via govbb-chatbot's per-run tarball fetch; this closes the residual shape/path drift.

Design: `docs/superpowers/specs/2026-08-04-sandbox-chat-ingest-drift-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

- [ ] **Step 3: Confirm CI is green on the PR**

Run: `gh pr checks --repo govtech-bb/gov-bb <pr-number> --watch`
Expected: the `test` job runs the new `ingest-contract` test (nx marks `landing` affected) and passes; no chat jobs run on the PR.

- [ ] **Step 4: After merge, verify the sandbox deploy**

Once merged to `main`, the Deploy Sandbox run for the merge must be green with **no** `deploy-chat-ingest`/`amplify-chat` jobs, and `Promote to staging (on sandbox green)` must execute (no longer skipped). Chat itself stays served by govbb-chatbot — confirm:
```bash
curl -s https://chat.sandbox.alpha.gov.bb/api/health | jq '{db, docCount}'
```
Expected: `{"db":"connected","docCount":<n>}`.

---

## Self-Review

**Spec coverage:**
- Component 1 (remove orphaned jobs, sandbox-only, closes #2149) → Task 2. ✓
- Component 2 (content-contract gate in gov-bb CI mirroring govbb-chatbot) → Task 1. ✓
- Non-goals (no prod/staging edits, no tarball pin, no ingest move) → Global Constraints + Task 2 scoped to `deploy-sandbox.yml`. ✓
- Verification (Component 1 green deploy + promote; Component 2 negative fixture fails, real corpus passes) → Task 1 Steps 2/4 (fixture + corpus) and Task 3 Steps 3/4. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"; all steps carry real code or exact commands. ✓

**Type consistency:** `checkIngestDoc`/`collectIngestViolations`/`countMarkdownDocs`/`IngestViolation` are named identically in the implementation, the test, and the Interfaces block. The test's `CORPUS_DIR` uses `fileURLToPath(new URL('.', import.meta.url))`; the implementation takes `dir: string`. ✓
