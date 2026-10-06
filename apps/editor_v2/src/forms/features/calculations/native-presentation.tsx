import { $getNodeByKey, HISTORY_PUSH_TAG, SKIP_DOM_SELECTION_TAG, type NodeKey } from "lexical";
import { Sigma } from "@phosphor-icons/react";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import { pill, pillIcon, PillInput } from "../../../ui/pill";
import { Button } from "../../../ui/button";
import { $native } from "../../editor/native-state";
import { useEditableUpdate, useRead } from "../../react/logic-hooks";
import { focusPillInput, Pick } from "../../react/logic-pickers";
import type { CalculatedBlock } from "../../schema/types";
import { $nativeTargets, $setNativeWidget } from "../logic/native-authoring";
import {
  LogicPopover,
  NativeExpressionEditor,
  NativeExpressionPill,
  NativeInput,
} from "../logic/native-controls";

export function NativeCalculatedField({
  nodeKey,
  block,
}: {
  nodeKey: NodeKey;
  block: CalculatedBlock;
}) {
  const update = useEditableUpdate(),
    targets = useRead($nativeTargets);

  const editable = useLexicalEditable();

  const save = (patch: Partial<CalculatedBlock>) =>
    update(
      () => {
        const node = $getNodeByKey(nodeKey),
          latest = node && $native(node).calculated;

        if (!latest) return;
        const next = { ...latest, ...patch };

        for (const [key, value] of Object.entries(next))
          if (value === undefined) Reflect.deleteProperty(next, key);
        $setNativeWidget(nodeKey, next);
      },
      { tag: [SKIP_DOM_SELECTION_TAG, HISTORY_PUSH_TAG] },
    );

  return (
    <div
      className="native-authoring"
      data-native-calculated=""
      role="group"
      aria-label="Calculated value"
    >
      <div data-logic-editor-root="" className="relative min-w-0">
        <fieldset
          disabled={!editable}
          className="native-calculation-row min-w-0 items-center gap-1 border-0 p-0"
        >
          <legend className="sr-only">Calculated value</legend>
          <span data-logic-pill="" className={pill} onMouseDown={focusPillInput}>
            <span className={pillIcon}>
              <Sigma />
            </span>
            <PillInput
              label="Name"
              placeholder={
                block.key ||
                (/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(block.id)
                  ? "Field name"
                  : block.id)
              }
              value={block.name ?? ""}
              onChange={(name) => save({ name: name || undefined })}
            />
          </span>
          <Pick
            label="Value type"
            placeholder="Select type"
            value={block.valueType}
            items={[
              { value: "number", label: "Number" },
              { value: "string", label: "Text" },
              { value: "boolean", label: "Yes or no" },
              { value: "date", label: "Date" },
            ]}
            onChange={(valueType) => save({ valueType })}
          />
          {block.expression !== undefined ? (
            <>
              <NativeExpressionPill
                value={block.expression}
                targets={targets}
                label="Calculation"
                valueType={block.valueType}
                onChange={(expression) => save({ expression })}
              />
            </>
          ) : (
            <Button
              size="sm"
              onClick={() =>
                save({
                  expression:
                    block.valueType === "number" ? 0 : block.valueType === "boolean" ? false : "",
                })
              }
            >
              Initial value
            </Button>
          )}
          <LogicPopover label="Calculation settings">
            <div className="flex min-w-0 flex-col gap-3">
              <NativeInput
                label="Submitted answer key"
                value={block.key ?? ""}
                onChange={(key) => save({ key: key || undefined })}
              />
              <label className="flex items-center gap-2 text-14">
                <input
                  type="checkbox"
                  checked={block.expression !== undefined}
                  onChange={(event) =>
                    save({
                      expression: event.target.checked
                        ? block.valueType === "number"
                          ? 0
                          : block.valueType === "boolean"
                            ? false
                            : ""
                        : undefined,
                    })
                  }
                />
                Set an initial calculation
              </label>
              {block.expression !== undefined ? (
                <NativeExpressionEditor
                  value={block.expression}
                  targets={targets}
                  label="Calculation"
                  onChange={(expression) => save({ expression })}
                />
              ) : null}
              <label className="flex items-center gap-2 text-14">
                <input
                  type="checkbox"
                  checked={block.submit === true}
                  onChange={(event) => save({ submit: event.target.checked })}
                />
                Include this value with submitted answers
              </label>
            </div>
          </LogicPopover>
        </fieldset>
      </div>
    </div>
  );
}
