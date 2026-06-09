# Form-builder PDF → Textract converter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inline base64 PDF upload path with an S3 + async Textract flow. Lift the upload ceiling from 4 MB to 20 MB, eliminate the "Invariant failed" 413, and cut AI step cost/latency by feeding Bedrock extracted text instead of raw PDF bytes.

**Architecture:** Browser → presigned S3 PUT → API starts Textract `AnalyzeDocument` (async) → client polls status; on `SUCCEEDED`, the polling handler converts Textract's block graph to compact text and feeds *that* to Bedrock (instead of a `document` block). The full design is in `docs/superpowers/specs/2026-06-09-form-builder-pdf-textract-converter-design.md` — keep that open while implementing.

**Tech Stack:** TypeScript, Express, AWS SDK v3 (`@aws-sdk/client-textract`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`), React + TanStack Start, jest, Terraform/OpenTofu (sandbox IaC in `alpha-infra`).

**Repos touched:**
- `govtech-bb/alpha-infra` (Phase 1 only — infra prerequisites)
- `govtech-bb/gov-bb` (Phases 2–4 — app code)

**Branch:** `feat/form-builder-pdf-textract-converter` (already created off `sandbox` in `gov-bb`). For `alpha-infra`, use a parallel branch `feat/form-builder-uploads-bucket` (off `main`).

---

## Phase 1 — Infrastructure (`alpha-infra` repo)

> The bucket `form-builder-uploads-sandbox-7922` already exists (CLI-managed) with public-access-block, SSE-S3, CORS for the form_builder Amplify origin, a 7-day lifecycle, HTTPS-only policy, and versioning. The existing IAM policy `aws_iam_role_policy.ecs_task_form_builder_uploads` in `environments/sandbox/modular-forms-sandbox/form-builder-s3.tf` already grants the form_builder_api ECS task role `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`, `s3:ListBucket` on the bucket. The ECS task already has `S3_BUCKET` and `S3_REGION` env vars wired.
>
> **All that's missing is the Textract IAM grant.** This phase is a single-file change to `form-builder-s3.tf`, then commit, push, PR. The PR is small, additive, and zero-disruption.

### Task 1: Add Textract IAM grant for form_builder_api

**Files:**
- Modify: `environments/sandbox/modular-forms-sandbox/form-builder-s3.tf`

- [ ] **Step 1: Confirm the existing policy resource shape**

Run: `grep -B 2 -A 30 "ecs_task_form_builder_uploads" environments/sandbox/modular-forms-sandbox/form-builder-s3.tf`
Expected: a single `aws_iam_role_policy.ecs_task_form_builder_uploads` resource with two statements (S3 read/write + ListBucket). This is what gets extended.

- [ ] **Step 2: Add a sibling Textract policy**

In `environments/sandbox/modular-forms-sandbox/form-builder-s3.tf`, right after the closing brace of `aws_iam_role_policy.ecs_task_form_builder_uploads`, add a new sibling resource:

```hcl
# -----------------------------------------------------------------------------
# Textract IAM — form_builder_api uses async AnalyzeDocument to extract form
# structure from uploaded PDFs (replaces the prior Bedrock-document-block path,
# which capped uploads at 4 MB due to the Amplify SSR Lambda body limit). See
# gov-bb docs/superpowers/specs/2026-06-09-form-builder-pdf-textract-converter-design.md.
# Textract does not support resource-level perms — it's an account-wide grant.
# -----------------------------------------------------------------------------
resource "aws_iam_role_policy" "ecs_task_textract" {
  name = "form-builder-ecs-textract"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "FormBuilderTextractAnalyseDocument"
        Effect = "Allow"
        Action = [
          "textract:StartDocumentAnalysis",
          "textract:GetDocumentAnalysis",
        ]
        Resource = "*"
      },
    ]
  })
}
```

- [ ] **Step 3: Validate locally**

From `environments/sandbox/modular-forms-sandbox/`:
```bash
tofu init -upgrade
tofu validate
tofu plan -no-color | head -40
```
Expected: `Success! The configuration is valid.` and a plan showing **1 resource to add** (`aws_iam_role_policy.ecs_task_textract`), no resources to change or destroy.

- [ ] **Step 4: Create branch, commit, push, open PR**

```bash
git checkout main && git pull
git checkout -b feat/form-builder-textract-iam
git add environments/sandbox/modular-forms-sandbox/form-builder-s3.tf
git commit -m "feat(modular-forms-sandbox): add Textract IAM grant for form_builder_api

Adds aws_iam_role_policy.ecs_task_textract granting
textract:StartDocumentAnalysis + textract:GetDocumentAnalysis to the
form_builder_api ECS task role. Required for the new async PDF
converter (gov-bb spec
2026-06-09-form-builder-pdf-textract-converter-design.md) which calls
Textract from S3 instead of forwarding raw PDFs to Bedrock.

The pre-existing form-builder-uploads-sandbox-7922 bucket and its S3
IAM grants are unchanged."
git push -u origin feat/form-builder-textract-iam
gh pr create --base main \
  --title "feat(modular-forms-sandbox): Textract IAM grant for form_builder_api" \
  --body "Adds Textract perms for the form_builder_api ECS task role. Single-resource, additive change. Required by the gov-bb PDF → Textract converter feature; the bucket + S3 IAM are already in place from the prior session-based design.

Spec: gov-bb/docs/superpowers/specs/2026-06-09-form-builder-pdf-textract-converter-design.md"
```

After merge + apply, confirm the policy is attached:
```bash
aws iam list-role-policies --role-name <ecs_task_role_name> --profile <sandbox-profile>
```
Expected: includes `form-builder-ecs-textract`. **Phase 1 complete.**

---

## Phase 2 — `form_builder_api` server (`gov-bb` repo)

> All Phase 2 work happens on branch `feat/form-builder-pdf-textract-converter` (already created off `sandbox`). Use **pnpm** for everything; never `npm` (per repo CLAUDE.md).

### Task 2: Install AWS SDK Textract + S3 presigner deps

**Files:**
- Modify: `apps/form_builder_api/package.json`

- [ ] **Step 1: Install the three new deps**

Run from repo root:
```bash
pnpm add --filter @govtech-bb/form-builder-api @aws-sdk/client-textract @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```
Expected: `package.json` and `pnpm-lock.yaml` updated; three new entries under `"dependencies"`. Version range should match the existing `@aws-sdk/client-bedrock-runtime` major (`^3.700.0` or later).

- [ ] **Step 2: Verify the API still builds**

Run: `pnpm exec nx run form_builder_api:build`
Expected: clean tsc + tsc-alias output, no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/form_builder_api/package.json pnpm-lock.yaml
git commit -m "chore(form_builder_api): add Textract + S3 presigner deps"
```

---

### Task 3: Implement `blocksToText` (pure function, TDD)

**Files:**
- Create: `apps/form_builder_api/src/ai/textract.ts` (starter — only the `blocksToText` export for now)
- Create: `apps/form_builder_api/src/ai/textract.spec.ts`
- Create: `apps/form_builder_api/src/ai/__fixtures__/textract/simple-form.json`
- Create: `apps/form_builder_api/src/ai/__fixtures__/textract/checkboxes.json`
- Create: `apps/form_builder_api/src/ai/__fixtures__/textract/multi-page.json`
- Create: `apps/form_builder_api/src/ai/__fixtures__/textract/empty.json`

This is the heart of the change — fully testable in isolation with hand-crafted minimal fixtures based on Textract's documented block schema (https://docs.aws.amazon.com/textract/latest/dg/API_Block.html).

- [ ] **Step 1: Create a minimal "simple form" Textract fixture**

Create `apps/form_builder_api/src/ai/__fixtures__/textract/simple-form.json`:

```json
{
  "Blocks": [
    {
      "BlockType": "PAGE",
      "Id": "page-1",
      "Page": 1,
      "Relationships": [
        { "Type": "CHILD", "Ids": ["line-1", "kv-key-1", "kv-key-2"] }
      ]
    },
    {
      "BlockType": "LINE",
      "Id": "line-1",
      "Page": 1,
      "Text": "Personal Details"
    },
    {
      "BlockType": "KEY_VALUE_SET",
      "EntityTypes": ["KEY"],
      "Id": "kv-key-1",
      "Page": 1,
      "Relationships": [
        { "Type": "CHILD", "Ids": ["word-name"] },
        { "Type": "VALUE", "Ids": ["kv-val-1"] }
      ]
    },
    { "BlockType": "WORD", "Id": "word-name", "Text": "Name:" },
    {
      "BlockType": "KEY_VALUE_SET",
      "EntityTypes": ["VALUE"],
      "Id": "kv-val-1",
      "Page": 1
    },
    {
      "BlockType": "KEY_VALUE_SET",
      "EntityTypes": ["KEY"],
      "Id": "kv-key-2",
      "Page": 1,
      "Relationships": [
        { "Type": "CHILD", "Ids": ["word-dob"] },
        { "Type": "VALUE", "Ids": ["kv-val-2"] }
      ]
    },
    { "BlockType": "WORD", "Id": "word-dob", "Text": "Date of Birth:" },
    {
      "BlockType": "KEY_VALUE_SET",
      "EntityTypes": ["VALUE"],
      "Id": "kv-val-2",
      "Page": 1
    }
  ]
}
```

- [ ] **Step 2: Create the checkboxes fixture**

Create `apps/form_builder_api/src/ai/__fixtures__/textract/checkboxes.json`:

```json
{
  "Blocks": [
    {
      "BlockType": "PAGE",
      "Id": "page-1",
      "Page": 1,
      "Relationships": [
        { "Type": "CHILD", "Ids": ["line-label", "sel-1", "sel-2", "line-1", "line-2"] }
      ]
    },
    { "BlockType": "LINE", "Id": "line-label", "Page": 1, "Text": "Marital Status:" },
    { "BlockType": "SELECTION_ELEMENT", "Id": "sel-1", "Page": 1, "SelectionStatus": "SELECTED" },
    { "BlockType": "LINE", "Id": "line-1", "Page": 1, "Text": "Single" },
    { "BlockType": "SELECTION_ELEMENT", "Id": "sel-2", "Page": 1, "SelectionStatus": "NOT_SELECTED" },
    { "BlockType": "LINE", "Id": "line-2", "Page": 1, "Text": "Married" }
  ]
}
```

- [ ] **Step 3: Create the multi-page fixture**

Create `apps/form_builder_api/src/ai/__fixtures__/textract/multi-page.json`:

```json
{
  "Blocks": [
    { "BlockType": "PAGE", "Id": "page-1", "Page": 1, "Relationships": [{ "Type": "CHILD", "Ids": ["l-1"] }] },
    { "BlockType": "LINE", "Id": "l-1", "Page": 1, "Text": "Page one text" },
    { "BlockType": "PAGE", "Id": "page-2", "Page": 2, "Relationships": [{ "Type": "CHILD", "Ids": ["l-2"] }] },
    { "BlockType": "LINE", "Id": "l-2", "Page": 2, "Text": "Page two text" }
  ]
}
```

- [ ] **Step 4: Create the empty fixture**

Create `apps/form_builder_api/src/ai/__fixtures__/textract/empty.json`:

```json
{ "Blocks": [] }
```

- [ ] **Step 5: Write the failing test**

Create `apps/form_builder_api/src/ai/textract.spec.ts`:

```ts
import type { Block } from "@aws-sdk/client-textract";
import { blocksToText } from "./textract";
import simpleForm from "./__fixtures__/textract/simple-form.json";
import checkboxes from "./__fixtures__/textract/checkboxes.json";
import multiPage from "./__fixtures__/textract/multi-page.json";
import empty from "./__fixtures__/textract/empty.json";

const blocksOf = (f: { Blocks: unknown[] }) => f.Blocks as Block[];

describe("blocksToText", () => {
  it("returns empty string for an empty block array", () => {
    expect(blocksToText(blocksOf(empty))).toBe("");
  });

  it("renders a simple page with KEY_VALUE_SET fields as labelled placeholders", () => {
    const out = blocksToText(blocksOf(simpleForm));
    expect(out).toContain("## Page 1");
    expect(out).toContain("Personal Details");
    expect(out).toMatch(/Name:\s+_+/);
    expect(out).toMatch(/Date of Birth:\s+_+/);
  });

  it("renders SELECTION_ELEMENT blocks as [x] / [ ] with adjacent label text", () => {
    const out = blocksToText(blocksOf(checkboxes));
    expect(out).toContain("Marital Status:");
    expect(out).toMatch(/\[x\]\s+Single/);
    expect(out).toMatch(/\[ \]\s+Married/);
  });

  it("emits a page marker for each PAGE block", () => {
    const out = blocksToText(blocksOf(multiPage));
    expect(out).toContain("## Page 1");
    expect(out).toContain("## Page 2");
    expect(out.indexOf("## Page 1")).toBeLessThan(out.indexOf("## Page 2"));
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm exec nx run form_builder_api:test -- --testPathPattern=textract.spec`
Expected: FAIL with `Cannot find module './textract'`.

- [ ] **Step 7: Implement `blocksToText`**

Create `apps/form_builder_api/src/ai/textract.ts`:

```ts
import type { Block } from "@aws-sdk/client-textract";

// blocksToText walks Textract's block graph and emits a compact text
// representation Claude can read. It preserves page boundaries, key/value
// labels, checkbox state, and ordering — enough structure for the form-builder
// recipe model to reconstruct the form. The output format is internal only;
// nothing parses it downstream.
export function blocksToText(blocks: Block[]): string {
  if (!blocks.length) return "";
  const byId = new Map<string, Block>(blocks.map((b) => [b.Id ?? "", b]));
  const pages = blocks.filter((b) => b.BlockType === "PAGE");
  const out: string[] = [];

  for (const page of pages) {
    out.push(`## Page ${page.Page ?? "?"}`);
    out.push("");

    const childIds = page.Relationships?.find((r) => r.Type === "CHILD")?.Ids ?? [];
    for (const childId of childIds) {
      const child = byId.get(childId);
      if (!child) continue;

      if (child.BlockType === "LINE" && child.Text) {
        out.push(child.Text);
      } else if (child.BlockType === "KEY_VALUE_SET" && child.EntityTypes?.includes("KEY")) {
        const label = collectWords(child, byId);
        out.push(`${label} ${"_".repeat(30)}`);
      } else if (child.BlockType === "SELECTION_ELEMENT") {
        const mark = child.SelectionStatus === "SELECTED" ? "[x]" : "[ ]";
        out.push(`${mark} ${labelAfter(childId, childIds, byId)}`);
      }
    }
    out.push("");
  }

  return out.join("\n").trim();
}

function collectWords(parent: Block, byId: Map<string, Block>): string {
  const childIds = parent.Relationships?.find((r) => r.Type === "CHILD")?.Ids ?? [];
  return childIds
    .map((id) => byId.get(id)?.Text ?? "")
    .filter(Boolean)
    .join(" ");
}

// Selection elements don't carry their own label; the convention is the
// adjacent LINE that follows them in reading order. We look at the page's
// child order to find the next LINE after this selection.
function labelAfter(selId: string, siblingIds: string[], byId: Map<string, Block>): string {
  const idx = siblingIds.indexOf(selId);
  if (idx < 0) return "";
  for (let i = idx + 1; i < siblingIds.length; i++) {
    const next = byId.get(siblingIds[i]);
    if (next?.BlockType === "LINE" && next.Text) return next.Text;
    if (next?.BlockType === "SELECTION_ELEMENT") break;
  }
  return "";
}
```

- [ ] **Step 8: Verify the tests pass**

Run: `pnpm exec nx run form_builder_api:test -- --testPathPattern=textract.spec`
Expected: PASS (4 tests).

- [ ] **Step 9: Commit**

```bash
git add apps/form_builder_api/src/ai/textract.ts apps/form_builder_api/src/ai/textract.spec.ts apps/form_builder_api/src/ai/__fixtures__
git commit -m "feat(form_builder_api): add Textract blocks → text converter

Pure function blocksToText() converts Textract's block graph into a
compact text representation (page markers, KEY_VALUE_SET fields as
labelled placeholders, SELECTION_ELEMENT as [x]/[ ] with adjacent
label). Fixtures cover simple form, checkboxes, multi-page, empty."
```

---

### Task 4: Implement `s3-uploads.ts` presign helper

**Files:**
- Create: `apps/form_builder_api/src/storage/s3-uploads.ts`
- Create: `apps/form_builder_api/src/storage/s3-uploads.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/form_builder_api/src/storage/s3-uploads.spec.ts`:

```ts
jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: jest.fn().mockResolvedValue("https://signed.example/put"),
}));
jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn(),
  PutObjectCommand: jest.fn().mockImplementation((args) => ({ args })),
}));

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { presignUpload } from "./s3-uploads";

const getSignedUrlMock = getSignedUrl as jest.Mock;
const PutObjectCommandMock = PutObjectCommand as unknown as jest.Mock;

describe("presignUpload", () => {
  beforeEach(() => {
    getSignedUrlMock.mockClear();
    PutObjectCommandMock.mockClear();
    process.env.S3_BUCKET = "form-builder-uploads-sandbox-7922";
  });

  it("returns a url and an uploads/<uuid>.pdf key", async () => {
    const result = await presignUpload();
    expect(result.url).toBe("https://signed.example/put");
    expect(result.s3Key).toMatch(/^uploads\/[0-9a-f-]{36}\.pdf$/);
  });

  it("signs a PutObjectCommand with the configured bucket and pdf content type", async () => {
    await presignUpload();
    expect(PutObjectCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: "form-builder-uploads-sandbox-7922",
        ContentType: "application/pdf",
      }),
    );
  });

  it("uses a 5-minute TTL on the signed URL", async () => {
    await presignUpload();
    expect(getSignedUrlMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ expiresIn: 300 }),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec nx run form_builder_api:test -- --testPathPattern=s3-uploads.spec`
Expected: FAIL with `Cannot find module './s3-uploads'`.

- [ ] **Step 3: Implement `presignUpload`**

Create `apps/form_builder_api/src/storage/s3-uploads.ts`:

```ts
import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      region: process.env.AWS_REGION ?? "ca-central-1",
    });
  }
  return client;
}

// presignUpload returns a one-shot 5-minute PUT URL for uploads/<uuid>.pdf in
// the form-builder uploads bucket. Browser uploads directly via this URL,
// bypassing the Amplify SSR Lambda's 6 MB body cap.
export async function presignUpload(): Promise<{ url: string; s3Key: string }> {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) {
    throw new Error("S3_BUCKET is not set");
  }
  const s3Key = `uploads/${randomUUID()}.pdf`;
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: s3Key,
    ContentType: "application/pdf",
  });
  const url = await getSignedUrl(getClient(), command, { expiresIn: 300 });
  return { url, s3Key };
}
```

- [ ] **Step 4: Verify the tests pass**

Run: `pnpm exec nx run form_builder_api:test -- --testPathPattern=s3-uploads.spec`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/form_builder_api/src/storage/
git commit -m "feat(form_builder_api): add S3 presigned PUT helper

presignUpload() returns a 5-minute PUT URL for uploads/<uuid>.pdf in
the form-builder uploads bucket. Browser uploads directly via this
URL, bypassing the Amplify SSR Lambda body cap."
```

---

### Task 5: Add Textract `startAnalysis` + `getAnalysisResult` to `textract.ts`

**Files:**
- Modify: `apps/form_builder_api/src/ai/textract.ts`
- Modify: `apps/form_builder_api/src/ai/textract.spec.ts`

- [ ] **Step 1: Extend the failing test**

Append to `apps/form_builder_api/src/ai/textract.spec.ts` (above the existing `describe`):

```ts
import { startAnalysis, getAnalysisResult } from "./textract";

const sendMock = jest.fn();
jest.mock("@aws-sdk/client-textract", () => {
  return {
    TextractClient: jest.fn().mockImplementation(() => ({ send: (...args: unknown[]) => sendMock(...args) })),
    StartDocumentAnalysisCommand: jest.fn().mockImplementation((args) => ({ name: "Start", args })),
    GetDocumentAnalysisCommand: jest.fn().mockImplementation((args) => ({ name: "Get", args })),
  };
});

beforeEach(() => {
  sendMock.mockReset();
  process.env.S3_BUCKET = "modular-forms-sandbox-form-builder-uploads";
});

describe("startAnalysis", () => {
  it("returns the JobId from StartDocumentAnalysis", async () => {
    sendMock.mockResolvedValue({ JobId: "job-abc" });
    const result = await startAnalysis("uploads/abc.pdf");
    expect(result.jobId).toBe("job-abc");
  });

  it("requests FORMS and TABLES features", async () => {
    sendMock.mockResolvedValue({ JobId: "job-abc" });
    await startAnalysis("uploads/abc.pdf");
    const cmd = sendMock.mock.calls[0][0];
    expect(cmd.name).toBe("Start");
    expect(cmd.args.FeatureTypes).toEqual(["FORMS", "TABLES"]);
    expect(cmd.args.DocumentLocation.S3Object.Name).toBe("uploads/abc.pdf");
  });
});

describe("getAnalysisResult", () => {
  it("returns status 'processing' when Textract is IN_PROGRESS", async () => {
    sendMock.mockResolvedValue({ JobStatus: "IN_PROGRESS" });
    const result = await getAnalysisResult("job-1");
    expect(result.status).toBe("processing");
  });

  it("returns status 'done' with flat blocks when SUCCEEDED", async () => {
    sendMock.mockResolvedValue({
      JobStatus: "SUCCEEDED",
      Blocks: [{ BlockType: "PAGE", Id: "p1", Page: 1 }],
    });
    const result = await getAnalysisResult("job-1");
    expect(result.status).toBe("done");
    expect(result.blocks).toHaveLength(1);
  });

  it("follows NextToken pagination and concatenates blocks", async () => {
    sendMock
      .mockResolvedValueOnce({
        JobStatus: "SUCCEEDED",
        Blocks: [{ BlockType: "PAGE", Id: "p1", Page: 1 }],
        NextToken: "tok-1",
      })
      .mockResolvedValueOnce({
        JobStatus: "SUCCEEDED",
        Blocks: [{ BlockType: "LINE", Id: "l1", Page: 1, Text: "hello" }],
      });
    const result = await getAnalysisResult("job-1");
    expect(result.status).toBe("done");
    expect(result.blocks).toHaveLength(2);
  });

  it("returns status 'failed' with reason when FAILED", async () => {
    sendMock.mockResolvedValue({
      JobStatus: "FAILED",
      StatusMessage: "Document is password-protected",
    });
    const result = await getAnalysisResult("job-1");
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("Document is password-protected");
  });

  it("treats PARTIAL_SUCCESS as failed", async () => {
    sendMock.mockResolvedValue({ JobStatus: "PARTIAL_SUCCESS" });
    const result = await getAnalysisResult("job-1");
    expect(result.status).toBe("failed");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec nx run form_builder_api:test -- --testPathPattern=textract.spec`
Expected: FAIL — `startAnalysis` and `getAnalysisResult` are not yet exported.

- [ ] **Step 3: Implement `startAnalysis` and `getAnalysisResult`**

Replace the top of `apps/form_builder_api/src/ai/textract.ts` (keep `blocksToText` and its helpers at the bottom):

```ts
import {
  TextractClient,
  StartDocumentAnalysisCommand,
  GetDocumentAnalysisCommand,
  type Block,
} from "@aws-sdk/client-textract";

let client: TextractClient | null = null;

function getClient(): TextractClient {
  if (!client) {
    client = new TextractClient({
      region: process.env.AWS_REGION ?? "ca-central-1",
    });
  }
  return client;
}

// startAnalysis kicks off an async Textract job against an S3 object. The
// caller polls getAnalysisResult with the returned jobId until status !==
// "processing". We always request FORMS + TABLES — both are useful for the
// form-builder use case, and Textract bills per page regardless of feature set.
export async function startAnalysis(s3Key: string): Promise<{ jobId: string }> {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("S3_BUCKET is not set");

  const response = await getClient().send(
    new StartDocumentAnalysisCommand({
      DocumentLocation: { S3Object: { Bucket: bucket, Name: s3Key } },
      FeatureTypes: ["FORMS", "TABLES"],
    }),
  );
  if (!response.JobId) throw new Error("Textract did not return a JobId");
  return { jobId: response.JobId };
}

export type AnalysisResult =
  | { status: "processing" }
  | { status: "done"; blocks: Block[] }
  | { status: "failed"; reason?: string };

// getAnalysisResult polls Textract once. On SUCCEEDED it walks the NextToken
// pagination internally and returns a flat block array; the caller sees one
// merged result.
export async function getAnalysisResult(jobId: string): Promise<AnalysisResult> {
  const blocks: Block[] = [];
  let nextToken: string | undefined;
  let firstStatus: string | undefined;
  let lastMessage: string | undefined;

  do {
    const response = await getClient().send(
      new GetDocumentAnalysisCommand({ JobId: jobId, NextToken: nextToken }),
    );
    firstStatus = firstStatus ?? response.JobStatus;
    lastMessage = response.StatusMessage ?? lastMessage;

    if (response.JobStatus === "IN_PROGRESS") return { status: "processing" };
    if (response.JobStatus === "FAILED" || response.JobStatus === "PARTIAL_SUCCESS") {
      return { status: "failed", reason: response.StatusMessage };
    }
    if (response.Blocks) blocks.push(...response.Blocks);
    nextToken = response.NextToken;
  } while (nextToken);

  return { status: "done", blocks };
}
```

(Keep the existing `blocksToText` + helpers below this block; replace only the imports section at the top of the file. Remove the now-duplicate `Block` import if you re-imported it.)

- [ ] **Step 4: Verify all `textract.spec.ts` tests pass**

Run: `pnpm exec nx run form_builder_api:test -- --testPathPattern=textract.spec`
Expected: PASS (all tests — 4 from Task 3 + 7 new = 11).

- [ ] **Step 5: Commit**

```bash
git add apps/form_builder_api/src/ai/textract.ts apps/form_builder_api/src/ai/textract.spec.ts
git commit -m "feat(form_builder_api): add async Textract wrappers

startAnalysis(s3Key) kicks off StartDocumentAnalysis with FORMS+TABLES
features. getAnalysisResult(jobId) polls GetDocumentAnalysis, follows
NextToken pagination, and maps Textract's JobStatus to
processing/done/failed (PARTIAL_SUCCESS treated as failed)."
```

---

### Task 6: Update `chat()` signature — `pdfPages` → `documentText`

**Files:**
- Modify: `apps/form_builder_api/src/ai/client.ts`

There is no dedicated `client.spec.ts` today (the existing convert spec mocks `chat()` wholesale). We update the signature and rely on the route-level tests to cover behaviour.

- [ ] **Step 1: Replace the chat() implementation**

Replace the body of `apps/form_builder_api/src/ai/client.ts` after the imports with:

```ts
let client: BedrockRuntimeClient | null = null;
let modelId = "global.anthropic.claude-haiku-4-5-20251001-v1:0";

export async function ensureInitialised(): Promise<void> {
  if (client) return;
  modelId = process.env.AI_MODEL ?? modelId;
  client = new BedrockRuntimeClient({
    region:
      process.env.BEDROCK_REGION ?? process.env.AWS_REGION ?? "ca-central-1",
  });
}

export async function isAvailable(): Promise<boolean> {
  await ensureInitialised();
  return !!client;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// chat sends a single Converse call to Claude on Bedrock. When documentText is
// present, it's prepended as a separate text content block on the user's first
// message — Claude reads it as the form being converted. The previous PDF
// document-block path was retired with the Textract converter (see spec
// 2026-06-09-form-builder-pdf-textract-converter-design.md).
export async function chat(
  systemPrompt: string,
  messages: ChatMessage[],
  documentText?: string,
): Promise<string> {
  await ensureInitialised();
  if (!client) throw new Error("AI service not configured");

  const bedrockMessages = messages.map((msg, idx) => {
    if (msg.role === "user" && documentText && idx === 0) {
      return {
        role: "user" as const,
        content: [{ text: documentText }, { text: msg.content }],
      };
    }
    return {
      role: msg.role as "user" | "assistant",
      content: [{ text: msg.content }],
    };
  });

  const command = new ConverseCommand({
    modelId,
    system: [{ text: systemPrompt }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: bedrockMessages as any,
    inferenceConfig: { maxTokens: 16384 },
  });
  const response = await client.send(command);
  const textBlock = response.output?.message?.content?.find(
    (b: { text?: string }) => b.text,
  );
  return textBlock?.text ?? "";
}
```

(Imports at the top — only `BedrockRuntimeClient` and `ConverseCommand` — are unchanged from today.)

- [ ] **Step 2: Verify the package still compiles**

Run: `pnpm exec nx run form_builder_api:build`
Expected: build error because `routes/ai.ts` still calls `chat(..., pdfPages)`. **This is expected.** It will be resolved in Task 8. The build error confirms we caught all callers via the type system.

- [ ] **Step 3: Commit**

```bash
git add apps/form_builder_api/src/ai/client.ts
git commit -m "refactor(form_builder_api): chat() takes documentText, not pdfPages

The Textract converter feeds extracted text instead of raw PDF bytes;
the document content-block path is gone. Build will fail on routes/ai.ts
until Task 8 lands — that's the type system catching the migration."
```

---

### Task 7: Rename `convertHandler` → `editHandler` and prune the PDF branch

**Files:**
- Modify: `apps/form_builder_api/src/routes/ai.ts` (extract `editHandler`; we'll add new routes in Task 8)
- Rename: `apps/form_builder_api/src/routes/ai.convert.spec.ts` → `ai.edit.spec.ts`

- [ ] **Step 1: Rename the spec file**

```bash
git mv apps/form_builder_api/src/routes/ai.convert.spec.ts apps/form_builder_api/src/routes/ai.edit.spec.ts
```

- [ ] **Step 2: Update the spec's import and remove PDF-specific cases**

In `apps/form_builder_api/src/routes/ai.edit.spec.ts`:
- Change `import { convertHandler } from "./ai";` → `import { editHandler } from "./ai";`
- Replace all `convertHandler(...)` calls with `editHandler(...)`.
- Delete any test case whose body sets `pdfBase64` (these are the PDF-branch tests; the upload flow has new tests landing in Task 8). Keep all message/recipeJson tests.

Run: `grep -n "pdfBase64\|convertHandler" apps/form_builder_api/src/routes/ai.edit.spec.ts`
Expected: no matches.

- [ ] **Step 3: Update `routes/ai.ts`: rename + strip PDF branch + drop `pdfPages` arg**

Edit `apps/form_builder_api/src/routes/ai.ts`:

Replace the existing `convertHandler` (the long export starting at `export async function convertHandler`) and the route registration `aiRouter.post("/convert", convertHandler);` with:

```ts
// POST /builder/ai/edit — synchronous text-only AI edits.
//
// Body: { message?, recipeJson? }. At least one must be present.
//   - Edit Form: { message, recipeJson } → modified recipe
//   - Plain ask: { message }             → conversational reply, no recipe
//
// PDF uploads use the separate /builder/ai/upload/* family (see ai-upload.ts).
export async function editHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!(await isAvailable())) {
      res.status(503).json({ error: "AI service not configured" });
      return;
    }

    const { message, recipeJson } = req.body ?? {};
    if (!message && !recipeJson) {
      res.status(400).json({
        error: "Provide at least one of message, recipeJson",
      });
      return;
    }

    const systemPrompt = await buildSystemPrompt();
    const userText = buildUserText(message, recipeJson);

    const reply = await chat(systemPrompt, [{ role: "user", content: userText }]);
    const recipe = extractRecipe(reply);

    let unresolvableRefs: UnknownRef[] = [];
    if (recipe && Array.isArray((recipe as { steps?: unknown }).steps)) {
      try {
        const catalog = await getFullCatalog();
        unresolvableRefs = collectUnknownRefs(
          recipe as unknown as ServiceContractRecipe,
          catalog,
        );
      } catch (err) {
        console.warn("edit: ref pre-check skipped —", err);
      }
    }

    res.json({ recipe, reply, unresolvableRefs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
aiRouter.post("/edit", editHandler);
```

Also remove the now-unused `pdfBase64` parameter from `buildUserText`'s callers — `buildUserText` itself can stay as-is (it already handles the `recipeJson` undefined branch).

- [ ] **Step 4: Run the renamed tests**

Run: `pnpm exec nx run form_builder_api:test -- --testPathPattern=ai.edit.spec`
Expected: PASS (the original convert tests minus the PDF cases).

- [ ] **Step 5: Verify the package builds**

Run: `pnpm exec nx run form_builder_api:build`
Expected: clean build. (The `chat()` signature change from Task 6 is now consistent with the call site.)

- [ ] **Step 6: Commit**

```bash
git add apps/form_builder_api/src/routes/ai.ts apps/form_builder_api/src/routes/ai.edit.spec.ts
git commit -m "refactor(form_builder_api): rename /convert → /edit, drop PDF branch

The synchronous /convert endpoint becomes /edit and handles only
message + recipeJson (text-only AI edits). The PDF upload path moves
to the new async /upload/* family in Task 8."
```

---

### Task 8: Add the three new upload routes (presign / process / status)

**Files:**
- Create: `apps/form_builder_api/src/routes/ai-upload.ts`
- Create: `apps/form_builder_api/src/routes/ai-upload.spec.ts`
- Modify: `apps/form_builder_api/src/routes/ai.ts` (export the upload handlers / mount them on `aiRouter`)

- [ ] **Step 1: Write the failing test**

Create `apps/form_builder_api/src/routes/ai-upload.spec.ts`:

```ts
import type { Request, Response } from "express";

jest.mock("@govtech-bb/database", () => ({ CustomComponent: class {} }));
jest.mock("../db.js", () => ({ getDataSource: jest.fn() }));
jest.mock("../ai/system-prompt.js", () => ({ getSystemPrompt: () => "BASE_PROMPT" }));
jest.mock("../ai/client.js", () => ({
  chat: jest.fn(),
  isAvailable: jest.fn().mockResolvedValue(true),
}));
jest.mock("../ai/recipe-extractor.js", () => ({ extractRecipe: jest.fn() }));
jest.mock("../ai/textract.js", () => ({
  startAnalysis: jest.fn(),
  getAnalysisResult: jest.fn(),
  blocksToText: jest.fn(),
}));
jest.mock("../storage/s3-uploads.js", () => ({ presignUpload: jest.fn() }));

import { chat } from "../ai/client.js";
import { extractRecipe } from "../ai/recipe-extractor.js";
import { startAnalysis, getAnalysisResult, blocksToText } from "../ai/textract.js";
import { presignUpload } from "../storage/s3-uploads.js";
import { presignHandler, processHandler, statusHandler } from "./ai-upload";

const chatMock = chat as jest.Mock;
const extractRecipeMock = extractRecipe as jest.Mock;
const startAnalysisMock = startAnalysis as jest.Mock;
const getAnalysisResultMock = getAnalysisResult as jest.Mock;
const blocksToTextMock = blocksToText as jest.Mock;
const presignUploadMock = presignUpload as jest.Mock;

const mockReq = (body: unknown = {}, params: Record<string, string> = {}): Request =>
  ({ body, params }) as unknown as Request;

interface Captured extends Response {
  statusCode: number;
  body: unknown;
}
const mockRes = (): Captured => {
  const res = {} as Captured;
  res.statusCode = 200;
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (b: unknown) => {
    res.body = b;
    return res;
  };
  return res;
};

beforeEach(() => {
  chatMock.mockReset();
  extractRecipeMock.mockReset();
  startAnalysisMock.mockReset();
  getAnalysisResultMock.mockReset();
  blocksToTextMock.mockReset();
  presignUploadMock.mockReset();
});

describe("presignHandler", () => {
  it("returns the url and s3Key", async () => {
    presignUploadMock.mockResolvedValue({
      url: "https://signed/x",
      s3Key: "uploads/abc.pdf",
    });
    const res = mockRes();
    await presignHandler(mockReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ url: "https://signed/x", s3Key: "uploads/abc.pdf" });
  });
});

describe("processHandler", () => {
  it("400s when s3Key shape is wrong", async () => {
    const res = mockRes();
    await processHandler(mockReq({ s3Key: "../../etc/passwd" }), res);
    expect(res.statusCode).toBe(400);
  });

  it("calls startAnalysis and returns jobId", async () => {
    startAnalysisMock.mockResolvedValue({ jobId: "job-1" });
    const res = mockRes();
    await processHandler(mockReq({ s3Key: "uploads/abc-12345678-1234-1234-1234-1234567890ab.pdf" }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ jobId: "job-1" });
  });
});

describe("statusHandler", () => {
  it("returns { status: 'processing' } while Textract is in progress", async () => {
    getAnalysisResultMock.mockResolvedValue({ status: "processing" });
    const res = mockRes();
    await statusHandler(mockReq({}, { jobId: "j-1" }), res);
    expect(res.body).toEqual({ status: "processing" });
  });

  it("runs chat() and returns the recipe when Textract is done", async () => {
    getAnalysisResultMock.mockResolvedValue({
      status: "done",
      blocks: [{ BlockType: "PAGE" }],
    });
    blocksToTextMock.mockReturnValue("## Page 1\n\nName: ____");
    chatMock.mockResolvedValue("```json\n{\"formId\":\"f\",\"steps\":[]}\n```");
    extractRecipeMock.mockReturnValue({ formId: "f", steps: [] });

    const res = mockRes();
    await statusHandler(mockReq({}, { jobId: "j-1" }), res);

    expect(chatMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      "## Page 1\n\nName: ____",
    );
    expect(res.body).toMatchObject({
      status: "done",
      recipe: { formId: "f", steps: [] },
    });
  });

  it("maps password-protected reasons to a friendly message", async () => {
    getAnalysisResultMock.mockResolvedValue({
      status: "failed",
      reason: "Document is password protected",
    });
    const res = mockRes();
    await statusHandler(mockReq({}, { jobId: "j-1" }), res);
    expect(res.body).toEqual({
      status: "failed",
      reason: "This PDF appears to be password-protected. Please remove the password and re-upload.",
    });
  });

  it("falls back to a generic message for unknown Textract failure reasons", async () => {
    getAnalysisResultMock.mockResolvedValue({ status: "failed", reason: "something obscure" });
    const res = mockRes();
    await statusHandler(mockReq({}, { jobId: "j-1" }), res);
    expect((res.body as { reason: string }).reason).toBe(
      "We couldn't read this PDF — please try a different file.",
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec nx run form_builder_api:test -- --testPathPattern=ai-upload.spec`
Expected: FAIL — `./ai-upload` doesn't exist yet.

- [ ] **Step 3: Implement the three handlers**

Create `apps/form_builder_api/src/routes/ai-upload.ts`:

```ts
import type { Request, Response } from "express";
import { collectUnknownRefs, type UnknownRef } from "@govtech-bb/form-builder";
import type { ServiceContractRecipe } from "@govtech-bb/form-types";

import { presignUpload } from "../storage/s3-uploads.js";
import { startAnalysis, getAnalysisResult, blocksToText } from "../ai/textract.js";
import { chat, isAvailable } from "../ai/client.js";
import { extractRecipe } from "../ai/recipe-extractor.js";
import { getFullCatalog } from "../catalog.js";
import { getSystemPrompt } from "../ai/system-prompt.js";

const KEY_PATTERN = /^uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/;

// POST /builder/ai/upload/presign — returns { url, s3Key }
export async function presignHandler(_req: Request, res: Response): Promise<void> {
  try {
    if (!process.env.S3_BUCKET) {
      res.status(503).json({ error: "Upload service not configured" });
      return;
    }
    const { url, s3Key } = await presignUpload();
    res.json({ url, s3Key });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// POST /builder/ai/upload/process — body { s3Key } → { jobId }
export async function processHandler(req: Request, res: Response): Promise<void> {
  try {
    const { s3Key } = req.body ?? {};
    if (typeof s3Key !== "string" || !KEY_PATTERN.test(s3Key)) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const { jobId } = await startAnalysis(s3Key);
    res.json({ jobId });
  } catch (err: any) {
    const message: string = err?.message ?? "Unknown error";
    if (message.includes("InvalidS3Object")) {
      res.status(404).json({ error: "The uploaded file was not found. Please try again." });
      return;
    }
    if (message.includes("LimitExceeded")) {
      res.status(429).json({ error: "Too many uploads in progress — please try again in a minute." });
      return;
    }
    res.status(500).json({ error: message });
  }
}

// GET /builder/ai/upload/status/:jobId — polls Textract; on done, runs chat()
export async function statusHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!(await isAvailable())) {
      res.status(503).json({ error: "AI service not configured" });
      return;
    }
    const { jobId } = req.params;
    const result = await getAnalysisResult(jobId);

    if (result.status === "processing") {
      res.json({ status: "processing" });
      return;
    }

    if (result.status === "failed") {
      res.json({ status: "failed", reason: mapTextractReason(result.reason) });
      return;
    }

    // done: convert blocks → text → chat → recipe
    const documentText = blocksToText(result.blocks);
    const systemPrompt = getSystemPrompt();
    const userText = "Convert this uploaded form into a complete, valid recipe.";

    const reply = await chat(systemPrompt, [{ role: "user", content: userText }], documentText);
    const recipe = extractRecipe(reply);

    let unresolvableRefs: UnknownRef[] = [];
    if (recipe && Array.isArray((recipe as { steps?: unknown }).steps)) {
      try {
        const catalog = await getFullCatalog();
        unresolvableRefs = collectUnknownRefs(
          recipe as unknown as ServiceContractRecipe,
          catalog,
        );
      } catch (err) {
        console.warn("upload/status: ref pre-check skipped —", err);
      }
    }

    res.json({ status: "done", recipe, reply, unresolvableRefs });
  } catch (err: any) {
    const message: string = err?.message ?? "Unknown error";
    if (message.includes("InvalidJobId")) {
      res.status(404).json({ error: "This upload session expired. Please re-upload." });
      return;
    }
    res.status(500).json({ error: message });
  }
}

function mapTextractReason(raw?: string): string {
  const reason = (raw ?? "").toLowerCase();
  if (reason.includes("password")) {
    return "This PDF appears to be password-protected. Please remove the password and re-upload.";
  }
  if (reason.includes("corrupt") || reason.includes("unsupported")) {
    return "We couldn't read this PDF. It may be corrupted or in an unsupported format.";
  }
  if (reason.includes("partial")) {
    return "The PDF was only partially readable — please try a clearer scan.";
  }
  return "We couldn't read this PDF — please try a different file.";
}
```

> Note: live custom components were appended to the system prompt in the old convert handler. The upload flow uses the base system prompt only — this matches today's behaviour for the same reason (the model's job here is form *generation*, where custom components are less load-bearing than for edits). If parity is desired later, factor `buildSystemPrompt` out of `routes/ai.ts` into a shared helper — out of scope for this plan.

- [ ] **Step 4: Mount the new routes**

In `apps/form_builder_api/src/routes/ai.ts`, near the other `aiRouter.post(...)` lines, add:

```ts
import { presignHandler, processHandler, statusHandler } from "./ai-upload.js";

aiRouter.post("/upload/presign", presignHandler);
aiRouter.post("/upload/process", processHandler);
aiRouter.get("/upload/status/:jobId", statusHandler);
```

- [ ] **Step 5: Run the upload route tests**

Run: `pnpm exec nx run form_builder_api:test -- --testPathPattern=ai-upload.spec`
Expected: PASS (8 tests).

- [ ] **Step 6: Run the full form_builder_api test suite to catch regressions**

Run: `pnpm exec nx run form_builder_api:test`
Expected: all suites pass.

- [ ] **Step 7: Verify the build**

Run: `pnpm exec nx run form_builder_api:build`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add apps/form_builder_api/src/routes/ai-upload.ts apps/form_builder_api/src/routes/ai-upload.spec.ts apps/form_builder_api/src/routes/ai.ts
git commit -m "feat(form_builder_api): add /upload/{presign,process,status} routes

Three new endpoints on /builder/ai for the async PDF flow:
- POST /upload/presign  → { url, s3Key }
- POST /upload/process  → starts Textract, returns { jobId }
- GET  /upload/status/:jobId → polls; on done runs Bedrock + returns recipe.

Includes s3Key shape validation (security gate), Textract reason
mapping for user-facing messages, and the same unresolvableRefs
post-processing as the edit handler."
```

**Phase 2 complete.** Server-side now exposes the new endpoints; old `/convert` is gone.

---

## Phase 3 — `form_builder` client (`gov-bb` repo, same branch)

### Task 9: Restructure server fn family in `convert.ts`

**Files:**
- Modify: `apps/form_builder/app/server/ai-builder/convert.ts`
- Modify: `apps/form_builder/app/server/ai-builder/types.ts`

- [ ] **Step 1: Update the request/response types**

Replace the contents of `apps/form_builder/app/server/ai-builder/types.ts` with:

```ts
import type { UnknownRef } from "@govtech-bb/form-builder";

export interface ChatMessage {
  // "status" is an editor-emitted line reporting an apply outcome (applied /
  // unchanged / extraction-failed) — distinct from the model's "assistant" prose.
  role: "user" | "assistant" | "status";
  content: string;
}

// Synchronous /builder/ai/edit — text-only AI edits.
export interface EditRequest {
  message?: string;
  recipeJson?: string;
}

// Response from edit AND from the terminal upload/status poll. `recipe` is null
// when the model replied conversationally without emitting a recipe. (#504)
export interface ConvertResponse {
  recipe: Record<string, unknown> | null;
  reply: string;
  unresolvableRefs: UnknownRef[];
}

// Polling response from /builder/ai/upload/status/:jobId
export type UploadStatusResponse =
  | { status: "processing" }
  | ({ status: "done" } & ConvertResponse)
  | { status: "failed"; reason: string };
```

- [ ] **Step 2: Replace the server-fn family**

Replace the contents of `apps/form_builder/app/server/ai-builder/convert.ts` with:

```ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { api } from "../api-client";
import type { ConvertResponse, UploadStatusResponse } from "./types";
import { requireSession } from "../auth/require-session";

export const getAiStatus = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .handler(async (): Promise<{ available: boolean; message: string }> => {
    return api.get("/builder/ai/status");
  });

// Text-only edits — synchronous. The PDF upload path uses presignPdfUpload +
// startPdfConvert + getPdfConvertStatus below.
export const editRecipe = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator(
    z
      .object({
        message: z.string().optional(),
        recipeJson: z.string().optional(),
      })
      .refine(
        (d) => Boolean(d.message || d.recipeJson),
        "Provide at least one of message, recipeJson",
      ),
  )
  .handler(async ({ data }): Promise<ConvertResponse> => {
    return api.post<ConvertResponse>("/builder/ai/edit", {
      message: data.message,
      recipeJson: data.recipeJson,
    });
  });

export const presignPdfUpload = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .handler(async (): Promise<{ url: string; s3Key: string }> => {
    return api.post("/builder/ai/upload/presign", {});
  });

export const startPdfConvert = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator(z.object({ s3Key: z.string() }))
  .handler(async ({ data }): Promise<{ jobId: string }> => {
    return api.post("/builder/ai/upload/process", { s3Key: data.s3Key });
  });

export const getPdfConvertStatus = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .inputValidator(z.object({ jobId: z.string() }))
  .handler(async ({ data }): Promise<UploadStatusResponse> => {
    return api.get(`/builder/ai/upload/status/${encodeURIComponent(data.jobId)}`);
  });
```

- [ ] **Step 3: Verify the package builds**

Run: `pnpm exec nx run form_builder:build`
Expected: build fails because `-ai-sidebar.tsx` still imports `convertRecipe`. **Expected.** Resolved in Task 10.

- [ ] **Step 4: Commit**

```bash
git add apps/form_builder/app/server/ai-builder/
git commit -m "refactor(form_builder): server-fn family for new AI flow

Replaces the single convertRecipe() server fn with:
- editRecipe()           → POST /builder/ai/edit
- presignPdfUpload()     → POST /builder/ai/upload/presign
- startPdfConvert()      → POST /builder/ai/upload/process
- getPdfConvertStatus()  → GET  /builder/ai/upload/status/:jobId

Build fails on -ai-sidebar.tsx until Task 10 lands."
```

---

### Task 10: Rewrite `handleUpload` in `-ai-sidebar.tsx` (tests first)

**Files:**
- Modify: `apps/form_builder/app/routes/builder/-ai-sidebar.spec.tsx`
- Modify: `apps/form_builder/app/routes/builder/-ai-sidebar.tsx`

- [ ] **Step 1: Update the spec mocks and add upload tests**

In `apps/form_builder/app/routes/builder/-ai-sidebar.spec.tsx`, replace the existing `jest.mock` block (the one that stubs `convertRecipe`) with the new four-fn family, and rename existing `convertRecipe.*` references to `editRecipe.*`:

```tsx
const editRecipe = jest.fn();
const presignPdfUpload = jest.fn();
const startPdfConvert = jest.fn();
const getPdfConvertStatus = jest.fn();

jest.mock("../../server/ai-builder/convert", () => ({
  editRecipe: (...args: unknown[]) => editRecipe(...args),
  presignPdfUpload: (...args: unknown[]) => presignPdfUpload(...args),
  startPdfConvert: (...args: unknown[]) => startPdfConvert(...args),
  getPdfConvertStatus: (...args: unknown[]) => getPdfConvertStatus(...args),
  getAiStatus: jest.fn(),
}));

// Stub global fetch for the direct browser → S3 PUT.
const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(
  new Response(null, { status: 200 }),
);

beforeEach(() => {
  editRecipe.mockReset();
  presignPdfUpload.mockReset();
  startPdfConvert.mockReset();
  getPdfConvertStatus.mockReset();
  fetchSpy.mockClear();
});
```

Then replace any existing `convertRecipe.mockResolvedValue(...)` / `convertRecipe.mockReset()` calls in the existing "Edit Form" describe block with `editRecipe.*`. Existing assertions on `convertRecipe.mock.calls[0][0].data.message` become `editRecipe.mock.calls[0][0].data.message`.

Append a new describe block at the bottom of the file:

```tsx
describe("AiSidebar — Upload", () => {
  function pickPdf(name = "form.pdf", size = 1024) {
    const file = new File([new Uint8Array(size)], name, { type: "application/pdf" });
    const input = screen.getByLabelText(/attach pdf/i, { selector: "input" }) as HTMLInputElement;
    return userEvent.upload(input, file);
  }

  it("runs presign → S3 PUT → process → poll → applies the returned recipe", async () => {
    jest.useFakeTimers();
    presignPdfUpload.mockResolvedValue({ url: "https://s3/url", s3Key: "uploads/abc.pdf" });
    startPdfConvert.mockResolvedValue({ jobId: "job-1" });
    getPdfConvertStatus
      .mockResolvedValueOnce({ status: "processing" })
      .mockResolvedValueOnce({
        status: "done",
        recipe: { formId: "f", steps: [] },
        reply: "Done.",
        unresolvableRefs: [],
      });
    const { onApplyRecipe } = setup();

    await pickPdf();
    await userEvent.click(screen.getByRole("button", { name: /upload/i }));

    await waitFor(() => expect(presignPdfUpload).toHaveBeenCalled());
    expect(fetchSpy).toHaveBeenCalledWith("https://s3/url", expect.objectContaining({ method: "PUT" }));
    expect(startPdfConvert).toHaveBeenCalledWith({ data: { s3Key: "uploads/abc.pdf" } });

    // Advance the polling timer twice (processing → done)
    await jest.advanceTimersByTimeAsync(2000);
    await jest.advanceTimersByTimeAsync(2000);

    await waitFor(() => expect(onApplyRecipe).toHaveBeenCalled());
    jest.useRealTimers();
  });

  it("surfaces the mapped reason when the server reports a password-protected PDF", async () => {
    jest.useFakeTimers();
    presignPdfUpload.mockResolvedValue({ url: "https://s3/url", s3Key: "uploads/abc.pdf" });
    startPdfConvert.mockResolvedValue({ jobId: "job-1" });
    getPdfConvertStatus.mockResolvedValue({
      status: "failed",
      reason: "This PDF appears to be password-protected. Please remove the password and re-upload.",
    });
    setup();

    await pickPdf();
    await userEvent.click(screen.getByRole("button", { name: /upload/i }));

    await jest.advanceTimersByTimeAsync(2000);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/password-protected/i),
    );
    jest.useRealTimers();
  });

  it("stops polling when the component unmounts", async () => {
    jest.useFakeTimers();
    presignPdfUpload.mockResolvedValue({ url: "https://s3/url", s3Key: "uploads/abc.pdf" });
    startPdfConvert.mockResolvedValue({ jobId: "job-1" });
    getPdfConvertStatus.mockResolvedValue({ status: "processing" });
    const { unmount } = render(
      <AiSidebar draft={DRAFT} version="1.0.0" onApplyRecipe={jest.fn()} />,
    );

    const input = screen.getByLabelText(/attach pdf/i, { selector: "input" }) as HTMLInputElement;
    await userEvent.upload(input, new File([new Uint8Array(1024)], "x.pdf", { type: "application/pdf" }));
    await userEvent.click(screen.getByRole("button", { name: /upload/i }));
    await jest.advanceTimersByTimeAsync(2000);

    const callsBeforeUnmount = getPdfConvertStatus.mock.calls.length;
    unmount();
    await jest.advanceTimersByTimeAsync(10_000);
    expect(getPdfConvertStatus.mock.calls.length).toBe(callsBeforeUnmount);
    jest.useRealTimers();
  });

  it("times out after 3 minutes with a friendly error", async () => {
    jest.useFakeTimers();
    presignPdfUpload.mockResolvedValue({ url: "https://s3/url", s3Key: "uploads/abc.pdf" });
    startPdfConvert.mockResolvedValue({ jobId: "job-1" });
    getPdfConvertStatus.mockResolvedValue({ status: "processing" });
    setup();

    await pickPdf();
    await userEvent.click(screen.getByRole("button", { name: /upload/i }));
    await jest.advanceTimersByTimeAsync(3 * 60_000 + 2000);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/taking longer than expected/i),
    );
    jest.useRealTimers();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec nx run form_builder:test -- --testPathPattern=-ai-sidebar.spec`
Expected: FAIL — existing tests fail on the renamed export, and new upload tests fail because `handleUpload` still uses the old path.

- [ ] **Step 3: Rewrite `-ai-sidebar.tsx`**

Apply these edits to `apps/form_builder/app/routes/builder/-ai-sidebar.tsx`:

1. Replace the import line `import { convertRecipe } from "../../server/ai-builder/convert";` with:
   ```tsx
   import {
     editRecipe,
     presignPdfUpload,
     startPdfConvert,
     getPdfConvertStatus,
   } from "../../server/ai-builder/convert";
   ```

2. Replace the `MAX_PDF_BYTES` line:
   ```tsx
   const MAX_PDF_BYTES = 20 * 1024 * 1024;
   ```

3. Delete the entire `fileToBase64` function — it is no longer reachable.

4. Replace the `toMessage` helper with this simpler version (the "Invariant failed" 413 path is gone):
   ```tsx
   const toMessage = (err: unknown): string => {
     return err instanceof Error ? err.message : "Unknown error";
   };
   ```
   Update both call sites: `toMessage(err, "upload")` / `toMessage(err, "edit")` → `toMessage(err)`.

5. Add a polling abort ref at the top of the component (alongside `chatEndRef`):
   ```tsx
   const pollAbortRef = useRef<AbortController | null>(null);
   useEffect(() => () => pollAbortRef.current?.abort(), []);
   ```

6. Replace `handleUpload` with:
   ```tsx
   const handleUpload = async () => {
     if (!pdfFile || loading) return;
     setLoading(true);
     setError(null);
     setMessages((m) => [
       ...m,
       { role: "user", content: `📎 Uploaded ${pdfName ?? "file"}` },
     ]);

     pollAbortRef.current?.abort();
     const abort = new AbortController();
     pollAbortRef.current = abort;

     try {
       const { url, s3Key } = await presignPdfUpload();
       const putResponse = await fetch(url, {
         method: "PUT",
         headers: { "Content-Type": "application/pdf" },
         body: pdfFile,
         signal: abort.signal,
       });
       if (!putResponse.ok) throw new Error("Upload failed — please refresh and try again.");

       const { jobId } = await startPdfConvert({ data: { s3Key } });

       const start = Date.now();
       const TIMEOUT_MS = 3 * 60_000;
       const POLL_MS = 2000;

       while (!abort.signal.aborted) {
         if (Date.now() - start > TIMEOUT_MS) {
           throw new Error(
             "This upload is taking longer than expected. Please try a smaller PDF or try again later.",
           );
         }
         await new Promise((r) => setTimeout(r, POLL_MS));
         if (abort.signal.aborted) return;

         const status = await getPdfConvertStatus({ data: { jobId } });
         if (status.status === "processing") continue;
         if (status.status === "failed") throw new Error(status.reason);

         // done
         setPdfFile(null);
         setPdfName(null);
         await handleResponse(status.reply, status.recipe, status.unresolvableRefs);
         return;
       }
     } catch (err) {
       if (abort.signal.aborted) return;
       setError(toMessage(err));
     } finally {
       if (pollAbortRef.current === abort) pollAbortRef.current = null;
       setLoading(false);
     }
   };
   ```

7. Replace `handleEditForm`'s `convertRecipe` call with `editRecipe`:
   ```tsx
   const { recipe, reply, unresolvableRefs } = await editRecipe({
     data: { message, recipeJson },
   });
   ```

- [ ] **Step 4: Verify all sidebar tests pass**

Run: `pnpm exec nx run form_builder:test -- --testPathPattern=-ai-sidebar.spec`
Expected: PASS (existing Edit Form tests + 4 new Upload tests).

- [ ] **Step 5: Verify the form_builder app builds**

Run: `pnpm exec nx run form_builder:build`
Expected: clean build.

- [ ] **Step 6: Commit**

```bash
git add apps/form_builder/app/routes/builder/-ai-sidebar.tsx apps/form_builder/app/routes/builder/-ai-sidebar.spec.tsx
git commit -m "feat(form_builder): wire AI sidebar to async PDF upload flow

Replaces the inline base64 path with presign → direct S3 PUT → start
Textract → poll for status. Lifts MAX_PDF_BYTES to 20 MB, deletes the
fileToBase64 helper and the 'Invariant failed' 413-decoding branch
(no longer reachable). AbortController stops polling on unmount or on
a subsequent upload starting; 3-minute hard cap surfaces a friendly
timeout message."
```

---

## Phase 4 — Verify, build, smoke

### Task 11: Full-repo build verification

**Files:** none (validation only)

- [ ] **Step 1: Build all packages (excluding the known-broken ones per CLAUDE.md)**

Run: `pnpm exec nx run-many -t build --exclude=landing,cms`
Expected: clean build across every project.

- [ ] **Step 2: Run tests for the projects we touched**

Run: `pnpm exec nx run-many -t test -p form_builder,form_builder_api`
Expected: all suites pass.

- [ ] **Step 3: If anything fails, fix the root cause; never `--no-verify`**

Investigate the failure, fix in code, re-run from Step 1.

---

### Task 12: Manual smoke (sandbox)

> Pre-req: Phase 1 PR is **merged and applied**. Confirm the Textract policy is attached: `aws iam list-role-policies --role-name <ecs_task_role_name> --profile <sandbox-profile>` should include `form-builder-ecs-textract`. The bucket (`form-builder-uploads-sandbox-7922`) and `S3_BUCKET`/`S3_REGION` env vars are already in place.

**Files:** none (browser-based verification)

- [ ] **Step 1: Push the branch and open the gov-bb PR against `sandbox`**

```bash
git push -u origin feat/form-builder-pdf-textract-converter
gh pr create --base sandbox --title "feat(form-builder): PDF → Textract converter (20 MB cap, async flow)" --body "$(cat <<'EOF'
## Summary
- Replaces inline base64 PDF upload with S3 + async Textract.
- Lifts the upload ceiling from 4 MB to 20 MB.
- Cuts Bedrock input by feeding extracted text instead of the raw PDF document block.

Spec: docs/superpowers/specs/2026-06-09-form-builder-pdf-textract-converter-design.md
Plan: docs/superpowers/plans/2026-06-09-form-builder-pdf-textract-converter.md

Depends on alpha-infra PR for the S3 bucket + IAM (must be applied to sandbox before smoke).

## Test plan
- [ ] ~500 KB born-digital PDF → recipe generated, applied.
- [ ] ~5 MB scanned PDF → Textract OCR works, recipe generated.
- [ ] ~15 MB PDF → flow completes, polling visible in Network tab.
- [ ] Password-protected PDF → friendly "remove password" message.
- [ ] 25 MB PDF → client-side rejection, no network call.
- [ ] Mid-upload refresh → no zombie polls.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Wait for the Amplify preview to deploy**

Wait for the GitHub Actions `pr-preview.yml` job to finish, then visit the preview URL printed in the PR's checks.

- [ ] **Step 3: Smoke each case from the spec's manual smoke checklist**

In the form-builder AI sidebar:
- Upload a ~500 KB born-digital PDF → expect: recipe appears in the editor; sidebar shows "Applied to the editor" status.
- Upload a ~5 MB scanned PDF → expect: same outcome, may take 20–60s polling.
- Upload a ~15 MB PDF → expect: same outcome; in DevTools Network you see one `presign`, one `PUT` to S3, one `process`, and N status polls roughly 2s apart.
- Upload a password-protected PDF → expect: red error reading "This PDF appears to be password-protected. Please remove the password and re-upload."
- Try to attach a 25 MB PDF → expect: client-side rejection ("File is X MB; maximum is 20 MB"), no network calls.
- Mid-upload, refresh the page → expect: no further polls in the next browser tab; no orphan jobs visible.

- [ ] **Step 4: Triage any failures**

If a case fails:
- **Network 4xx/5xx on a route:** check ECS task logs (`aws logs tail /aws/ecs/form_builder_api --profile govtech-alpha-sandbox --follow`); identify root cause, fix in code, push fix to same branch.
- **S3 CORS error:** double-check `aws_s3_bucket_cors_configuration` `allowed_origins` matches the actual preview URL; fix in alpha-infra and re-apply.
- **Textract `AccessDeniedException`:** confirm the IAM policy attachment landed (`aws iam list-attached-role-policies --role-name <task-role> --profile govtech-alpha-sandbox`).
- **`InvalidS3ObjectException`:** the API's task role lacks `s3:GetObject` on `uploads/*`; re-check the IAM policy.

When all six cases pass, ping a reviewer.

---

## Self-review notes

- **Spec coverage**: every section of the spec maps to a task. Bucket + IAM + CORS → Task 1; presign helper → Task 4; Textract wrapper + blocksToText → Tasks 3+5; chat() signature → Task 6; route restructure → Tasks 7+8; client-side family → Task 9; sidebar rewrite → Task 10; build + smoke → Tasks 11+12.
- **No placeholders**: every code block contains the exact content the engineer types. The one `<TASK_ROLE_ADDR>` and `<AMPLIFY_ORIGIN>` placeholders in Task 1 are explicitly framed as "look up and replace" with the exact commands to find them.
- **Type consistency**: `editRecipe` / `presignPdfUpload` / `startPdfConvert` / `getPdfConvertStatus` names appear identically in `convert.ts`, the sidebar spec, the sidebar implementation, and the route mounting. `s3Key`, `jobId`, `UploadStatusResponse` are defined once and reused.
