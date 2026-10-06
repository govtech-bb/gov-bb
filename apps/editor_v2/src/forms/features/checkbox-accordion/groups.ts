import type { Settings } from "../../core/settings";
import { autoId, resolveIds } from "../../core/identities";

export type GroupOption = { id: string; label: string; optionValue?: string };

export type GroupDraft = { id: string; label: string; higherRisk?: true; options: GroupOption[] };

import type { ChoiceGroup } from "../../core/choice-groups";

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** Invalid imports stay visible as a preflight error; never invent identities while reading. */
export function groupedChoices(settings: Settings): GroupDraft[] {
  const groups = settings.groups;

  if (
    !Array.isArray(groups) ||
    !groups.every(
      (group): group is GroupDraft =>
        record(group) &&
        typeof group.id === "string" &&
        typeof group.label === "string" &&
        (group.higherRisk === undefined || group.higherRisk === true) &&
        Array.isArray(group.options) &&
        group.options.every(
          (option) =>
            record(option) &&
            typeof option.id === "string" &&
            typeof option.label === "string" &&
            (option.optionValue === undefined || typeof option.optionValue === "string"),
        ),
    )
  )
    return [];

  return groups;
}

export const newGroupOption = (label = "Option"): GroupOption => ({
  id: crypto.randomUUID(),
  label,
});

export const newGroup = (): GroupDraft => ({
  id: crypto.randomUUID(),
  label: "Category",
  options: [newGroupOption("Option 1"), newGroupOption("Option 2")],
});

export const copyGroups = (groups: GroupDraft[]): GroupDraft[] =>
  groups.map((group) => ({
    ...group,
    id: crypto.randomUUID(),
    options: group.options.map((option) => ({ ...option, id: crypto.randomUUID() })),
  }));

export function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const destination = index + direction;

  if (index < 0 || destination < 0 || destination >= items.length) return items;
  const next = [...items];
  [next[index], next[destination]] = [next[destination]!, next[index]!];

  return next;
}

export function compileGroups(groups: GroupDraft[]) {
  const items = groups.flatMap((group) => group.options);

  const resolved = resolveIds(
    items.map((option, index) => ({
      key: option.id,
      pinned: option.optionValue,
      auto: autoId(option.label, `option-${index + 1}`, "option-"),
    })),
    new Set(),
    (value) => !!value.trim(),
  );

  return {
    groups: groups.map(({ id, label, higherRisk, options }): ChoiceGroup => ({
      id,
      label,
      ...(higherRisk && { higherRisk }),
      optionIds: options.map((option) => option.id),
    })),
    // An explicit collision is an authoring error, rather than a silently changed selection value.
    options: items.map((option) => ({
      id: option.id,
      label: option.label,
      value: option.optionValue ?? resolved.get(option.id)!.id,
    })),
  };
}

export function groupIssues(
  groups: ChoiceGroup[] | undefined,
  options: { id: string; label: string; value: string }[],
  questionId: string,
) {
  const issues: { code: string; message: string; where: string }[] = [];

  const add = (message: string, where = questionId) =>
    issues.push({ code: "choice-group", message, where });

  if (!Array.isArray(groups) || !groups.length) {
    add(
      "Add a category with at least one option; check that imported categories have valid labels and identities",
    );

    return issues;
  }

  const identities = new Set<string>();
  const assigned = new Set<string>();
  const available = new Set(options.map((option) => option.id));

  for (const group of groups) {
    if (
      !record(group) ||
      typeof group.id !== "string" ||
      typeof group.label !== "string" ||
      !Array.isArray(group.optionIds) ||
      (group.higherRisk !== undefined && group.higherRisk !== true)
    ) {
      add("This category has an invalid structure");
      continue;
    }

    if (!group.id || identities.has(group.id))
      add("Each category needs its own stable identity", group.id || questionId);
    identities.add(group.id);

    if (!group.label.trim()) add("Enter a category label", group.id);

    if (!group.optionIds.length) add("Add at least one option to this category", group.id);

    for (const id of group.optionIds) {
      if (typeof id !== "string" || !available.has(id) || assigned.has(id))
        add("Each option must belong to exactly one category in this question", group.id);
      assigned.add(id);
    }
  }

  for (const option of options) {
    if (!option.id || identities.has(option.id))
      add("Each option needs its own stable identity", option.id || questionId);
    identities.add(option.id);

    if (!assigned.has(option.id)) add("Assign this option to a category", option.id);

    if (!option.label.trim()) add("Enter an option label", option.id);
  }

  return issues;
}
