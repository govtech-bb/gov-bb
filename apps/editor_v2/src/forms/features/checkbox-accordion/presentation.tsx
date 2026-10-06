import { ArrowDown, ArrowUp, Plus, Trash } from "@phosphor-icons/react";
import { useRef } from "react";
import { Button } from "../../../ui/button";
import {
  compileGroups,
  groupedChoices,
  moveItem,
  newGroup,
  newGroupOption,
  type GroupDraft,
} from "./groups";
import { useSetSettings, type WidgetProps } from "../../react/widget-settings";
import { $getNodeByKey } from "lexical";
import { useRead } from "../../react/logic-hooks";
import { $native } from "../../editor/native-state";
import { NativeGroupedChoices } from "./native-presentation";

const input =
  "min-w-0 rounded-sm bg-white px-2 py-1 text-16 text-ink shadow-input outline-none focus:shadow-input-focus";

export function GroupedChoices(props: WidgetProps) {
  const native = useRead(() => {
    const node = $getNodeByKey(props.nodeKey);

    return node ? !!$native(node).question : false;
  });

  return native ? <NativeGroupedChoices {...props} /> : <LegacyGroupedChoices {...props} />;
}

function LegacyGroupedChoices({ nodeKey, settings }: WidgetProps) {
  const set = useSetSettings(nodeKey);
  const groups = groupedChoices(settings);
  const root = useRef<HTMLDivElement>(null);
  const values = compileGroups(groups).options;

  const save = (next: GroupDraft[], focus?: string) => {
    const identityOrder = (items: GroupDraft[]) =>
      items
        .map((group) => [group.id, ...group.options.map((option) => option.id)].join(":"))
        .join(";");

    set({ groups: next }, identityOrder(groups) !== identityOrder(next));

    if (focus)
      requestAnimationFrame(() =>
        root.current?.querySelector<HTMLElement>(`[data-focus="${focus}"]`)?.focus(),
      );
  };

  const update = (id: string, patch: Partial<GroupDraft>) =>
    save(groups.map((group) => (group.id === id ? { ...group, ...patch } : group)));

  return (
    <div
      ref={root}
      className="relative mb-(--form-gap) space-y-3"
      onKeyDown={(event) => {
        if (!(event.metaKey || event.ctrlKey) && event.key !== "Escape") event.stopPropagation();
      }}
    >
      <span data-optional="" hidden aria-hidden="true" className="text-16 text-muted">
        (optional)
      </span>
      {groups.map((group, groupIndex) => (
        <section
          key={group.id}
          aria-label={`Category ${groupIndex + 1}`}
          className="rounded-sm border-2 border-line bg-white p-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-2 font-bold">
              <span className="sr-only">Category label</span>
              <input
                aria-label={`Category ${groupIndex + 1} label`}
                data-focus={group.id}
                className={`${input} w-full font-bold`}
                value={group.label}
                onChange={(event) => update(group.id, { label: event.target.value })}
              />
            </label>
            <Button
              icon={<ArrowUp />}
              aria-label={`Move category ${groupIndex + 1} up`}
              disabled={groupIndex === 0}
              onClick={() => save(moveItem(groups, groupIndex, -1))}
            />
            <Button
              icon={<ArrowDown />}
              aria-label={`Move category ${groupIndex + 1} down`}
              disabled={groupIndex === groups.length - 1}
              onClick={() => save(moveItem(groups, groupIndex, 1))}
            />
            <Button
              icon={<Trash />}
              aria-label={`Remove category ${groupIndex + 1}`}
              onClick={() =>
                save(
                  groups.filter((item) => item.id !== group.id),
                  groups[groupIndex + 1]?.id ?? groups[groupIndex - 1]?.id ?? "add-category",
                )
              }
            />
          </div>
          <label className="mt-2 flex items-center gap-2 text-14">
            <input
              type="checkbox"
              checked={!!group.higherRisk}
              onChange={(event) => {
                const next = { ...group };

                if (event.target.checked) next.higherRisk = true;
                else delete next.higherRisk;
                update(group.id, next);
              }}
              className="accent-interactive"
            />{" "}
            Higher-risk category{" "}
            <span className="text-12 text-muted">Marks this category for case review</span>
          </label>
          <div className="mt-3 space-y-2 border-s-4 border-line ps-3">
            {group.options.map((option, index) => {
              const value = values.find((item) => item.id === option.id)?.value ?? "";

              const error =
                option.optionValue !== undefined &&
                (!option.optionValue.trim() ||
                  values.some((other) => other.id !== option.id && other.value === value));

              return (
                <div key={option.id} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      data-drawn=""
                      className="size-5 shrink-0 border-2 border-ink"
                    />
                    <input
                      aria-label={`Category ${groupIndex + 1} option ${index + 1} label`}
                      data-focus={option.id}
                      className={`${input} flex-1`}
                      value={option.label}
                      onChange={(event) =>
                        update(group.id, {
                          options: group.options.map((item) =>
                            item.id === option.id ? { ...item, label: event.target.value } : item,
                          ),
                        })
                      }
                    />
                    <Button
                      icon={<ArrowUp />}
                      aria-label={`Move option ${index + 1} up in category ${groupIndex + 1}`}
                      disabled={index === 0}
                      onClick={() =>
                        update(group.id, { options: moveItem(group.options, index, -1) })
                      }
                    />
                    <Button
                      icon={<ArrowDown />}
                      aria-label={`Move option ${index + 1} down in category ${groupIndex + 1}`}
                      disabled={index === group.options.length - 1}
                      onClick={() =>
                        update(group.id, { options: moveItem(group.options, index, 1) })
                      }
                    />
                    <Button
                      icon={<Trash />}
                      aria-label={`Remove option ${index + 1} from category ${groupIndex + 1}`}
                      onClick={() =>
                        save(
                          groups.map((item) =>
                            item.id === group.id
                              ? {
                                  ...item,
                                  options: item.options.filter((item) => item.id !== option.id),
                                }
                              : item,
                          ),
                          group.options[index + 1]?.id ?? group.options[index - 1]?.id ?? group.id,
                        )
                      }
                    />
                  </div>
                  <label className="ms-7 flex flex-wrap items-center gap-2 text-12 text-muted">
                    Value {option.optionValue === undefined && <span>auto</span>}
                    <input
                      aria-label={`Category ${groupIndex + 1} option ${index + 1} value`}
                      className={`${input} w-44 font-mono text-12`}
                      value={option.optionValue ?? ""}
                      placeholder={value}
                      aria-invalid={error}
                      onChange={(event) =>
                        update(group.id, {
                          options: group.options.map((item) => {
                            if (item.id !== option.id) return item;
                            const next = { ...item };

                            if (event.target.value) next.optionValue = event.target.value;
                            else delete next.optionValue;

                            return next;
                          }),
                        })
                      }
                    />
                    {error && (
                      <span className="text-error">
                        Use a nonblank value unique to this question
                      </span>
                    )}
                  </label>
                </div>
              );
            })}
            {group.options.length === 1 && group.options[0]!.label !== group.label && (
              <p className="text-12 leading-4 text-muted">
                With one option, people see the category label “{group.label}”. The option value
                stays the same.
              </p>
            )}
            <Button
              icon={<Plus />}
              onClick={() => {
                const option = newGroupOption(`Option ${group.options.length + 1}`);
                save(
                  groups.map((item) =>
                    item.id === group.id ? { ...item, options: [...item.options, option] } : item,
                  ),
                  option.id,
                );
              }}
            >
              Add option<span className="sr-only"> to category {groupIndex + 1}</span>
            </Button>
          </div>
        </section>
      ))}
      <Button
        data-focus="add-category"
        icon={<Plus />}
        onClick={() => {
          const group = newGroup();
          save([...groups, group], group.id);
        }}
      >
        Add category
      </Button>
    </div>
  );
}

export function CheckboxAccordionPreview({ options = [] }: { options?: string[] }) {
  const control = "rounded-sm border-2 border-ink bg-input";

  return (
    <div className="space-y-3">
      <div className="border-2 border-line p-3">
        <strong>Category</strong>
        <div className="mt-2 space-y-2 ps-3">
          {options.map((label) => (
            <div key={label} className="flex items-center gap-2">
              <span className={`${control} size-5`} />
              {label}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 border-2 border-line p-3">
        <span className={`${control} size-5`} />
        <strong>Single-option category</strong>
      </div>
    </div>
  );
}
