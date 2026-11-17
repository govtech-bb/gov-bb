import { expect, test } from "vitest";
import { existsSync } from "node:fs";
import {
  checkNativeFormCoverage,
  checkNativeCoverageEvidence,
  parseCoverageMatrix,
  type NativeCoverageMatrix,
} from "./check-native-form-coverage";
import { govbbFormEditor } from "../src/presets/govbb-form";
import manifest from "../tests/fixtures/forms/v2/capabilities.json";

const matrix = parseCoverageMatrix(manifest);

test("capability matrix declares completed installed native capabilities", () => {
  const result = checkNativeFormCoverage(govbbFormEditor, matrix, (path) =>
    existsSync(new URL(`../${path}`, import.meta.url)),
  );

  expect(result.errors).toEqual([]);
  expect(result.count).toBe(matrix.capabilities.length);
  expect(result.pending).toEqual([]);
});

test("coverage rejects missing owners, duplicate rows and changed discriminators", () => {
  const first = matrix.capabilities[0]!;

  const changed = {
    ...matrix,
    capabilities: [{ ...first, native: { kind: "unregistered" } }, ...matrix.capabilities],
  };

  const issues = checkNativeFormCoverage(govbbFormEditor, changed, () => false).errors;
  expect(issues.some((issue) => issue.includes("Duplicate capability"))).toBe(true);
  expect(issues.some((issue) => issue.includes("discriminator changed"))).toBe(true);
  expect(issues.some((issue) => issue.includes("Missing capability owner"))).toBe(true);
  expect(issues.some((issue) => issue.includes("Missing proof file"))).toBe(true);
  expect(
    checkNativeFormCoverage(
      govbbFormEditor,
      { ...matrix, capabilities: matrix.capabilities.slice(1) },
      () => true,
    ).errors,
  ).toContain(`Installed capability missing from matrix: ${first.category}:${first.name}`);
});

test("complete coverage requires native fixture evidence", () => {
  const first = matrix.capabilities[0]!;

  const changed: NativeCoverageMatrix = {
    ...matrix,
    capabilities: [{ ...first, status: "complete", fixtures: [] }, ...matrix.capabilities.slice(1)],
  };

  expect(checkNativeFormCoverage(govbbFormEditor, changed, () => true).errors).toContain(
    `No native round-trip fixture recorded for ${first.category}:${first.name}`,
  );
});

test("a proof inventory or a fixture without the claimed capability cannot satisfy coverage", () => {
  const boolean = matrix.capabilities.find(
    (row) => row.category === "field" && row.name === "boolean",
  )!;

  const claimed = { version: 1, capabilities: [boolean] };
  expect(
    checkNativeCoverageEvidence(govbbFormEditor, claimed, () => matrix, false).some((issue) =>
      issue.includes("Evidence must contain native"),
    ),
  ).toBe(true);

  const form = {
    schemaVersion: 2,
    id: "empty",
    title: "Empty",
    mode: "application",
    locale: "en-BB",
    timeZone: "America/Barbados",
    settings: { visibility: "draft", hiddenAnswers: "retain" },
    blocks: [{ id: "page", type: "page", role: "questions", title: "Page" }],
  };

  expect(checkNativeCoverageEvidence(govbbFormEditor, claimed, () => form, false)).toContain(
    "Native proof does not exercise field:boolean",
  );
});
