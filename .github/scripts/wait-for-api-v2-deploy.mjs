import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { setTimeout } from "node:timers/promises";

// Docker inputs, plus the workflow whose successful deployment is the evidence.
export const API_DEPLOY_INPUTS = [
  "apps/api_v2",
  "packages/content/package.json",
  "packages/govbbmarkd",
  "patches",
  ".dockerignore",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "nx.json",
  "tsconfig.base.json",
  ".nvmrc",
  ".github/workflows/deploy-api-v2-sandbox.yml",
  ".github/scripts/verify-ecs-deployment.sh",
];

/** A previous API deployment is compatible only with identical inputs on an ancestor commit. */
export function apiInputsMatch(deployed, target, cwd = process.cwd()) {
  if (![deployed, target].every((sha) => /^[a-f0-9]{40}$/.test(sha)))
    throw new Error("API deployment gate: invalid commit SHA");

  for (const args of [
    ["merge-base", "--is-ancestor", deployed, target],
    ["diff", "--quiet", deployed, target, "--", ...API_DEPLOY_INPUTS],
  ]) {
    const result = spawnSync("git", args, { cwd, encoding: "utf8", timeout: 10_000 });
    if (result.error) throw result.error;
    if (result.status === 1) return false;
    if (result.status !== 0) throw new Error("API deployment gate: cannot compare API inputs");
  }
  return true;
}

/** Check the deployed OpenAPI document, not just a historical workflow's green conclusion. */
export function assertApiEditorContract(spec) {
  const page = spec.paths?.["/pages/{id}"];
  const lease = spec.paths?.["/pages/{id}/lock"];
  const versionedBodies = [
    page?.put,
    ...["submit", "reject", "publish"].map(
      (action) => spec.paths?.[`/pages/{id}/revision/${action}`]?.post,
    ),
  ];
  const hasVersion = versionedBodies.every((operation) => {
    const body = operation?.requestBody?.content?.["application/json"]?.schema;
    return body?.required?.includes("version") && body.properties?.version?.type === "integer";
  });
  const deleteVersion = page?.delete?.parameters?.some(
    (parameter) => parameter.in === "query" && parameter.name === "version" && parameter.required,
  );
  const tokenHeader = [page?.put, page?.delete].every((operation) =>
    operation?.parameters?.some(
      (parameter) => parameter.in === "header" && parameter.name === "x-page-edit-lock-token",
    ),
  );
  if (!hasVersion || !deleteVersion || !tokenHeader || !lease?.get || !lease?.post || !lease?.put || !lease?.delete)
    throw new Error("API deployment gate: numeric versions and page leases are not available");
}

/** Missing, incompatible or unfinished deployment evidence never authorizes an editor release. */
export async function waitForApiV2Deploy({
  repository,
  sha,
  get,
  compatible = apiInputsMatch,
  wait = () => setTimeout(30_000),
  attempts = 40,
}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const { workflow_runs: runs } = await get(
      `/repos/${repository}/actions/workflows/deploy-api-v2-sandbox.yml/runs?branch=v2-rewrite&per_page=1`,
    );
    const run = runs[0];
    if (run) {
      if (
        run.head_repository?.full_name !== repository ||
        run.head_branch !== "v2-rewrite" ||
        !["push", "workflow_dispatch"].includes(run.event) ||
        !Number.isSafeInteger(run.id) ||
        !Number.isSafeInteger(run.run_attempt) ||
        run.run_attempt < 1
      )
        throw new Error("API deployment gate: unexpected workflow identity");

      if (await compatible(run.head_sha, sha)) {
        if (run.status === "completed") {
          if (run.conclusion !== "success")
            throw new Error(`API deployment gate: API run ${run.id} ended ${run.conclusion}`);

          const { jobs } = await get(
            `/repos/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`,
          );
          const deploy = jobs.find((job) => job.name === "Build, Push & Deploy api_v2");
          if (
            deploy?.head_sha !== run.head_sha ||
            deploy?.conclusion !== "success" ||
            !["Wait and verify the running image", "Smoke test"].every((name) =>
              deploy.steps?.some((step) => step.name === name && step.conclusion === "success"),
            )
          )
            throw new Error("API deployment gate: successful ECS/image and smoke evidence is missing");

          return run.head_sha;
        }
      }
    }
    if (attempt + 1 < attempts) await wait();
  }
  throw new Error("API deployment gate timed out: no successful compatible API deployment");
}

async function main() {
  if (process.argv[2] === "--check-contract") {
    assertApiEditorContract(JSON.parse(readFileSync(process.argv[3], "utf8")));
    console.log("Deployed API supports numeric page versions and editing leases.");
    return;
  }
  const { GITHUB_REPOSITORY: repository, GITHUB_SHA: sha, GH_TOKEN: token, GITHUB_OUTPUT: output } = process.env;
  if (
    process.argv.length !== 2 ||
    !/^[\w.-]+\/[\w.-]+$/.test(repository ?? "") ||
    !/^[a-f0-9]{40}$/.test(sha ?? "") ||
    !token ||
    !output
  )
    throw new Error("API deployment gate: GitHub repository, commit, token and output are required");

  const deadline = AbortSignal.timeout(20 * 60_000);
  const deployed = await waitForApiV2Deploy({
    repository,
    sha,
    get: async (path) => {
      const response = await fetch(`https://api.github.com${path}`, {
        headers: { Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" },
        signal: AbortSignal.any([deadline, AbortSignal.timeout(15_000)]),
      });
      if (!response.ok) throw new Error(`API deployment gate: GitHub returned ${response.status}`);
      return response.json();
    },
    wait: () => setTimeout(30_000, undefined, { signal: deadline }),
  });
  appendFileSync(output, `api_sha=${deployed}\n`);
  console.log(`Compatible API deployment confirmed at ${deployed}. Verify the live image before releasing the editor.`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
