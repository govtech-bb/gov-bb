import { expect, test } from "vitest";
import {
  checkNativeCoverageEvidence,
  parseCoverageMatrix,
} from "../../scripts/check-native-form-coverage";
import { govbbFormEditor } from "../../src/presets/govbb-form";
import matrix from "../fixtures/forms/v2/capabilities.json";

test("every claimed installed capability has actual native definition and editor/Markdown round-trip evidence", () => {
  expect(checkNativeCoverageEvidence(govbbFormEditor, parseCoverageMatrix(matrix))).toEqual([]);
}, 60_000);
