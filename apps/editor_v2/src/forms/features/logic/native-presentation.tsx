import { $getNodeByKey, HISTORY_PUSH_TAG, SKIP_DOM_SELECTION_TAG, type NodeKey } from "lexical";
import { ArrowDown, ArrowUp, Copy, Plus, Power, Trash } from "@phosphor-icons/react";
import { Button } from "../../../ui/button";
import { $native } from "../../editor/native-state";
import { useEditableUpdate, useRead } from "../../react/logic-hooks";
import { header, More } from "../../react/logic-pickers";
import type { LogicBlock, LogicRule } from "../../schema/types";
import { $nativeTargets, $setNativeWidget, newAction, newCondition } from "./native-authoring";
import { NativeActionRow, NativeConditionRow } from "./native-controls";

export function NativeConditionalLogic({
  nodeKey,
  block,
}: {
  nodeKey: NodeKey;
  block: LogicBlock;
}) {
  const update = useEditableUpdate();
  const targets = useRead($nativeTargets);

  const save = (rules: LogicRule[]) =>
    update(
      () => {
        const node = $getNodeByKey(nodeKey),
          latest = node && $native(node).logic;

        if (latest) $setNativeWidget(nodeKey, { ...latest, rules });
      },
      { tag: [SKIP_DOM_SELECTION_TAG, HISTORY_PUSH_TAG] },
    );

  if (
    !Array.isArray(block.rules) ||
    block.rules.some((rule) => !rule || typeof rule !== "object" || !Array.isArray(rule.actions))
  )
    return (
      <div className="native-authoring" role="status">
        These rules need repair. <Button onClick={() => save([])}>Start new rules</Button>
      </div>
    );

  const at = (index: number, rule: LogicRule) =>
    save(block.rules.map((old, position) => (position === index ? rule : old)));

  return (
    <div
      className="native-authoring group/logic"
      data-logic-block=""
      data-native-logic=""
      aria-label="Conditional logic"
      role="group"
      tabIndex={-1}
    >
      <div data-logic-editor-root="" className="relative min-w-0">
        <div className="flex flex-col gap-3">
          {block.rules.map((rule, index) => (
            <fieldset
              key={rule.id}
              className={index ? "min-w-0 border-t border-line pt-3" : "min-w-0"}
            >
              <legend className="sr-only">Rule {index + 1}</legend>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <div className={header}>
                    When
                    {block.rules.length > 1 && (
                      <span className="ml-1 text-12 font-normal">Rule {index + 1}</span>
                    )}
                    {rule.enabled === false && (
                      <span className="ml-1 text-12 font-normal">Disabled</span>
                    )}
                    <span className="native-rule-menu ml-auto opacity-0 group-hover/logic:opacity-100 focus-within:opacity-100">
                      <More
                        label={`Rule ${index + 1} options`}
                        size="sm"
                        items={[
                          [
                            "Add rule",
                            Plus,
                            () =>
                              save([
                                ...block.rules.slice(0, index + 1),
                                {
                                  id: crypto.randomUUID(),
                                  when: newCondition("eq"),
                                  actions: [newAction("setVisible")],
                                },
                                ...block.rules.slice(index + 1),
                              ]),
                          ],
                          [
                            rule.enabled === false ? "Enable rule" : "Disable rule",
                            Power,
                            () => at(index, { ...rule, enabled: rule.enabled === false }),
                          ],
                          index > 0 && [
                            "Move rule up",
                            ArrowUp,
                            () => {
                              const rules = [...block.rules];
                              [rules[index - 1], rules[index]] = [rules[index]!, rules[index - 1]!];
                              save(rules);
                            },
                          ],
                          index < block.rules.length - 1 && [
                            "Move rule down",
                            ArrowDown,
                            () => {
                              const rules = [...block.rules];
                              [rules[index], rules[index + 1]] = [rules[index + 1]!, rules[index]!];
                              save(rules);
                            },
                          ],
                          [
                            "Duplicate rule",
                            Copy,
                            () =>
                              save([
                                ...block.rules.slice(0, index + 1),
                                { ...structuredClone(rule), id: crypto.randomUUID() },
                                ...block.rules.slice(index + 1),
                              ]),
                          ],
                          [
                            `Remove rule ${index + 1}`,
                            Trash,
                            () => save(block.rules.filter((_, position) => position !== index)),
                          ],
                        ]}
                      />
                    </span>
                  </div>
                  <NativeConditionRow
                    value={rule.when}
                    targets={targets}
                    name="Condition"
                    onChange={(when) => at(index, { ...rule, when })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <div className={header}>Then</div>
                  {rule.actions.map((action, actionIndex) => (
                    <div key={actionIndex} className="flex min-w-0 items-start gap-1">
                      <NativeActionRow
                        value={action}
                        targets={targets}
                        onChange={(next) =>
                          at(index, {
                            ...rule,
                            actions: rule.actions.map((old, position) =>
                              position === actionIndex ? next : old,
                            ),
                          })
                        }
                      />
                      <More
                        label={`Action ${actionIndex + 1} options`}
                        size="sm"
                        items={[
                          [
                            "Add action",
                            Plus,
                            () =>
                              at(index, {
                                ...rule,
                                actions: [
                                  ...rule.actions.slice(0, actionIndex + 1),
                                  newAction("setVisible"),
                                  ...rule.actions.slice(actionIndex + 1),
                                ],
                              }),
                          ],
                          actionIndex > 0 && [
                            "Move action up",
                            ArrowUp,
                            () => {
                              const actions = [...rule.actions];
                              [actions[actionIndex - 1], actions[actionIndex]] = [
                                actions[actionIndex]!,
                                actions[actionIndex - 1]!,
                              ];
                              at(index, { ...rule, actions });
                            },
                          ],
                          [
                            `Remove action ${actionIndex + 1}`,
                            Trash,
                            () =>
                              at(index, {
                                ...rule,
                                actions: rule.actions.filter(
                                  (_, position) => position !== actionIndex,
                                ),
                              }),
                          ],
                        ]}
                      />
                    </div>
                  ))}
                  {!rule.actions.length && (
                    <Button
                      size="sm"
                      icon={<Plus />}
                      onClick={() => at(index, { ...rule, actions: [newAction("setVisible")] })}
                    >
                      Add action
                    </Button>
                  )}
                </div>
              </div>
            </fieldset>
          ))}
          {!block.rules.length && (
            <Button
              size="sm"
              icon={<Plus />}
              className="self-start"
              onClick={() =>
                save([
                  ...block.rules,
                  {
                    id: crypto.randomUUID(),
                    when: newCondition("eq"),
                    actions: [newAction("setVisible")],
                  },
                ])
              }
            >
              Add rule
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
