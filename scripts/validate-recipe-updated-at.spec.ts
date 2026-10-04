import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import {
  checkUpdatedAtBumped,
  isFlatRecipeFile,
  run,
} from "./validate-recipe-updated-at";

const RECIPES = "apps/api/src/forms/form-definitions/recipes";
const WHERE = `${RECIPES}/passport-renewal.json`;
// The guard's clock, frozen so "the future" is deterministic.
const NOW = new Date("2026-10-04T12:00:00.000Z");

const base = {
  formId: "passport-renewal",
  title: "Passport Renewal",
  steps: [{ stepId: "your-details", title: "Your details", elements: [] }],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-05-22T00:00:00.000Z",
};
const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
const check = (
  before: string | null,
  after: string,
  bounds: { floor?: string | null; now?: Date } = {},
) =>
  checkUpdatedAtBumped(before, after, WHERE, {
    floor: null,
    now: NOW,
    ...bounds,
  });

describe("checkUpdatedAtBumped", () => {
  it("passes a recipe file the base revision does not have", () => {
    expect(check(null, json(base))).toBeNull();
  });

  it("passes an unchanged file", () => {
    expect(check(json(base), json(base))).toBeNull();
  });

  it("passes a change that only moves updatedAt", () => {
    const after = { ...base, updatedAt: "2026-09-01T00:00:00.000Z" };
    expect(check(json(base), json(after))).toBeNull();
  });

  it("passes a formatting-only change — key order and whitespace are not content", () => {
    const reordered = JSON.stringify({
      updatedAt: base.updatedAt,
      steps: base.steps,
      title: base.title,
      createdAt: base.createdAt,
      formId: base.formId,
    });
    expect(check(json(base), reordered)).toBeNull();
  });

  it("passes a content change whose updatedAt moved forward", () => {
    const after = {
      ...base,
      title: "Renew a passport",
      updatedAt: "2026-09-01T00:00:00.000Z",
    };
    expect(check(json(base), json(after))).toBeNull();
  });

  it("fails a content change whose updatedAt did not move, naming the file and the stale stamp", () => {
    const after = { ...base, title: "Renew a passport" };
    const error = check(json(base), json(after));
    expect(error).toContain(WHERE);
    expect(error).toContain("updatedAt");
    expect(error).toContain("2026-05-22T00:00:00.000Z");
  });

  it("fails a content change whose updatedAt moved backwards", () => {
    // A revert pasted from an older copy: the content did change against the
    // base, and the builder needs a NEWER stamp for a draft row to re-sync.
    const after = {
      ...base,
      title: "Renew a passport",
      updatedAt: "2026-01-15T00:00:00.000Z",
    };
    expect(check(json(base), json(after))).toContain("moved back");
  });

  it("passes a content change that gives a recipe without updatedAt its first stamp", () => {
    const { updatedAt: _stamp, ...unstamped } = base;
    const after = { ...base, title: "Renew a passport" };
    expect(check(json(unstamped), json(after))).toBeNull();
  });

  it("fails a content change that leaves the recipe without an updatedAt", () => {
    const { updatedAt: _stamp, ...after } = { ...base, title: "Renew" };
    expect(check(json(base), json(after))).toContain("missing");
  });

  it("fails a content change whose updatedAt is not a date", () => {
    const after = { ...base, title: "Renew", updatedAt: "last Tuesday" };
    expect(check(json(base), json(after))).toContain("not a date");
  });

  it("reports a file that is not valid JSON instead of throwing", () => {
    expect(check(json(base), "{ not json")).toContain("invalid JSON");
  });

  // The bounds: a stamp describes the time of an edit, so it can neither
  // predate the recipe's last change on the base nor lie in the future.
  describe("bounds", () => {
    const FLOOR = "2026-10-03T09:00:00.000Z"; // the recipe's last change on the base

    it("fails a content change stamped before the base revision — a 1 ms bump of an old stamp", () => {
      const after = {
        ...base,
        title: "Renew a passport",
        updatedAt: "2026-05-22T00:00:00.001Z",
      };
      const error = check(json(base), json(after), { floor: FLOOR });
      expect(error).toContain("earlier than");
      expect(error).toContain(FLOOR);
      expect(error).toContain(NOW.toISOString()); // the suggested value
    });

    it("passes a content change stamped at or after the base revision", () => {
      const after = { ...base, title: "Renew a passport", updatedAt: FLOOR };
      expect(check(json(base), json(after), { floor: FLOOR })).toBeNull();
    });

    it("passes a stamp-only change that moves behind the base revision — the backfill", () => {
      // Content unchanged, stamp set to an old commit date: legitimate.
      const after = { ...base, updatedAt: "2026-05-01T00:00:00.000Z" };
      expect(check(json(base), json(after), { floor: FLOOR })).toBeNull();
    });

    it("fails a stamp in the future, even when only the stamp moved", () => {
      const after = { ...base, updatedAt: "2062-10-04T12:00:00.000Z" };
      const error = check(json(base), json(after));
      expect(error).toContain("in the future");
      expect(error).toContain(NOW.toISOString());
    });

    it("fails a content change stamped in the future", () => {
      const after = {
        ...base,
        title: "Renew a passport",
        updatedAt: "2062-10-04T12:00:00.000Z",
      };
      expect(check(json(base), json(after))).toContain("in the future");
    });

    it("allows a few minutes of clock skew", () => {
      const after = {
        ...base,
        title: "Renew a passport",
        updatedAt: new Date(NOW.getTime() + 2 * 60_000).toISOString(),
      };
      expect(check(json(base), json(after))).toBeNull();
    });
  });
});

describe("isFlatRecipeFile", () => {
  it("accepts only the canonical flat recipes/{formId}.json files", () => {
    expect(isFlatRecipeFile(`${RECIPES}/passport-renewal.json`)).toBe(true);
    // Legacy versioned fallback files are frozen — never checked.
    expect(isFlatRecipeFile(`${RECIPES}/passport-renewal/1.2.0.json`)).toBe(
      false,
    );
    expect(isFlatRecipeFile(`${RECIPES}/.gitkeep`)).toBe(false);
    expect(isFlatRecipeFile("services/passport-renewal.json")).toBe(false);
  });
});

// The two modes against a real (temporary) repository: `--base` diffs the
// merge base with the working tree, `--staged` diffs HEAD with the index for
// the absolute paths lint-staged passes.
describe("run", () => {
  let repo: string;
  const file = `${RECIPES}/passport-renewal.json`;
  const git = (...args: string[]) =>
    execFileSync(
      "git",
      ["-c", "user.name=spec", "-c", "user.email=spec@example.test", ...args],
      { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
  const write = (recipe: unknown) =>
    writeFileSync(path.join(repo, file), json(recipe));
  const now = () => new Date().toISOString();

  beforeAll(() => {
    repo = mkdtempSync(path.join(tmpdir(), "updated-at-guard-"));
    mkdirSync(path.join(repo, RECIPES), { recursive: true });
    git("init", "-q");
    git("checkout", "-q", "-b", "main");
    write(base);
    git("add", "-A");
    // Committed well after its stamp, as the backfill landed after the dates
    // it wrote: the base commit is the recipe's last change on main.
    process.env.GIT_COMMITTER_DATE = "2026-09-01T00:00:00Z";
    try {
      git("commit", "-q", "-m", "base");
    } finally {
      delete process.env.GIT_COMMITTER_DATE;
    }
    git("checkout", "-q", "-b", "change");
  });

  afterAll(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("--base: passes a committed content change stamped after the merge base", () => {
    write({ ...base, title: "Renew a passport", updatedAt: now() });
    git("commit", "-q", "-am", "retitle");

    expect(run(["--base", "main"], { cwd: repo })).toEqual({
      checked: 1,
      errors: [],
    });
  });

  it("--base: fails an uncommitted content change that kept the merge base's stamp", () => {
    // Judged against the merge base, not HEAD: the working tree goes back to
    // the base's stamp with a new title.
    write({ ...base, title: "Renew a passport again" });

    const result = run(["--base", "main"], { cwd: repo });
    expect(result.checked).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain(file);
    expect(result.errors[0]).toContain("was not bumped");
  });

  it("--staged: judges the index against HEAD for the absolute paths lint-staged passes", () => {
    const stamp = JSON.parse(git("show", "HEAD:" + file)).updatedAt as string;
    write({ ...base, title: "Renew a passport again", updatedAt: stamp });
    git("add", "-A");
    const absolute = path.join(repo, file);

    const unbumped = run(["--staged", absolute], { cwd: repo });
    expect(unbumped.checked).toBe(1);
    expect(unbumped.errors[0]).toContain("was not bumped");

    write({ ...base, title: "Renew a passport again", updatedAt: now() });
    git("add", "-A");
    expect(run(["--staged", absolute], { cwd: repo })).toEqual({
      checked: 1,
      errors: [],
    });
  });

  it("--staged: passes a recipe that HEAD does not have", () => {
    const added = `${RECIPES}/brand-new.json`;
    writeFileSync(
      path.join(repo, added),
      json({ ...base, formId: "brand-new", updatedAt: now() }),
    );
    git("add", "-A");

    expect(run(["--staged", path.join(repo, added)], { cwd: repo })).toEqual({
      checked: 1,
      errors: [],
    });
  });

  it("--base: fails a content change that bumps an old stamp by 1 ms", () => {
    // The base commit is the recipe's last change, so a stamp before it is a
    // token bump, not the time of this edit.
    write({
      ...base,
      title: "Renew a passport, again",
      updatedAt: "2026-05-22T00:00:00.001Z",
    });

    const { errors } = run(["--base", "main"], { cwd: repo });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("earlier than");
    git("checkout", "--", file);
  });

  it("--base: an unrelated commit on the base does not raise the floor, as on CI's merge ref", () => {
    // CI checks out the PR merged into main, so the merge base is main's tip.
    // A later commit there that does not touch the recipe must not make the
    // PR's earlier stamp "stale".
    const stamped = new Date(Date.now() - 60 * 60_000).toISOString();
    write({
      ...base,
      title: "Renew a passport (merge ref)",
      updatedAt: stamped,
    });
    git("commit", "-q", "-am", "stamped an hour ago");
    git("checkout", "-q", "main");
    writeFileSync(path.join(repo, "unrelated.txt"), "later\n");
    git("add", "-A");
    git("commit", "-q", "-m", "unrelated, committed now");
    git("checkout", "-q", "change");
    git("merge", "-q", "--no-edit", "main");

    expect(run(["--base", "main"], { cwd: repo }).errors).toEqual([]);
  });

  it("--base: refuses an unknown base ref with a clear error", () => {
    expect(() => run(["--base", "no-such-branch"], { cwd: repo })).toThrow(
      /merge base/,
    );
  });
});
