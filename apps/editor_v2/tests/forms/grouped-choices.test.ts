import { expect, test } from "vitest";
import {
  compileGroups,
  copyGroups,
  groupIssues,
  groupedChoices,
  moveItem,
  newGroup,
} from "../../src/forms/features/checkbox-accordion/groups";

test("option values allocate across categories and explicit collisions remain reviewable", () => {
  const groups = [newGroup(), newGroup()];
  groups[0]!.options[0]!.label = "Yes";
  groups[1]!.options[0]!.label = "Yes";
  const compiled = compileGroups(groups);
  expect(compiled.options.map((option) => option.value)).toEqual([
    "yes",
    "option-2",
    "yes-2",
    "option-2-2",
  ]);
  groups[0]!.options[0]!.optionValue = "pinned";
  groups[1]!.options[0]!.optionValue = "pinned";
  expect(compileGroups(groups).options.filter((option) => option.value === "pinned")).toHaveLength(
    2,
  );
});

test("move, delete and duplicate preserve category content and regenerate only identities", () => {
  const groups = [newGroup(), newGroup()];
  groups[0]!.higherRisk = true;
  groups[0]!.options[0]!.optionValue = "stable";
  const moved = moveItem(groups, 0, 1);
  expect(moved[1]).toBe(groups[0]);
  expect(groups[0]!.higherRisk).toBe(true);
  expect(moveItem(groups[0]!.options, 1, -1)[0]).toBe(groups[0]!.options[1]);
  expect(moveItem(groups, 0, -1)).toBe(groups);
  const copies = copyGroups(groups);
  expect(copies[0]!.id).not.toBe(groups[0]!.id);
  expect(copies[0]!.options[0]!.id).not.toBe(groups[0]!.options[0]!.id);
  expect(copies[0]!.higherRisk).toBe(true);
  expect(copies[0]!.options[0]!.optionValue).toBe("stable");
  const remaining = compileGroups(groups.filter((group) => group.id !== groups[0]!.id));
  expect(remaining.groups).toHaveLength(1);
  expect(remaining.options).toHaveLength(2);
});

test("malformed groups and broken membership produce stable-location errors", () => {
  for (const groups of [
    null,
    "bad",
    [{}],
    [{ id: "a", label: "A", higherRisk: "yes", options: [] }],
  ]) {
    expect(groupedChoices({ groups })).toEqual([]);
    expect(groupIssues([], [], "question")[0]!.where).toBe("question");
  }

  const group = newGroup();
  group.label = "";
  const compiled = compileGroups([group]);
  compiled.groups[0]!.optionIds = [compiled.options[0]!.id, compiled.options[0]!.id, "missing"];
  const issues = groupIssues(compiled.groups, compiled.options, "question");
  expect(
    issues.some((issue) => issue.message === "Enter a category label" && issue.where === group.id),
  ).toBe(true);
  expect(issues.filter((issue) => issue.message.startsWith("Each option must"))).toHaveLength(2);
  expect(issues.some((issue) => issue.message === "Assign this option to a category")).toBe(true);
  expect(
    groupIssues([{ ...compiled.groups[0]!, optionIds: [] }], [], "question").some((issue) =>
      issue.message.startsWith("Add at least"),
    ),
  ).toBe(true);
});
