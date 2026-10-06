import { $getNodeByKey } from "lexical";
import { Button } from "../../../ui/button";
import { $native } from "../../editor/native-state";
import { useRead } from "../../react/logic-hooks";
import { useSetSettings, type WidgetProps } from "../../react/widget-settings";
import { NativeLiteralEditor, NativeRichTextEditor } from "../logic/native-controls";
import { $nativeTargets, type NativeTargets } from "../logic/native-authoring";
import type { ChoiceConfig, QuestionOption } from "../../schema/types";

type Group = NonNullable<ChoiceConfig["groups"]>[number];

export function NativeGroupedChoices({ nodeKey }: WidgetProps) {
  const native = useRead(() => {
    const node = $getNodeByKey(nodeKey);

    return node ? $native(node) : {};
  });

  const targets = useRead($nativeTargets),
    set = useSetSettings(nodeKey);

  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- this module owns choice configuration; NativeGroupsEditor checks imported draft collections before rendering them.
  const config = native.question?.config as ChoiceConfig | undefined;

  return (
    <NativeGroupsEditor
      groups={config?.groups ?? []}
      options={native.options ?? []}
      targets={targets}
      onChange={(groups, options) => set({ nativeGroups: groups, nativeOptions: options })}
    />
  );
}

export function NativeGroupsEditor({
  groups,
  options,
  targets,
  onChange,
}: {
  groups: Group[];
  options: QuestionOption[];
  targets: NativeTargets;
  onChange(groups: Group[], options: QuestionOption[]): void;
}) {
  if (
    !Array.isArray(groups) ||
    !Array.isArray(options) ||
    groups.some(
      (group) => !group || typeof group !== "object" || !Array.isArray(group.optionIds),
    ) ||
    options.some((option) => !option || typeof option !== "object")
  )
    return (
      <div role="status">
        These categories need repair.{" "}
        <Button onClick={() => onChange([], [])}>Start new categories</Button>
      </div>
    );

  const updateGroup = (id: string, patch: Partial<Group>) =>
    onChange(
      groups.map((group) => (group.id === id ? { ...group, ...patch } : group)),
      options,
    );

  const updateOption = (id: string, patch: Partial<QuestionOption>) =>
    onChange(
      groups,
      options.map((option) => (option.id === id ? { ...option, ...patch } : option)),
    );

  return (
    <div
      className="mb-(--form-gap) space-y-3"
      onKeyDown={(event) => {
        if (!(event.metaKey || event.ctrlKey) && event.key !== "Escape") event.stopPropagation();
      }}
    >
      {groups.map((group, groupIndex) => (
        <section
          key={group.id}
          aria-label={`Category ${groupIndex + 1}`}
          className="space-y-3 rounded-sm border border-line p-3"
        >
          <NativeRichTextEditor
            label={`Category ${groupIndex + 1} label`}
            value={group.label}
            targets={targets}
            onChange={(label) => updateGroup(group.id, { label })}
          />
          <label className="flex items-center gap-2 text-14">
            <input
              type="checkbox"
              checked={group.higherRisk === true}
              onChange={(event) => updateGroup(group.id, { higherRisk: event.target.checked })}
            />
            Higher-risk category
          </label>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={groupIndex === 0}
              onClick={() => {
                const next = [...groups];
                [next[groupIndex - 1], next[groupIndex]] = [
                  next[groupIndex]!,
                  next[groupIndex - 1]!,
                ];
                onChange(next, options);
              }}
            >
              Move category up
            </Button>
            <Button
              size="sm"
              onClick={() =>
                onChange(
                  groups.filter((item) => item.id !== group.id),
                  options.filter((option) => !group.optionIds.includes(option.id)),
                )
              }
            >
              Remove category
            </Button>
          </div>
          <div className="space-y-3 border-s border-line ps-3">
            {group.optionIds.map((id, index) => {
              const option = options.find((option) => option.id === id);

              if (!option)
                return (
                  <p key={id} role="status">
                    This option is missing: {id}
                  </p>
                );

              return (
                <fieldset key={id} className="space-y-2 rounded-sm border border-line p-2">
                  <legend className="px-1 text-12">Option {index + 1}</legend>
                  <NativeRichTextEditor
                    label={`Category ${groupIndex + 1} option ${index + 1} label`}
                    value={option.label}
                    targets={targets}
                    onChange={(label) => updateOption(id, { label })}
                  />
                  <NativeLiteralEditor
                    label="Submitted value"
                    value={option.value}
                    onChange={(value) => updateOption(id, { value })}
                  />
                  <label className="flex items-center gap-2 text-14">
                    <input
                      type="checkbox"
                      checked={option.visible !== false}
                      onChange={(event) => updateOption(id, { visible: event.target.checked })}
                    />
                    Visible initially
                  </label>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={index === 0}
                      onClick={() => {
                        const optionIds = [...group.optionIds];
                        [optionIds[index - 1], optionIds[index]] = [
                          optionIds[index]!,
                          optionIds[index - 1]!,
                        ];
                        updateGroup(group.id, { optionIds });
                      }}
                    >
                      Move option up
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        onChange(
                          groups.map((item) =>
                            item.id === group.id
                              ? {
                                  ...item,
                                  optionIds: item.optionIds.filter((optionId) => optionId !== id),
                                }
                              : item,
                          ),
                          options.filter((item) => item.id !== id),
                        )
                      }
                    >
                      Remove option
                    </Button>
                  </div>
                </fieldset>
              );
            })}
          </div>
          <Button
            size="sm"
            onClick={() => {
              const id = crypto.randomUUID();
              onChange(
                groups.map((item) =>
                  item.id === group.id ? { ...item, optionIds: [...item.optionIds, id] } : item,
                ),
                [...options, { id, label: "New option", value: id }],
              );
            }}
          >
            Add option
          </Button>
        </section>
      ))}
      <Button
        onClick={() => {
          const id = crypto.randomUUID(),
            optionId = crypto.randomUUID();

          onChange(
            [...groups, { id, label: "New category", optionIds: [optionId] }],
            [...options, { id: optionId, label: "New option", value: optionId }],
          );
        }}
      >
        Add category
      </Button>
    </div>
  );
}
