import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// Lints fixtures with the real root .oxlintrc.json and plugin, copied into a
// temp dir laid out like the repo. That exercises the override's path globs and
// the jsPlugins path as well as the rule, so a broken glob fails here too.
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const UI = "apps/form_builder/app/components/ui";
const RULE = "govtech(semantic-colors)";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "semantic-colors-"));
  cpSync(path.join(ROOT, ".oxlintrc.json"), path.join(dir, ".oxlintrc.json"));
  cpSync(
    path.join(ROOT, "scripts/oxlint/semantic-colors.mjs"),
    path.join(dir, "scripts/oxlint/semantic-colors.mjs"),
  );
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** The lines oxlint reports `govtech(semantic-colors)` on in `file`. */
function reportedLines(file: string, lines: string[]): number[] {
  const abs = path.join(dir, file);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, lines.join("\n") + "\n");
  const { stdout } = spawnSync(
    path.join(ROOT, "node_modules/.bin/oxlint"),
    ["-c", ".oxlintrc.json", "-f", "json", file],
    { cwd: dir, encoding: "utf8" },
  );
  const { diagnostics } = JSON.parse(stdout) as {
    diagnostics: { code: string; labels: { span: { line: number } }[] }[];
  };
  return diagnostics
    .filter((d) => d.code === RULE)
    .map((d) => d.labels[0].span.line);
}

describe("govtech/semantic-colors", () => {
  it("reports raw palette, dark: and arbitrary colours in the UI kit, not tokens", () => {
    expect(
      reportedLines(`${UI}/fixture.tsx`, [
        'export const a = () => <div className="bg-red-500" />;',
        "export const b = `p-2 dark:bg-surface`;",
        'export const c = cx("text-[#fff]");',
        "export const d = (x: string) => `text-white ${x}`;",
        'export const ok = "bg-surface text-ink";',
      ]),
    ).toEqual([1, 2, 3, 4]);
  });

  it("covers the UI catalogue and dev routes", () => {
    const raw = ['export const a = "bg-blue-600";'];
    expect(
      reportedLines("apps/form_builder/app/routes/-ui-catalogue.tsx", raw),
    ).toEqual([1]);
    expect(
      reportedLines("apps/form_builder/app/routes/dev.ui.tsx", raw),
    ).toEqual([1]);
  });

  it("leaves code outside the UI kit alone", () => {
    expect(
      reportedLines("apps/form_builder/app/routes/builder/page.tsx", [
        'export const a = "bg-red-500 dark:text-white";',
      ]),
    ).toEqual([]);
  });
});
