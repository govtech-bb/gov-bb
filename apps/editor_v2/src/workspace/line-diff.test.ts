import { expect, test } from "vitest";
import { lineDiff } from "./line-diff";

test("keeps the lines both versions share, and marks what one removes and the other adds", () => {
  expect(
    lineDiff("Intro\n\n## Fees\n\nTen dollars", "Intro\n\n## Costs\n\nTen dollars\nOr less"),
  ).toEqual([
    { kind: "same", text: "Intro" },
    { kind: "same", text: "" },
    { kind: "removed", text: "## Fees" },
    { kind: "added", text: "## Costs" },
    { kind: "same", text: "" },
    { kind: "same", text: "Ten dollars" },
    { kind: "added", text: "Or less" },
  ]);
});

test("an empty version is all added or all removed", () => {
  expect(lineDiff("", "New\n")).toEqual([
    { kind: "added", text: "New" },
    { kind: "added", text: "" },
  ]);
  expect(lineDiff("Old", "")).toEqual([{ kind: "removed", text: "Old" }]);
  expect(lineDiff("Same", "Same")).toEqual([{ kind: "same", text: "Same" }]);
});
