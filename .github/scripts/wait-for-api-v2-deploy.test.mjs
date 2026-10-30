import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { API_DEPLOY_INPUTS, apiInputsMatch, assertApiEditorContract, waitForApiV2Deploy } from "./wait-for-api-v2-deploy.mjs";

const repository = "govtech-bb/gov-bb";
const sha = "b".repeat(40);
const run = {
  id: 12,
  run_attempt: 2,
  head_sha: sha,
  head_repository: { full_name: repository },
  head_branch: "v2-rewrite",
  event: "push",
  status: "completed",
  conclusion: "success",
};
const job = {
  name: "Build, Push & Deploy api_v2",
  head_sha: sha,
  conclusion: "success",
  steps: ["Wait and verify the running image", "Smoke test"].map((name) => ({ name, conclusion: "success" })),
};

function fixture(runs, { jobs = [job], compatible = (deployed) => deployed === sha } = {}) {
  let reads = 0;
  const requests = [];
  const options = {
    repository,
    sha,
    compatible,
    attempts: 3,
    wait: async () => {},
    get: async (path) => {
      requests.push(path);
      if (path.includes("/workflows/")) {
        const current = runs[Math.min(reads++, runs.length - 1)];
        return { workflow_runs: current ? [current] : [] };
      }
      return { jobs };
    },
  };
  return { options, requests };
}

test("combined release waits for its API run, including an initially absent run", async () => {
  const { options, requests } = fixture([undefined, { ...run, status: "in_progress", conclusion: null }, run]);
  assert.equal(await waitForApiV2Deploy(options), sha);
  assert.equal(requests.filter((path) => path.includes("/workflows/")).length, 3);
  assert.match(requests.at(-1), /\/runs\/12\/attempts\/2\/jobs/);
});

for (const conclusion of ["failure", "cancelled", "timed_out", "skipped", "neutral"]) {
  test(`a ${conclusion} API run blocks the editor`, async () => {
    const { options, requests } = fixture([{ ...run, conclusion }]);
    await assert.rejects(waitForApiV2Deploy(options), /API run 12 ended/);
    assert.equal(requests.length, 1);
  });
}

for (const pending of [undefined, { ...run, status: "queued", conclusion: null }, { ...run, head_sha: "c".repeat(40) }]) {
  test(`absent, queued or mismatched API evidence times out (${pending?.status ?? "absent"}/${pending?.head_sha?.[0] ?? "-"})`, async () => {
    const { options, requests } = fixture([pending]);
    await assert.rejects(waitForApiV2Deploy(options), /timed out/);
    assert.equal(requests.length, 3);
    assert.ok(requests.every((path) => path.includes("/workflows/")));
  });
}

test("editor-only and manual releases can use an already successful compatible API", async () => {
  const previous = "a".repeat(40);
  const { options } = fixture([{ ...run, event: "workflow_dispatch", head_sha: previous }], {
    compatible: (deployed, target) => deployed === previous && target === sha,
    jobs: [{ ...job, head_sha: previous }],
  });
  assert.equal(await waitForApiV2Deploy(options), previous);
});

for (const jobs of [[], [{ ...job, head_sha: "c".repeat(40) }], [{ ...job, steps: [] }], [{ ...job, steps: [{ name: "Wait and verify the running image", conclusion: "skipped" }] }]]) {
  test("green aggregate without matching ECS/image and smoke steps is refused", async () => {
    await assert.rejects(waitForApiV2Deploy(fixture([run], { jobs }).options), /evidence is missing/);
  });
}

for (const altered of [{ head_repository: { full_name: "someone/fork" } }, { head_branch: "main" }, { event: "pull_request" }, { run_attempt: 0 }]) {
  test("foreign workflow evidence is refused", async () => {
    await assert.rejects(waitForApiV2Deploy(fixture([{ ...run, ...altered }]).options), /workflow identity/);
  });
}

test("GitHub failures fail closed without treating an outage as an absent run", async () => {
  const { options } = fixture([run]);
  options.get = async () => { throw new Error("GitHub unavailable"); };
  await assert.rejects(waitForApiV2Deploy(options), /GitHub unavailable/);
});

test("actual Git input comparison permits editor-only commits, not changed API inputs or descendants", (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "api-release-gate-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const write = (path, value) => {
    const file = join(cwd, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, value);
  };
  const commit = () => { git("add", "."); git("commit", "-m", "fixture"); return git("rev-parse", "HEAD"); };
  git("init");
  git("config", "user.name", "Gate test");
  git("config", "user.email", "gate@example.invalid");
  git("config", "commit.gpgsign", "false");
  for (const path of API_DEPLOY_INPUTS)
    write(["apps/api_v2", "packages/govbbmarkd", "patches"].includes(path) ? `${path}/fixture.txt` : path, "original\n");
  const deployed = commit();
  write("apps/editor_v2/fixture.txt", "editor only\n");
  let target = commit();
  assert.equal(apiInputsMatch(deployed, target, cwd), true);
  assert.equal(apiInputsMatch(target, deployed, cwd), false);
  assert.throws(() => apiInputsMatch("not-a-sha", target, cwd), /invalid commit/);
  for (const path of API_DEPLOY_INPUTS) {
    const previous = target;
    write(["apps/api_v2", "packages/govbbmarkd", "patches"].includes(path) ? `${path}/fixture.txt` : path, "changed\n");
    target = commit();
    assert.equal(apiInputsMatch(previous, target, cwd), false, path);
  }
});

const specification = JSON.parse(readFileSync(new URL("../../apps/api_v2/openapi.json", import.meta.url), "utf8"));

test("the generated API contract supports the guarded editor", () => {
  assert.doesNotThrow(() => assertApiEditorContract(specification));
});

for (const missing of ["lease", "save-version", "review-version", "delete-version", "token"]) {
  test(`missing compatibility evidence blocks release: ${missing}`, () => {
    const spec = structuredClone(specification);
    const page = spec.paths["/pages/{id}"];
    if (missing === "lease") delete spec.paths["/pages/{id}/lock"];
    if (missing === "save-version") page.put.requestBody.content["application/json"].schema.required = [];
    if (missing === "review-version") spec.paths["/pages/{id}/revision/publish"].post.requestBody.content["application/json"].schema.properties.version.type = "string";
    if (missing === "delete-version") page.delete.parameters = [];
    if (missing === "token") page.put.parameters = [];
    assert.throws(() => assertApiEditorContract(spec), /not available/);
  });
}

test("editor deployment performs all gates before Amplify and checks the current image", () => {
  const workflow = readFileSync(new URL("../workflows/deploy-editor-v2-sandbox.yml", import.meta.url), "utf8");
  const gate = workflow.indexOf("Wait for a compatible API deployment");
  const live = workflow.indexOf("Verify the live API image and contract");
  const release = workflow.indexOf("aws amplify start-job");
  assert.ok(gate >= 0 && live > gate && release > live);
  assert.match(workflow, /actions: read/);
  assert.match(workflow, /RUNNING_IMAGE.*EXPECTED_IMAGE/);
  assert.match(workflow, /--check-contract/);
  assert.match(workflow, /--commit-id "\$GITHUB_SHA"/);
  const api = readFileSync(new URL("../workflows/deploy-api-v2-sandbox.yml", import.meta.url), "utf8");
  for (const path of API_DEPLOY_INPUTS) {
    const pattern = ["apps/api_v2", "packages/govbbmarkd", "patches"].includes(path) ? `${path}/**` : path;
    assert.ok(api.includes(`- "${pattern}"`), `API deploy trigger covers ${path}`);
  }
});

test("the live verification step fails closed with mocked AWS and HTTP in a fresh checkout", (t) => {
  const temporary = mkdtempSync(join(tmpdir(), "api-live-gate-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  mkdirSync(join(temporary, ".github/scripts"), { recursive: true });
  for (const file of ["package.json", "pnpm-workspace.yaml", "pnpm-lock.yaml", ".github/scripts/wait-for-api-v2-deploy.mjs"]) {
    writeFileSync(join(temporary, file), readFileSync(new URL(`../../${file}`, import.meta.url)));
  }
  const workflow = readFileSync(new URL("../workflows/deploy-editor-v2-sandbox.yml", import.meta.url), "utf8");
  const script = workflow.match(/name: Verify the live API image and contract[\s\S]*?run: \|\n((?: {10}[^\n]*\n|\n)+)/)?.[1].replace(/^ {10}/gm, "");
  assert.ok(script);
  writeFileSync(join(temporary, "aws"), `#!/bin/sh
case "$1 $2" in
  "ecs wait") exit "$WAIT_STATUS" ;;
  "ecs describe-services") echo test-task ;;
  "ecs describe-task-definition") echo "$TEST_IMAGE" ;;
  *) exit 2 ;;
esac
`, { mode: 0o755 });
  writeFileSync(join(temporary, "curl"), `#!/bin/sh
for arg; do output=$arg; done
cp "$TEST_SPEC" "$output"
`, { mode: 0o755 });
  for (const scenario of [
    { image: sha, wait: "0", spec: specification, status: 0 },
    { image: "wrong-image", wait: "0", spec: specification, status: 1 },
    { image: sha, wait: "1", spec: specification, status: 1 },
    { image: sha, wait: "0", spec: {}, status: 1 },
  ]) {
    const spec = join(temporary, "spec.json");
    writeFileSync(spec, JSON.stringify(scenario.spec));
    const result = spawnSync("bash", ["-euo", "pipefail", "-c", script], {
      cwd: temporary,
      encoding: "utf8",
      timeout: 30_000,
      env: {
        ...process.env,
        PATH: `${temporary}:${process.env.PATH}`,
        RUNNER_TEMP: temporary,
        ECS_CLUSTER: "test-cluster",
        ECS_SERVICE: "test-service",
        API_URL: "https://example.invalid",
        API_IMAGE: "registry.example.invalid/api",
        API_DEPLOY_SHA: sha,
        TEST_IMAGE: `registry.example.invalid/api:${scenario.image}`,
        WAIT_STATUS: scenario.wait,
        TEST_SPEC: spec,
      },
    });
    assert.equal(result.status, scenario.status, result.stdout + result.stderr);
    assert.equal(existsSync(join(temporary, "node_modules")), false);
  }
});
