import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { main } from "./validate-recipe-removals";

const RECIPES = "apps/api/src/forms/form-definitions/recipes";
const FILE = `${RECIPES}/x.json`;

const webhook = {
  type: "webhook",
  config: { mapping: { programmeCode: "P" } },
};
const withWebhook = { formId: "x", steps: [], processors: [webhook] };
const without = { formId: "x", steps: [], processors: [] };

// A throwaway repo: `main` holds a recipe with a webhook, each test edits the
// `change` branch's working tree and runs the CLI with `--base main`.
describe("validate-recipe-removals main", () => {
  let repo: string;
  const git = (...args: string[]) =>
    execFileSync(
      "git",
      ["-c", "user.name=spec", "-c", "user.email=spec@example.test", ...args],
      { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
  const write = (file: string, text: string) =>
    writeFileSync(path.join(repo, file), text);
  const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
  const run = () => main(["--base", "main"], repo);

  beforeAll(() => {
    repo = mkdtempSync(path.join(tmpdir(), "removal-guard-"));
    mkdirSync(path.join(repo, RECIPES), { recursive: true });
    git("init", "-q");
    git("checkout", "-q", "-b", "main");
    write(FILE, json(withWebhook));
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    git("checkout", "-q", "-b", "change");
  });

  beforeEach(() => {
    git("reset", "-q", "--hard", "main");
    git("clean", "-fdq");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("exits 0 when a changed recipe keeps its webhook", () => {
    write(FILE, json({ ...withWebhook, title: "X" }));
    expect(run()).toBe(0);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Checked 1 changed recipe file(s)"),
    );
  });

  it("exits 1 and names the file when a webhook is dropped", () => {
    write(FILE, json(without));
    expect(run()).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining(`${FILE}: removes webhook processors`),
    );
  });

  it("skips an `after` that is not JSON", () => {
    write(FILE, "{ not json");
    expect(run()).toBe(0);
  });

  it("checks an `after` against nothing when the base is not JSON", () => {
    write(FILE, "{ not json");
    git("commit", "-q", "-am", "broken");
    git("branch", "-f", "broken-base");
    write(FILE, json(without));
    expect(main(["--base", "broken-base"], repo)).toBe(0);
  });

  it("checks a renamed-and-edited recipe as an added file", () => {
    git("mv", FILE, `${RECIPES}/y.json`);
    // A small edit, so git's rename detection would pair it with x.json.
    write(`${RECIPES}/y.json`, json({ ...withWebhook, title: "Y" }));
    git("add", "-A");
    expect(run()).toBe(0);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Checked 1 changed recipe file(s)"),
    );
  });

  it("exits 2 on a base it cannot resolve", () => {
    expect(main(["--base", "no-such-branch"], repo)).toBe(2);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringMatching(/merge base/),
    );
  });
});
