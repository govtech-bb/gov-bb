import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ArrowsSplit } from "@phosphor-icons/react";
import { $createNodeSelection, $getNodeByKey, $isElementNode, $setSelection } from "lexical";
import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Button } from "../../../ui/button";
import { $makeVisibleWithoutShow, focusLogic } from "./authoring";
import { $ruleLinkSources, type RuleLinkSource } from "./wording-queries";

/** Targets link to their rules and can recover hidden parts that no Show rule covers. */
export function LogicRuleLinks() {
  const [editor] = useLexicalComposerContext();

  const snapshot = useSyncExternalStore(
    (changed) => editor.registerUpdateListener(changed),
    () => editor.getEditorState().read(() => JSON.stringify($ruleLinkSources()), { editor }),
  );

  // SAFETY: snapshot comes directly from the typed $ruleLinkSources result above.
  const sources = JSON.parse(snapshot) as RuleLinkSource[];

  return sources.flatMap((source) => {
    const mount = editor.getElementByKey(source.titleKey)?.querySelector("[data-dynamic-wording]");

    if (!mount || (!source.links.length && !source.hidden)) return [];

    return [
      createPortal(
        <div
          contentEditable={false}
          data-rule-links=""
          className="relative z-2 mt-1 flex flex-wrap items-center gap-1 text-12 font-normal"
        >
          {source.links.map((link) => (
            <Button
              key={link.key}
              size="sm"
              icon={<ArrowsSplit />}
              aria-label={`Edit logic ${link.number} for ${source.fallback}`}
              onClick={() => focusLogic(editor, link.key)}
            >
              {link.effects.join(", ")} · Logic {link.number}
            </Button>
          ))}
          {source.hidden && (
            <div data-hidden-recovery="" className="flex flex-wrap items-center gap-1 text-muted">
              <span>
                {source.hidden === "whole"
                  ? "Hidden without a Show rule"
                  : "Partly hidden without a Show rule"}
              </span>
              <Button
                size="sm"
                aria-label={`Make visible: ${source.fallback}`}
                onClick={() => {
                  if (!editor.isEditable()) return;
                  editor.update(
                    () => {
                      if (!editor.isEditable()) return;
                      const holder = $getNodeByKey(source.holderKey);

                      if (holder) $makeVisibleWithoutShow(holder);
                      const anchor = $getNodeByKey(source.titleKey);

                      if ($isElementNode(anchor)) anchor.selectStart();
                      else if (anchor) {
                        const selection = $createNodeSelection();
                        selection.add(anchor.getKey());
                        $setSelection(selection);
                      }
                    },
                    { onUpdate: () => editor.getRootElement()?.focus({ preventScroll: true }) },
                  );
                }}
              >
                Make visible
              </Button>
            </div>
          )}
        </div>,
        mount,
        source.titleKey,
      ),
    ];
  });
}
