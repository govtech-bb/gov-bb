/**
 * Journey 2 (#3009): a form builder publish keeps the recipe's hand-edited
 * processors, and a merged form is live and listed.
 *
 * Runs nightly against sandbox and alerts Slack on failure. It never gates a
 * deploy: this journey IS the release path, so it watches it rather than
 * blocking it.
 *
 * Against a DEDICATED non-public test form (`e2e-j2-publish-check`, never a
 * real form) whose recipe carries processors the builder cannot author (a
 * mapped CaMS webhook, #2684):
 *   1. Sign in to the form builder.
 *   2. Change the form's title, save the draft and publish it.
 *   3. Read the Deploy PR it opens and fail if the published recipe lost any
 *      processor or top-level field the committed recipe has (#2409).
 *   Then, always — pass or fail — close that PR and delete its branch.
 *
 * The PR is never merged: a nightly merge to main would deploy sandbox →
 * staging every night. So steps 4–5 of the issue's journey check the test
 * form as already merged by the PR that added it:
 *   4. It is live in the forms app.
 *   5. It is in the services index landing is built from (`GET /services`).
 *
 * Sign-in: the builder's GitHub OAuth round-trip can't run unattended, so the
 * spec mints the builder's own session cookie (see `mintSessionCookie`) for a
 * GitHub token that can open PRs on gov-bb. The builder then publishes with
 * that token, exactly as it does with a signed-in person's.
 *
 * Required env:
 *   SMOKE_BASE_URL                    forms base URL (shared smoke convention)
 *   PREVIEW_TOKEN                     the API's RECIPE_PREVIEW_TOKEN — the test form is preview
 *   E2E_FORM_BUILDER_URL              form builder base URL
 *   E2E_API_URL                       forms API base URL (serves `/services`)
 *   E2E_FORM_BUILDER_SESSION_SECRET   the builder's session_secret (base64, 32 bytes)
 *   E2E_FORM_BUILDER_GITHUB_TOKEN     GitHub token with write access to gov-bb
 */
import { createCipheriv, randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { expect, test } from "@playwright/test";
import { STEP_TIMEOUT, expectStep, openSmokeForm } from "../helpers/smoke";

const FORM_ID = "e2e-j2-publish-check";
const REPO = "govtech-bb/gov-bb";
const RECIPE_PATH = `apps/api/src/forms/form-definitions/recipes/${FORM_ID}.json`;
// The builder's Deploy branches for this form (deployBranchName in
// @govtech-bb/form-types): `form-builder/<formId>-<timestamp>`.
const DEPLOY_BRANCH = new RegExp(`^form-builder/${FORM_ID}-\\d+$`);

// The publish makes several GitHub calls server-side.
const PUBLISH_TIMEOUT = 60_000;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Journey 2 needs ${name} to be set`);
  return value;
}

const baseUrl = (name: string) => required(name).replace(/\/+$/, "");

/**
 * The builder's `fb_session` cookie value, in the format
 * apps/form_builder/app/server/session-cipher.server.ts `encrypt` writes and
 * `getSession` reads: AES-256-GCM over the JSON payload, as
 * `base64(iv).base64(authTag).base64(ciphertext)`.
 */
function mintSessionCookie(
  secretBase64: string,
  login: string,
  accessToken: string,
): string {
  const key = Buffer.from(secretBase64, "base64");
  if (key.length !== 32) {
    throw new Error(
      "E2E_FORM_BUILDER_SESSION_SECRET must decode to exactly 32 bytes",
    );
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const payload = JSON.stringify({
    login,
    accessToken,
    // Just past the test's own timeout: a leaked cookie dies with the run.
    expiresAt: Date.now() + 10 * 60_000,
  });
  const ciphertext = Buffer.concat([
    cipher.update(payload, "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), ciphertext]
    .map((b) => b.toString("base64"))
    .join(".");
}

async function github<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${required("E2E_FORM_BUILDER_GITHUB_TOKEN")}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(
      `GitHub ${init.method ?? "GET"} ${path} failed: ${res.status} ${await res.text()}`,
    );
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

type Recipe = Record<string, unknown> & { processors?: unknown[] };

async function recipeAt(ref: string): Promise<Recipe> {
  const file = await github<{ content: string }>(
    `/repos/${REPO}/contents/${RECIPE_PATH}?ref=${encodeURIComponent(ref)}`,
  );
  return JSON.parse(Buffer.from(file.content, "base64").toString("utf8"));
}

/**
 * Close every open PR on, and delete, every Deploy branch for the test form.
 * Runs before the publish too: an open Deploy PR would make the builder push
 * onto it rather than open a fresh one (#2390), and a crashed run can leave one.
 */
async function sweepDeployBranches(): Promise<void> {
  const [owner] = REPO.split("/");
  const refs = await github<{ ref: string }[]>(
    `/repos/${REPO}/git/matching-refs/heads/form-builder/${FORM_ID}-`,
  );
  for (const { ref } of refs) {
    const branch = ref.replace(/^refs\/heads\//, "");
    if (!DEPLOY_BRANCH.test(branch)) continue;
    const prs = await github<{ number: number }[]>(
      `/repos/${REPO}/pulls?state=open&head=${owner}:${encodeURIComponent(branch)}`,
    );
    for (const pr of prs) {
      await github(`/repos/${REPO}/pulls/${pr.number}`, {
        method: "PATCH",
        body: JSON.stringify({ state: "closed" }),
      });
    }
    await github(`/repos/${REPO}/git/refs/heads/${branch}`, {
      method: "DELETE",
    });
  }
}

// No trace: it would put the builder session cookie (which signs in as the
// E2E GitHub token) and the preview token into a downloadable artifact. A
// failure still gets its screenshot.
test.use({ trace: "off" });

test.describe("Journey 2 — form builder publish keeps processors", () => {
  test.beforeEach(sweepDeployBranches);
  // afterEach, not a finally: it still runs when the test times out.
  test.afterEach(sweepDeployBranches);

  test("the Deploy PR keeps every processor of the committed recipe", async ({
    page,
    context,
  }) => {
    test.setTimeout(5 * 60_000);
    const builderUrl = baseUrl("E2E_FORM_BUILDER_URL");
    const token = required("E2E_FORM_BUILDER_GITHUB_TOKEN");
    const { login } = await github<{ login: string }>("/user");
    const title = `E2E publish check (test service) ${Date.now()}`;

    await test.step("sign in to the form builder", async () => {
      await context.addCookies([
        {
          name: "fb_session",
          value: mintSessionCookie(
            required("E2E_FORM_BUILDER_SESSION_SECRET"),
            login,
            token,
          ),
          url: builderUrl,
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
        },
      ]);
      await page.goto(`${builderUrl}/builder?formId=${FORM_ID}`);
      await expect(
        page,
        "the builder rejected the session — does E2E_FORM_BUILDER_SESSION_SECRET match the builder's session_secret?",
      ).toHaveURL(/\/builder\?/);
    });

    const actions = page.getByRole("group", { name: "Form actions" });

    await test.step("change the title and save the draft", async () => {
      await page.getByRole("button", { name: /Form settings/ }).click();
      await page
        .locator("header")
        .getByLabel("Title", { exact: true })
        .fill(title);
      await actions.getByRole("button", { name: "Save draft" }).click();
      const dialog = page.getByRole("dialog", { name: "Save draft" });
      await dialog.getByRole("button", { name: "Save draft" }).click();
      await expect(dialog.getByText("Draft saved.")).toBeVisible({
        timeout: STEP_TIMEOUT,
      });
      await dialog.getByRole("button", { name: "Close" }).click();
    });

    const prNumber = await test.step("publish it", async () => {
      await actions.getByRole("button", { name: "Publish" }).click();
      const dialog = page.getByRole("dialog", { name: "Publish form" });
      await dialog
        .getByLabel("Description for the reviewer (optional)")
        .fill(
          "Nightly E2E J2 (#3009). Closed automatically — do not review or merge.",
        );
      await dialog.getByRole("button", { name: "Send for review" }).click();
      const link = dialog.getByRole("link", { name: /^Open review #\d+$/ });
      await expect(link).toBeVisible({ timeout: PUBLISH_TIMEOUT });
      // A fresh PR, not a push onto one left open (the sweep closed those).
      await expect(dialog).toContainText("opened on");
      return Number((await link.innerText()).replace(/\D/g, ""));
    });

    await test.step("the PR's recipe keeps every processor", async () => {
      const pr = await github<{
        head: { ref: string; sha: string };
        base: { ref: string };
      }>(`/repos/${REPO}/pulls/${prNumber}`);
      expect(pr.head.ref, "the PR's head branch").toMatch(DEPLOY_BRANCH);

      const files = await github<{ filename: string }[]>(
        `/repos/${REPO}/pulls/${prNumber}/files`,
      );
      expect(files.map((f) => f.filename)).toEqual([RECIPE_PATH]);

      const committed = await recipeAt(pr.base.ref);
      const published = await recipeAt(pr.head.sha);
      expect(published.title, "the published title").toBe(title);

      expect(
        committed.processors?.length ?? 0,
        `the committed ${FORM_ID} recipe has no processors, so this check proves nothing`,
      ).toBeGreaterThan(0);
      const lost = (committed.processors ?? []).filter(
        (p) =>
          !(published.processors ?? []).some((q) => isDeepStrictEqual(p, q)),
      );
      expect(lost, "processors the publish dropped or changed (#2409)").toEqual(
        [],
      );
      expect(
        Object.keys(committed).filter((key) => !(key in published)),
        "top-level recipe fields the publish dropped (#2409)",
      ).toEqual([]);
    });
  });
});

test.describe("Journey 2 — the merged test form is live and listed", () => {
  test("the forms app serves the test form", async ({ page }) => {
    required("PREVIEW_TOKEN");
    await openSmokeForm(page, FORM_ID);
    await page.waitForURL((url) => !!url.searchParams.get("step"), {
      timeout: STEP_TIMEOUT,
    });
    expectStep(page, "details", { exact: true });
  });

  test("the services index lists the test form", async () => {
    // Signed in, so the index includes non-public services like this one.
    const res = await fetch(`${baseUrl("E2E_API_URL")}/services`, {
      headers: {
        Authorization: `Bearer ${required("E2E_FORM_BUILDER_GITHUB_TOKEN")}`,
      },
    });
    expect(res.ok, `GET /services: ${res.status}`).toBe(true);
    const { data } = (await res.json()) as { data: { formId?: string }[] };
    expect(data.map((s) => s.formId)).toContain(FORM_ID);
  });
});
