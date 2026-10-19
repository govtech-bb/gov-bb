# Unreviewed write worktree recovery snapshot

Source: `/private/tmp/claude-501/-Users-phrog-Code-work-gov-bb/f9381145-23fe-41a0-a9b6-1f904ff93cae/scratchpad/wt/write`.

This is an archival Markdown snapshot, not approved implementation. The tracked patch is relative to the recorded HEAD and includes both staged and unstaged changes. The untracked files below must also be recovered. Do not apply blindly to the integration branch.

## Base and original status

```text
63991d44bf047f96220ae9459f841609af0071b7
 M apps/editor_v2/src/editor/core/definition.ts
 M apps/editor_v2/src/editor/core/module.ts
 M apps/editor_v2/src/editor/modules/formatting/module.tsx
 M apps/editor_v2/src/editor/modules/formatting/toolbar.tsx
 M apps/editor_v2/src/editor/react/slash-menu.tsx
 M apps/editor_v2/src/forms/modules.ts
 M apps/editor_v2/src/forms/react/block-menu.tsx
 M apps/editor_v2/src/pages/action-menu.tsx
 M apps/editor_v2/src/pages/block-controls.tsx
 M apps/editor_v2/src/pages/insertion.ts
 M apps/editor_v2/src/pages/modules/text.tsx
 M apps/editor_v2/src/pages/slash-menu.tsx
 M apps/editor_v2/src/presets/govbb-form.ts
 M apps/editor_v2/src/routes/prototypes.components.tsx
?? apps/editor_v2/src/editor/core/turn-into.ts
?? apps/editor_v2/src/editor/react/turn-into-keys.ts
?? apps/editor_v2/src/forms/editor/turn-into.ts
?? apps/editor_v2/src/pages/turn-into.ts
?? apps/editor_v2/src/ui/turn-into.test.tsx
?? apps/editor_v2/src/ui/turn-into.tsx
?? apps/editor_v2/tests/forms/turn-into.test.ts
?? apps/editor_v2/tests/pages/turn-into-menus.test.tsx
?? apps/editor_v2/tests/pages/turn-into.test.ts
```

## Tracked patch

````diff
diff --git a/apps/editor_v2/src/editor/core/definition.ts b/apps/editor_v2/src/editor/core/definition.ts
index 5a49007eff991789d1a6605bc06ae08952965295..32c8e47df712977339da71bdc308a3e664fb3439 100644
--- a/apps/editor_v2/src/editor/core/definition.ts
+++ b/apps/editor_v2/src/editor/core/definition.ts
@@ -24,6 +24,10 @@ export function defineEditor(modules: readonly EditorModule[], namespace = "modu
   const owners = modules.flatMap((module) => (module.historyOwner ? [module.historyOwner] : []));
 
   if (owners.length > 1) throw new Error(`Multiple history owners: ${owners.join(", ")}`);
+  const turnInto = modules.flatMap((module) => (module.turnInto ? [module.turnInto] : []));
+
+  if (turnInto.length > 1)
+    throw new Error("An editor has more than one way to turn blocks into others");
   const nodes = new Map<string, DocumentNodeDefinition>();
 
   for (const module of modules)
@@ -138,6 +142,7 @@ export function defineEditor(modules: readonly EditorModule[], namespace = "modu
     slots,
     browserExtensions: Object.freeze(modules.flatMap((module) => module.browserExtensions ?? [])),
     theme: resolvedTheme,
+    turnInto: turnInto[0],
     $initialize: initializers[0],
     $normalizeInitial: () => {
       for (const normalize of normalizers) normalize();
diff --git a/apps/editor_v2/src/editor/core/module.ts b/apps/editor_v2/src/editor/core/module.ts
index 30a3d474cb56a36907696e2e84d22388ea31680b..70d7d769729b69b03f867cec06694b39055c7eea 100644
--- a/apps/editor_v2/src/editor/core/module.ts
+++ b/apps/editor_v2/src/editor/core/module.ts
@@ -8,6 +8,7 @@ import type {
 } from "lexical";
 import type { EditorAction } from "./actions";
 import type { EditorRenderer, EditorSlotContribution } from "./contributions";
+import type { TurnInto } from "./turn-into";
 
 export type DocumentNode = SerializedLexicalNode & {
   children?: DocumentNode[];
@@ -40,6 +41,8 @@ export type EditorModule = {
   readonly requires?: readonly string[];
   readonly provides?: readonly string[];
   readonly historyOwner?: string;
+  /** How the editor's text blocks turn into each other; one module owns it. */
+  readonly turnInto?: TurnInto;
   /** One-shot document preparation, separate from live registrations. */
   readonly $normalizeInitial?: () => void;
   readonly $initialize?: () => void;
diff --git a/apps/editor_v2/src/editor/modules/formatting/module.tsx b/apps/editor_v2/src/editor/modules/formatting/module.tsx
index 35e2911a3370fa7110faf25b5557efd2c0101cfb..00b75f909a09bbb73ffaad3412fc0db74bf500b9 100644
--- a/apps/editor_v2/src/editor/modules/formatting/module.tsx
+++ b/apps/editor_v2/src/editor/modules/formatting/module.tsx
@@ -1,5 +1,6 @@
 import type { EditorModule } from "../../core/module";
 import { defineSlot } from "../../react/contributions";
+import { registerTurnIntoKeys } from "../../react/turn-into-keys";
 import { Toolbar, type ToolbarPolicy } from "./toolbar";
 
 export const textFormatTheme = {
@@ -16,6 +17,7 @@ export function FormattingModule(policy: ToolbarPolicy = {}): EditorModule {
     requires: ["text", ...(policy.linksEnabled === false ? [] : ["links"])],
     provides: ["formatting"],
     theme: { text: textFormatTheme },
+    registrations: [{ key: "turn-into-keys", phase: "browser", register: registerTurnIntoKeys }],
     slots: [
       defineSlot("formatting-toolbar", "editor.overlay", () => <Toolbar {...resolvedPolicy} />),
     ],
diff --git a/apps/editor_v2/src/editor/modules/formatting/toolbar.tsx b/apps/editor_v2/src/editor/modules/formatting/toolbar.tsx
index b48e2d9c3d1712f988966aa5b788ac0606c32f0f..c7a83b9e77b790ab2c0ddc058d96f002ce2053de 100644
--- a/apps/editor_v2/src/editor/modules/formatting/toolbar.tsx
+++ b/apps/editor_v2/src/editor/modules/formatting/toolbar.tsx
@@ -1,6 +1,7 @@
 import { $isLinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
 import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
 import {
+  $addUpdateTag,
   $findMatchingParent,
   $getSelection,
   $isRangeSelection,
@@ -15,7 +16,14 @@ import {
   type LexicalNode,
   type TextFormatType,
 } from "lexical";
-import { LinkBreak, LinkSimple, TextB, TextItalic, TextTSlash } from "@phosphor-icons/react";
+import {
+  CaretDown,
+  LinkBreak,
+  LinkSimple,
+  TextB,
+  TextItalic,
+  TextTSlash,
+} from "@phosphor-icons/react";
 import {
   useEffect,
   useId,
@@ -31,6 +39,9 @@ import { Popover } from "../../../ui/popover";
 import { Button } from "../../../ui/button";
 import { Input } from "../../../ui/input";
 import { Tip } from "../../../ui/tooltip";
+import { TurnIntoMenu } from "../../../ui/turn-into";
+import { useEditorDefinition } from "../../react/composer";
+import { shortcut } from "../../react/shortcut";
 import { composing } from "./editing";
 import { isSafeLinkUrl, normalizeLinkUrl } from "../links/url";
 
@@ -92,6 +103,7 @@ export function Toolbar({
   isValidLink = isSafeLinkUrl,
 }: ToolbarPolicy = {}) {
   const [editor] = useLexicalComposerContext();
+  const { turnInto } = useEditorDefinition();
   const [open, setOpen] = useState(false);
   const [linking, setLinking] = useState(false);
   const [, rerender] = useReducer((n: number) => n + 1, 0);
@@ -209,6 +221,7 @@ export function Toolbar({
             bold: selection.hasFormat("bold"),
             italic: selection.hasFormat("italic"),
             link: $link(selection)?.getURL() ?? null,
+            turn: turnInto?.$choices() ?? null,
           }
         );
       },
@@ -221,6 +234,16 @@ export function Toolbar({
     if (editor.isEditable()) editor.dispatchCommand(FORMAT_TEXT_COMMAND, type);
   };
 
+  // Each turn is a step of its own in the undo history
+  const turn = (value: string) => {
+    if (!editor.isEditable()) return;
+    editor.update(() => {
+      $addUpdateTag(HISTORY_PUSH_TAG);
+      turnInto?.$turnInto(value);
+    });
+    editor.focus();
+  };
+
   // A step of its own in the undo history, as a format change is
   const clear = () => {
     if (editor.isEditable())
@@ -255,6 +278,30 @@ export function Toolbar({
         finalFocus={false}
         className="flex items-center gap-0.5 overflow-visible p-0 px-1 motion-safe:data-starting-style:scale-100 motion-safe:data-ending-style:scale-100"
       >
+        {state.turn && (
+          <>
+            <TurnIntoMenu
+              value={state.turn.value}
+              choices={state.turn.choices.map((choice) => ({
+                ...choice,
+                shortcut: choice.keys && shortcut(choice.keys),
+              }))}
+              onValueChange={turn}
+              trigger={
+                <Button
+                  iconEnd={<CaretDown />}
+                  onMouseDown={keepSelection}
+                  className="my-1 font-normal text-ink"
+                >
+                  <span className="sr-only">Turn into: </span>
+                  {state.turn.choices.find((choice) => choice.value === state.turn?.value)?.label ??
+                    "Turn into"}
+                </Button>
+              }
+            />
+            <Divider />
+          </>
+        )}
         <Action tip="Bold" active={state.bold} icon={<TextB />} onClick={format("bold")} />
         <Action
           tip="Italic"
diff --git a/apps/editor_v2/src/editor/react/slash-menu.tsx b/apps/editor_v2/src/editor/react/slash-menu.tsx
index 709e5ad161ace5528f8a515554eaebcf470cb94b..2ebb6db785e618f1e3310fba764a696331366ec8 100644
--- a/apps/editor_v2/src/editor/react/slash-menu.tsx
+++ b/apps/editor_v2/src/editor/react/slash-menu.tsx
@@ -26,6 +26,7 @@ import {
   type EditorAction,
 } from "../core/actions";
 import { $caretLine, registerLineHint } from "./block-dom";
+import { $turnLineInto } from "../core/turn-into";
 import { useEditorDefinition } from "./composer";
 import { useSlashTrigger } from "./slash-trigger";
 
@@ -135,6 +136,18 @@ export function SlashMenu() {
       commandPriority={COMMAND_PRIORITY_NORMAL}
       onSelectOption={(option, query, closeMenu) => {
         const queryKey = query?.getKey();
+        const line = $getNodeByKey(option.targetKey);
+
+        if (
+          line &&
+          $turnLineInto(definition, option.entry.id, line, query?.getTextContent() ?? "", () =>
+            query?.remove(),
+          )
+        ) {
+          closeMenu();
+
+          return;
+        }
 
         const outcome = $executeAction(
           editor,
diff --git a/apps/editor_v2/src/forms/modules.ts b/apps/editor_v2/src/forms/modules.ts
index 728ed23cdb83ef31d18fb40ee750a9c54fa9f2c5..67268e5d4dad30f2e9ee6afc0c1bdfec4dc2cfc3 100644
--- a/apps/editor_v2/src/forms/modules.ts
+++ b/apps/editor_v2/src/forms/modules.ts
@@ -31,6 +31,8 @@ export { TimeModule } from "./features/time/module";
 
 export { $isPlainText } from "./editor/nodes";
 
+export { formTurnInto } from "./editor/turn-into";
+
 export {
   paragraphContent,
   headingContents,
diff --git a/apps/editor_v2/src/forms/react/block-menu.tsx b/apps/editor_v2/src/forms/react/block-menu.tsx
index 50511a557ab384215ed64dca22096272a6961b57..a7591cacb54b2209c351a5567a2da8ee2830350e 100644
--- a/apps/editor_v2/src/forms/react/block-menu.tsx
+++ b/apps/editor_v2/src/forms/react/block-menu.tsx
@@ -1,6 +1,6 @@
 import { formDefinition } from "../definition";
 import { useEditorDefinition } from "../../editor/react/composer";
-import { Store, SsbField, SubmenuRow, Action } from "../react/settings-controls";
+import { Store, SsbField, Action } from "../react/settings-controls";
 
 export { BoundsFields, SsbField } from "../react/settings-controls";
 
@@ -13,13 +13,13 @@ import {
   Eye,
   EyeSlash,
   ListPlus,
-  Swap,
   TextOutdent,
   Trash,
 } from "@phosphor-icons/react";
 import type { ReactNode } from "react";
 import { cn } from "../../cn";
 import { Menu, RowContent } from "../../ui/menu";
+import { TurnIntoSubmenu } from "../../ui/turn-into";
 import { group, row } from "../../ui/surface";
 import type { Settings } from "../core/settings";
 import { presetProvenance } from "../core/provenance";
@@ -140,7 +140,13 @@ export function BlockMenu({
             Bulk insert options
           </Action>
         )}
-        {!m.multi && m.turnInto && <TurnInto {...m.turnInto} onValueChange={a.onTurnInto} />}
+        {!m.multi && m.turnInto && (
+          <TurnIntoSubmenu
+            value={m.turnInto.value}
+            choices={m.turnInto.options.map(([value, label, icon]) => ({ value, label, icon }))}
+            onValueChange={a.onTurnInto}
+          />
+        )}
       </Menu.Group>
     </Menu.Content>
   );
@@ -180,25 +186,3 @@ function Header({ name, icon }: NonNullable<BlockMenuModel["header"]>) {
     </div>
   );
 }
-
-function TurnInto({
-  value,
-  options,
-  onValueChange,
-}: NonNullable<BlockMenuModel["turnInto"]> & { onValueChange: (kind: string) => void }) {
-  return (
-    <SubmenuRow
-      label="Turn into"
-      icon={<Swap />}
-      text={options.find(([kind]) => kind === value)?.[1]}
-    >
-      <Menu.RadioGroup value={value} onValueChange={onValueChange}>
-        {options.map(([kind, label, icon]) => (
-          <Menu.RadioItem key={kind} value={kind} icon={icon} closeOnClick>
-            {label}
-          </Menu.RadioItem>
-        ))}
-      </Menu.RadioGroup>
-    </SubmenuRow>
-  );
-}
diff --git a/apps/editor_v2/src/pages/action-menu.tsx b/apps/editor_v2/src/pages/action-menu.tsx
index 08f6db84b1021b906680150e4774c65ac0b373b7..190a86feb5c15be7a262fa4a053e15cd7ead1dab 100644
--- a/apps/editor_v2/src/pages/action-menu.tsx
+++ b/apps/editor_v2/src/pages/action-menu.tsx
@@ -79,14 +79,19 @@ export function PageActionList({
 export function PageMenuRow({
   children,
   icon,
+  detail,
   ...props
 }: {
   children: ReactNode;
   icon?: ReactNode;
+  /** After the label, such as the current choice. */
+  detail?: ReactNode;
 } & Omit<import("react").ComponentProps<"button">, "children">) {
   return (
     <button type="button" className={buttonRow} {...props}>
-      <RowContent icon={icon}>{children}</RowContent>
+      <RowContent icon={icon} detail={detail}>
+        {children}
+      </RowContent>
     </button>
   );
 }
diff --git a/apps/editor_v2/src/pages/block-controls.tsx b/apps/editor_v2/src/pages/block-controls.tsx
index ba8902a1cc0adaabd3531321a9b7e1ba865e7ca7..aebb0dae8f5fe07403f1be286c1e4433aaa73898 100644
--- a/apps/editor_v2/src/pages/block-controls.tsx
+++ b/apps/editor_v2/src/pages/block-controls.tsx
@@ -42,6 +42,7 @@ import {
   Table,
   ListBullets,
   ListNumbers,
+  Swap,
 } from "@phosphor-icons/react";
 import { useEffect, useId, useRef, useState } from "react";
 import {
@@ -62,7 +63,7 @@ import {
 } from "../editor/react/block-rail";
 import { useEditorDefinition } from "../editor/react/composer";
 import { cn } from "../cn";
-import { altKey } from "../editor/react/shortcut";
+import { altKey, shortcut } from "../editor/react/shortcut";
 import { Button } from "../ui/button";
 import { Field } from "../ui/field";
 import { Input } from "../ui/input";
@@ -70,8 +71,10 @@ import { NativeSelect } from "../ui/native-select";
 import { Popover } from "../ui/popover";
 import { group, groupLabel, listFooter } from "../ui/surface";
 import { Tip } from "../ui/tooltip";
+import { TurnIntoMenu } from "../ui/turn-into";
 import { actionList, PageActionList, PageMenuRow } from "./action-menu";
 import { $writeAtEnd } from "./block-exit";
+import { $blockLines, $pageChoices, $turnPageLines } from "./turn-into";
 import { $rootBlock, type PagePlace } from "./insertion";
 import { startWriting } from "./slash-menu";
 import { PageMetadataNode } from "./metadata";
@@ -476,6 +479,8 @@ function PageBlockMenu({ menu, onClose }: { menu: OpenMenu; onClose: () => void
       let component: PageComponentNode | null = null;
       const list = $nearestPageList(node);
       let table = $isTableNode(block);
+      // Turn into takes a whole text block: its line, a quote's lines or every item of a list
+      const lines = block instanceof PageComponentNode ? null : $blockLines(block);
 
       while (node && !$isRootNode(node)) {
         if (!component && node instanceof PageComponentNode) component = node;
@@ -490,6 +495,7 @@ function PageBlockMenu({ menu, onClose }: { menu: OpenMenu; onClose: () => void
         up:
           !!block.getPreviousSibling() && !(block.getPreviousSibling() instanceof PageMetadataNode),
         down: !!block.getNextSibling(),
+        turn: lines?.length ? $pageChoices(lines) : null,
         component: component
           ? {
               key: component.getKey(),
@@ -599,6 +605,35 @@ function PageBlockMenu({ menu, onClose }: { menu: OpenMenu; onClose: () => void
               Add another button
             </PageMenuRow>
           )}
+        {model.turn && (
+          <div className={group}>
+            <TurnIntoMenu
+              beside
+              value={model.turn.value}
+              choices={model.turn.choices.map((choice) => ({
+                ...choice,
+                shortcut: choice.keys && shortcut(choice.keys),
+              }))}
+              onValueChange={(value) =>
+                change((block) => {
+                  const lines = $blockLines(block);
+
+                  if (lines) $turnPageLines(lines, value);
+                })
+              }
+              trigger={
+                <PageMenuRow
+                  icon={<Swap />}
+                  detail={
+                    model.turn.choices.find((choice) => choice.value === model.turn?.value)?.label
+                  }
+                >
+                  Turn into
+                </PageMenuRow>
+              }
+            />
+          </div>
+        )}
         {model.table && (
           <div className={group}>
             <PageMenuRow
diff --git a/apps/editor_v2/src/pages/insertion.ts b/apps/editor_v2/src/pages/insertion.ts
index c3fc4bd7cdb9cb0076135f0cddb31a943a712d59..48a51b5ace9ea1da5eafae7e1a73a82d5c9f3343 100644
--- a/apps/editor_v2/src/pages/insertion.ts
+++ b/apps/editor_v2/src/pages/insertion.ts
@@ -61,26 +61,27 @@ const $emptyLine = (target: LexicalNode, request: ActionRequest) =>
   target.getTextContent() === (request.typed ?? "");
 
 /**
- * Moves an empty line out of the lists, quotes and Notices around it, splitting them where it was, so the blocks
- * before and after it stay where they are. An empty list item goes on as a line of text.
+ * Moves a line out of the blocks around it that `$leaves` names, splitting them where it was, so the blocks before
+ * and after it stay where they are. A list item goes on as a line of text, with its text.
  */
-function $leaveBlocks(line: ElementNode): ElementNode {
+export function $liftLine(line: ElementNode, $leaves: (node: LexicalNode) => boolean): ElementNode {
   let node = line;
 
   if ($isListItemNode(node)) {
     const text = $createParagraphNode();
     const split = !!node.getNextSibling();
 
-    // Lexical splits the list around it. The items after go on from the empty item's number, as it's gone
+    // Lexical splits the list around it. The items after go on from the item's number, as it's no longer one
     node.insertAfter(text);
     const rest = text.getNextSibling();
 
     if (split && $isListNode(rest)) rest.setStart(node.getValue());
+    text.append(...node.getChildren());
     node.remove();
     node = text;
   }
 
-  for (let parent = node.getParent(); parent && $leavable(parent); parent = node.getParent()) {
+  for (let parent = node.getParent(); parent && $leaves(parent); parent = node.getParent()) {
     const rest = node.getNextSiblings();
 
     if (rest.length) parent.insertAfter($copyNode(parent).append(...rest));
@@ -113,7 +114,7 @@ export function $placePageBlock(block: ElementNode, target: LexicalNode, request
     else if (request.mode === "above") beside.insertBefore(block);
     else beside.insertAfter(block);
   } else if ($isElementNode(target) && !target.getTextContent())
-    $leaveBlocks(target).replace(block);
+    $liftLine(target, $leavable).replace(block);
   else if ($isListItemNode(target)) target.append(block);
   else target.insertAfter(block);
 }
diff --git a/apps/editor_v2/src/pages/modules/text.tsx b/apps/editor_v2/src/pages/modules/text.tsx
index 28b04202ea1bb5dd50f0f123bafbcfd232b60d85..4d7f492d9ee3700c881997d0c1206a7c05361e0b 100644
--- a/apps/editor_v2/src/pages/modules/text.tsx
+++ b/apps/editor_v2/src/pages/modules/text.tsx
@@ -33,6 +33,7 @@ import type { MarkdownNode, PageHandler, PageModule } from "../definition";
 import { blocks, phrasing, UnsupportedPageContent } from "../markdown";
 import { registerPageBlockExit } from "../block-exit";
 import { pageInsertAction } from "../insertion";
+import { pageTurnInto } from "../turn-into";
 import { PageRuleNode } from "../nodes";
 
 export { isSupportedLinkUrl as safePageUrl } from "../../editor/modules/links/url";
@@ -285,6 +286,7 @@ export function PageTextModule(): PageModule {
       { type: "page-rule", node: PageRuleNode },
     ],
     markdown: [text],
+    turnInto: pageTurnInto,
     actions: [
       pageInsertAction("page-paragraph", "Text", $createParagraphNode, {
         group: "Text",
diff --git a/apps/editor_v2/src/pages/slash-menu.tsx b/apps/editor_v2/src/pages/slash-menu.tsx
index 82dbd16c22ba3a03967dda26bbf4028ea31b508b..4b2121aafe426caa540a029685a047dfc138b485 100644
--- a/apps/editor_v2/src/pages/slash-menu.tsx
+++ b/apps/editor_v2/src/pages/slash-menu.tsx
@@ -5,7 +5,13 @@ import { useCallback, useEffect, useState } from "react";
 import { createPortal } from "react-dom";
 import { $isListItemNode } from "@lexical/list";
 import { $isHeadingNode, $isQuoteNode } from "@lexical/rich-text";
-import { $getRoot, $isParagraphNode, COMMAND_PRIORITY_NORMAL, type ElementNode } from "lexical";
+import {
+  $getNodeByKey,
+  $getRoot,
+  $isParagraphNode,
+  COMMAND_PRIORITY_NORMAL,
+  type ElementNode,
+} from "lexical";
 import {
   $availableActions,
   $executeAction,
@@ -13,6 +19,7 @@ import {
   type EditorAction,
 } from "../editor/core/actions";
 import { $caretLine, registerLineHint } from "../editor/react/block-dom";
+import { $turnLineInto } from "../editor/core/turn-into";
 import { useEditorDefinition } from "../editor/react/composer";
 import { useSlashTrigger } from "../editor/react/slash-trigger";
 import { cn } from "../cn";
@@ -130,6 +137,19 @@ function EditablePageSlashMenu() {
       commandPriority={COMMAND_PRIORITY_NORMAL}
       anchorClassName="z-50"
       onSelectOption={(option, text, close) => {
+        const line = $getNodeByKey(option.targetKey);
+
+        if (
+          line &&
+          $turnLineInto(definition, option.action.id, line, text?.getTextContent() ?? "", () =>
+            text?.remove(),
+          )
+        ) {
+          close();
+
+          return;
+        }
+
         const result = $executeAction(
           editor,
           definition,
diff --git a/apps/editor_v2/src/presets/govbb-form.ts b/apps/editor_v2/src/presets/govbb-form.ts
index 59d03bee808ecb06ec580ebcac43b951c946a6ee..dab56065fd83fcc94ce86705a25ce094b091b76c 100644
--- a/apps/editor_v2/src/presets/govbb-form.ts
+++ b/apps/editor_v2/src/presets/govbb-form.ts
@@ -17,6 +17,7 @@ import {
   DateModule,
   TimeModule,
   $isPlainText,
+  formTurnInto,
   paragraphContent,
   headingContents,
   listContents,
@@ -94,6 +95,7 @@ export const govbbFormModules: readonly FormModule[] = [
   ),
   LinksModule(),
   FormattingModule({ isPlainText: $isPlainText }),
+  { key: "turn-into", turnInto: formTurnInto },
   ConditionalLogicModule(),
   CalculationsModule(),
   MentionsModule(),
diff --git a/apps/editor_v2/src/routes/prototypes.components.tsx b/apps/editor_v2/src/routes/prototypes.components.tsx
index 2e3a48dbb5702af025f7b0ad380737183cd65f03..9851e21fea878cdab3651629ccc80516748acd25 100644
--- a/apps/editor_v2/src/routes/prototypes.components.tsx
+++ b/apps/editor_v2/src/routes/prototypes.components.tsx
@@ -51,6 +51,7 @@ import { SidePanel, useSidePanel } from "../ui/side-panel";
 import { Switch } from "../ui/switch";
 import { Textarea } from "../ui/textarea";
 import { toast } from "../ui/toast";
+import { TurnIntoSubmenu, type TurnIntoChoice } from "../ui/turn-into";
 
 export const Route = createFileRoute("/prototypes/components")({
   head: () => ({ meta: [{ title: "Components · Design preview · GovBB" }] }),
@@ -176,7 +177,7 @@ function ComponentsPreview() {
         <Section id="menu" title="Menu" lead="Actions and settings for a block, a row or a page.">
           <Specimen
             title="Block actions"
-            note="Icons and shortcuts. Delete is red, and Move out is unavailable here."
+            note="Icons and shortcuts, and Turn into's submenu of text types. Delete is red, and Move out is unavailable here."
           >
             <BlockActions />
           </Specimen>
@@ -745,8 +746,17 @@ function SidePanelDemo() {
   );
 }
 
+// Turn into's choices, as a page offers them
+const textTypes: TurnIntoChoice[] = [
+  { value: "text", label: "Text", icon: <TextT />, shortcut: "⌥⌘0" },
+  { value: "h2", label: "Heading 2", icon: <TextH />, shortcut: "⌥⌘2" },
+  { value: "bullets", label: "Bulleted list", icon: <ListBullets />, shortcut: "⇧⌘8" },
+  { value: "numbers", label: "Numbered list", icon: <ListNumbers />, shortcut: "⇧⌘7" },
+];
+
 function BlockActions() {
   const [chosen, setChosen] = useState<string>();
+  const [type, setType] = useState("text");
 
   const action = (name: string) => () => setChosen(name);
 
@@ -774,6 +784,18 @@ function BlockActions() {
                 Move out
               </Menu.Item>
             </Menu.Group>
+            <Menu.Group>
+              <TurnIntoSubmenu
+                value={type}
+                choices={textTypes}
+                onValueChange={(value) => {
+                  setType(value);
+                  setChosen(
+                    `Turn into ${textTypes.find((choice) => choice.value === value)?.label}`,
+                  );
+                }}
+              />
+            </Menu.Group>
             <Menu.Group>
               <Menu.Item icon={<Trash />} detail="Del" variant="danger" onClick={action("Delete")}>
                 Delete
````

## Untracked files

### apps/editor_v2/src/editor/core/turn-into.ts

````text
import {
  $addUpdateTag,
  $isElementNode,
  $isTextNode,
  HISTORY_PUSH_TAG,
  type LexicalNode,
} from "lexical";
import type { ReactNode } from "react";
import type { EditorDefinition } from "./definition";

/** A type of text block that Turn into offers: one of the editor's insert actions, by its id. */
export type TurnIntoChoice = {
  readonly value: string;
  readonly label: string;
  readonly icon?: ReactNode;
  /** Its shortcut, in shortcut()'s terms, such as ["mod", "alt", "2"]. */
  readonly keys?: readonly string[];
};

/**
 * Turn into, for an editor's text blocks: the lines a selection touches become another type of text block, keeping
 * their text. The block menus, the selection toolbar, the shortcuts, the "/" menu and typed Markdown all turn lines
 * through it. Its callbacks run in the editor's Lexical context.
 */
export type TurnInto = {
  /** The choices for the selection's lines and the one they all are (null if they differ); null where they can't turn. */
  readonly $choices: () => {
    readonly value: string | null;
    readonly choices: readonly TurnIntoChoice[];
  } | null;
  /** Turns the selection's lines into a choice. */
  readonly $turnInto: (value: string) => void;
};

/**
 * A "/" menu's text choice, on a line with more text than was typed to open the menu, turns the line into itself
 * rather than adding a block below it. `$removeTyped` takes away what was typed first. True when it did.
 */
export function $turnLineInto(
  definition: EditorDefinition,
  id: string,
  line: LexicalNode,
  typed: string,
  $removeTyped: () => void,
) {
  const turnInto = definition.turnInto;

  if (
    !turnInto ||
    line.getTextContent().length <= typed.length ||
    !turnInto.$choices()?.choices.some((choice) => choice.value === id)
  )
    return false;

  $removeTyped();
  // The space before the "/" was only there to open the menu
  const last = $isElementNode(line) ? line.getLastDescendant() : null;

  if ($isTextNode(last) && /\s$/.test(last.getTextContent()))
    last.setTextContent(last.getTextContent().trimEnd()).selectEnd();
  $addUpdateTag(HISTORY_PUSH_TAG);
  turnInto.$turnInto(id);

  return true;
}
````

### apps/editor_v2/src/editor/react/turn-into-keys.ts

````text
import {
  $addUpdateTag,
  COMMAND_PRIORITY_NORMAL,
  HISTORY_PUSH_TAG,
  KEY_DOWN_COMMAND,
  type LexicalEditor,
} from "lexical";
import { editorDefinition } from "../core/context";
import { isMac } from "./shortcut";

/** Whether a key press is a shortcut in shortcut()'s terms, such as ["mod", "alt", "2"]. Digits go by the key, as a Mac's Option changes what they type. */
export function pressed(event: KeyboardEvent, keys: readonly string[]) {
  const key = keys.at(-1) ?? "";
  const held = new Set(keys.slice(0, -1));

  return (
    (isMac ? event.metaKey : event.ctrlKey) === held.has("mod") &&
    (isMac ? !event.ctrlKey : !event.metaKey) &&
    event.altKey === held.has("alt") &&
    event.shiftKey === held.has("shift") &&
    (/^\d$/.test(key) ? event.code === `Digit${key}` : event.key.toLowerCase() === key)
  );
}

/** Turn into's shortcuts: each turns the selection's lines into its type, or back into text when they already are. */
export function registerTurnIntoKeys(editor: LexicalEditor) {
  const turnInto = editorDefinition(editor).turnInto;

  if (!turnInto) return () => {};

  return editor.registerCommand(
    KEY_DOWN_COMMAND,
    (event) => {
      if (!editor.isEditable() || event.isComposing) return false;
      const offer = turnInto.$choices();
      const choice = offer?.choices.find((item) => item.keys && pressed(event, item.keys));

      if (!offer || !choice) return false;
      event.preventDefault();
      $addUpdateTag(HISTORY_PUSH_TAG);
      turnInto.$turnInto(offer.value === choice.value ? offer.choices[0]!.value : choice.value);

      return true;
    },
    COMMAND_PRIORITY_NORMAL,
  );
}
````

### apps/editor_v2/src/forms/editor/turn-into.ts

````text
import { $getSelection, $isRangeSelection, type LexicalNode } from "lexical";
import type { TurnInto, TurnIntoChoice } from "../../editor/core/turn-into";
import { calloutEntries } from "../../editor/modules/callouts/insertion";
import { disclosureEntries } from "../../editor/modules/disclosure/insertion";
import { headingEntries } from "../../editor/modules/headings/insertion";
import { listEntries } from "../../editor/modules/lists/insertion";
import { textEntries } from "../../editor/modules/text/insertion";
import { kindIcon } from "../react/logic-icons";
import { $blockKind, $isInput, $turnInto, $turnIntoGroups } from "./nodes";
import { $selectedBlocks } from "./structure/blocks";

// The form's text blocks: the insert actions that make each kind, and their shortcuts
const entries = [
  ...textEntries,
  ...headingEntries,
  ...listEntries,
  ...calloutEntries,
  ...disclosureEntries,
];

const keys = new Map<string, readonly string[]>([
  ["paragraph", ["mod", "alt", "0"]],
  ["h1", ["mod", "alt", "1"]],
  ["h2", ["mod", "alt", "2"]],
  ["h3", ["mod", "alt", "3"]],
  ["bullet", ["mod", "shift", "8"]],
  ["number", ["mod", "shift", "7"]],
]);

/** The blocks a selection touches, or the caret's block. */
function $blocks(): LexicalNode[] {
  const selected = $selectedBlocks();

  if (selected.length) return selected;
  const selection = $getSelection();

  if (!$isRangeSelection(selection)) return [];
  const blocks = selection.getNodes().flatMap((node) => node.getTopLevelElement() ?? []);

  return blocks.filter((block, index) => blocks.findIndex((other) => other.is(block)) === index);
}

/** Turn into, for a form's text blocks: text, headings, lists, callouts and Details, as the block menu offers them. */
export const formTurnInto: TurnInto = {
  $choices() {
    const blocks = $blocks();
    const content = $turnIntoGroups().at(-1) ?? [];
    const kinds = new Set(blocks.map($blockKind));

    if (
      !blocks.length ||
      blocks.some($isInput) ||
      [...kinds].some((kind) => !content.some(([k]) => k === kind))
    )
      return null;

    const choices: TurnIntoChoice[] = content.flatMap(([kind, label]) => {
      const entry = entries.find((item) => item.kind === kind);

      return entry
        ? [{ value: entry.id, label, icon: kindIcon(kind, true), keys: keys.get(kind) }]
        : [];
    });

    const value =
      kinds.size === 1 ? (entries.find((item) => item.kind === [...kinds][0])?.id ?? null) : null;

    return { value, choices };
  },
  $turnInto(value) {
    const kind = entries.find((entry) => entry.id === value)?.kind;

    if (kind) for (const block of $blocks()) $turnInto(block, kind);
  },
};
````

### apps/editor_v2/src/pages/turn-into.ts

````text
import {
  $createListItemNode,
  $createListNode,
  $isListItemNode,
  $isListNode,
  type ListNode,
} from "@lexical/list";
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
  $isQuoteNode,
  type HeadingTagType,
} from "@lexical/rich-text";
import {
  $createParagraphNode,
  $getEditor,
  $getSelection,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  type ElementNode,
  type LexicalNode,
} from "lexical";
import { editorDefinition } from "../editor/core/context";
import type { TurnInto, TurnIntoChoice } from "../editor/core/turn-into";
import { $liftLine } from "./insertion";
import { $nearestPageList, $setPageListType } from "./modules/lists";
import { PageComponentNode } from "./nodes";

// A page's text blocks, by the ids of the actions that insert them, and their shortcuts
const shortcuts = new Map<string, readonly string[]>([
  ["page-paragraph", ["mod", "alt", "0"]],
  ["page-h2", ["mod", "alt", "2"]],
  ["page-h3", ["mod", "alt", "3"]],
  ["page-h4", ["mod", "alt", "4"]],
  ["page-quote", ["mod", "shift", "b"]],
  ["page-bullet-list", ["mod", "shift", "8"]],
  ["page-number-list", ["mod", "shift", "7"]],
]);

const tags = new Map<string, HeadingTagType>(
  (["h1", "h2", "h3", "h4", "h5", "h6"] as const).map((tag) => [`page-${tag}`, tag]),
);

// A line of text: a paragraph, a heading, or a list item holding its text itself
const $isLine = (node: LexicalNode): node is ElementNode =>
  $isParagraphNode(node) ||
  $isHeadingNode(node) ||
  ($isListItemNode(node) &&
    node.getChildren().every((child) => !$isElementNode(child) || child.isInline()));

// Buttons and table cells hold text that can't turn into anything else
const $fixed = (node: LexicalNode) =>
  node.getType() === "tablecell" ||
  (node instanceof PageComponentNode &&
    (node.getKind() === "start" || node.getKind() === "action"));

/** The line a node is in, or undefined where its text can't turn. */
function $lineOf(node: LexicalNode): ElementNode | null | undefined {
  let line: ElementNode | null = null;

  for (let current: LexicalNode | null = node; current; current = current.getParent()) {
    if ($fixed(current)) return undefined;

    if (!line && $isLine(current)) line = current;
  }

  return line;
}

/** The lines in a block, in order, as Turn into in its menu takes them all; null if any can't turn. */
export function $blockLines(block: LexicalNode): ElementNode[] | null {
  if ($fixed(block)) return null;

  if ($isLine(block)) return [block];

  const lines = $isElementNode(block) ? block.getChildren().map($blockLines) : [];

  return lines.every((found) => found !== null) ? lines.flat() : null;
}

/** The lines a selection touches, in order; null if any can't turn. */
function $selectedLines(): ElementNode[] | null {
  const selection = $getSelection();

  if (!$isRangeSelection(selection)) return null;
  const lines: ElementNode[] = [];

  for (const node of selection.getNodes()) {
    const line = $lineOf(node);

    if (line === undefined) return null;

    if (line && !lines.some((known) => known.is(line))) lines.push(line);
  }

  return lines.length ? lines : null;
}

/** The type of text a line is, by the id of the action that inserts it. */
function $textType(line: ElementNode) {
  if ($isHeadingNode(line)) return `page-${line.getTag()}`;

  if ($isListItemNode(line) || $isListItemNode(line.getParent()))
    return $nearestPageList(line)?.getListType() === "number"
      ? "page-number-list"
      : "page-bullet-list";

  return $isQuoteNode(line.getParent()) ? "page-quote" : "page-paragraph";
}

/** What a page's lines can turn into, and what they all are: the page's text blocks, each with its shortcut. */
export function $pageChoices(lines: readonly ElementNode[]) {
  const types = new Set(lines.map($textType));
  const value = types.size === 1 ? [...types][0]! : null;

  const choices: TurnIntoChoice[] = editorDefinition($getEditor()).actions.flatMap((action) => {
    const keys = shortcuts.get(action.id);

    // Heading 4 shows where a line already is one; a search in the "/" menu finds it otherwise
    return keys && (!action.searchOnly || action.id === value)
      ? [{ value: action.id, label: action.title, icon: action.icon, keys }]
      : [];
  });

  // A heading the menus no longer offer still shows what the line is
  if (value && tags.has(value) && !choices.some((choice) => choice.value === value))
    choices.push({ value, label: `Heading ${value.slice(-1)}` });

  return { value, choices };
}

// Turning into text, a heading or a quote takes lines out of the lists and quotes around them
const $leaves = (node: LexicalNode) =>
  $isListNode(node) || $isListItemNode(node) || $isQuoteNode(node);

/** The line out of its lists and quotes, as a paragraph or a heading with its text. */
function $retype(line: ElementNode, tag?: HeadingTagType) {
  const moved = $liftLine(line, $leaves);
  const same = $isHeadingNode(moved) ? moved.getTag() === tag : !tag && $isParagraphNode(moved);

  return same ? moved : moved.replace(tag ? $createHeadingNode(tag) : $createParagraphNode(), true);
}

/** Joins a list to one of its type just before it, and one just after unless that starts at a number of its own. */
function $joinLists(list: ListNode) {
  const before = list.getPreviousSibling();
  let joined = list;

  if ($isListNode(before) && before.getListType() === list.getListType()) {
    before.append(...list.getChildren());
    list.remove();
    joined = before;
  }

  const after = joined.getNextSibling();

  if (
    $isListNode(after) &&
    after.getListType() === joined.getListType() &&
    after.getStart() === 1
  ) {
    joined.append(...after.getChildren());
    after.remove();
  }
}

/**
 * Turns lines into one of a page's text types, keeping their text: lines leave the lists and quotes
 * around them, which split where they were; lines turned into a list join one next to them, and a line in a list
 * changes its whole list's type; lines turned into a quote together share one.
 */
export function $turnPageLines(lines: readonly ElementNode[], type: string) {
  const listType =
    type === "page-number-list" ? "number" : type === "page-bullet-list" ? "bullet" : null;

  let quote: ElementNode | null = null;
  let last: ElementNode | null = null;

  for (const line of lines) {
    if (!line.isAttached()) continue;

    if (listType && ($isListItemNode(line) || $isListItemNode(line.getParent()))) {
      $setPageListType(line, listType);
      last = line;
    } else if (listType) {
      const text = $retype(line);

      const list = $createListNode(listType).append(
        $createListItemNode().append(...text.getChildren()),
      );

      last = list;
      text.replace(list);
      $joinLists(list);
    } else if (type === "page-quote") {
      const text = $retype(line);

      // Lines turned together go in one quote
      if (quote?.is(text.getPreviousSibling())) quote.append(text);
      else {
        quote = $createQuoteNode();
        text.replace(quote);
        quote.append(text);
      }

      last = text;
    } else last = $retype(line, tags.get(type));
  }

  // The caret stays in the text; one on a line that's gone goes to the end of what it became
  const selection = $getSelection();

  if (
    $isRangeSelection(selection) &&
    !selection.anchor.getNode().isAttached() &&
    last?.isAttached()
  )
    last.selectEnd();
}

/** Turn into, for a page: its text, headings, quotes and lists. */
export const pageTurnInto: TurnInto = {
  $choices() {
    const lines = $selectedLines();

    return lines && $pageChoices(lines);
  },
  $turnInto(value) {
    const lines = $selectedLines();

    if (lines) $turnPageLines(lines, value);
  },
};
````

### apps/editor_v2/src/ui/turn-into.test.tsx

````text
/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Menu } from "./menu";
import { TurnIntoMenu, TurnIntoSubmenu, type TurnIntoChoice } from "./turn-into";

const choices: TurnIntoChoice[] = [
  { value: "text", label: "Text", shortcut: "⌥⌘0" },
  { value: "h2", label: "Heading 2", shortcut: "⌥⌘2" },
  { value: "bullets", label: "Bulleted list" },
];

let host: HTMLDivElement;

let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const items = () => [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];

test("Turn into lists the choices with their shortcuts, ticks the current one and turns into the one picked", async () => {
  const picked: string[] = [];

  await act(async () =>
    root.render(
      <TurnIntoMenu
        value="h2"
        choices={choices}
        onValueChange={(value) => picked.push(value)}
        trigger={<button type="button">Heading 2</button>}
      />,
    ),
  );
  await act(async () => host.querySelector("button")!.click());
  expect(items().map((item) => [item.textContent, item.getAttribute("aria-checked")])).toEqual([
    ["Text⌥⌘0", "false"],
    ["Heading 2⌥⌘2", "true"],
    ["Bulleted list", "false"],
  ]);

  await act(async () => items()[2]!.click());
  expect(picked).toEqual(["bullets"]);
});

test("in a block's menu, Turn into is a submenu that shows what the block is now", async () => {
  await act(async () =>
    root.render(
      <Menu.Root open>
        <Menu.Trigger render={<button type="button">Block options</button>} />
        <Menu.Content>
          <TurnIntoSubmenu value="bullets" choices={choices} onValueChange={() => {}} />
        </Menu.Content>
      </Menu.Root>,
    ),
  );

  const row = document.querySelector<HTMLElement>('[role="menuitem"]')!;
  expect(row.textContent).toBe("Turn intoBulleted list");
  expect(row.getAttribute("aria-haspopup")).toBe("menu");
});
````

### apps/editor_v2/src/ui/turn-into.tsx

````text
import { Swap } from "@phosphor-icons/react";
import { useRef, useState, type ReactElement, type ReactNode } from "react";
import { Menu } from "./menu";

export type TurnIntoChoice = {
  readonly value: string;
  readonly label: string;
  readonly icon?: ReactNode;
  /** Its keyboard shortcut, as the platform writes it. */
  readonly shortcut?: string;
};

type Props = {
  /** The block's type now, ticked; null when the blocks differ. */
  value: string | null;
  choices: readonly TurnIntoChoice[];
  onValueChange: (value: string) => void;
};

function Choices({ value, choices, onValueChange }: Props) {
  return (
    <Menu.RadioGroup value={value} onValueChange={(next: string) => onValueChange(next)}>
      {choices.map((choice) => (
        <Menu.RadioItem
          key={choice.value}
          value={choice.value}
          icon={choice.icon}
          detail={choice.shortcut}
          closeOnClick
        >
          {choice.label}
        </Menu.RadioItem>
      ))}
    </Menu.RadioGroup>
  );
}

/** Turn into, in a block's menu: a submenu of the types a text block can become, with the current one ticked. */
export function TurnIntoSubmenu(props: Props) {
  return (
    <Menu.Sub>
      <Menu.SubTrigger
        openOnHover={false}
        icon={<Swap />}
        detail={props.choices.find((choice) => choice.value === props.value)?.label}
      >
        Turn into
      </Menu.SubTrigger>
      <Menu.SubContent className="min-w-48">
        <Choices {...props} />
      </Menu.SubContent>
    </Menu.Sub>
  );
}

/**
 * The same choices behind a trigger of their own, for a toolbar or a popover that isn't a menu. `beside` opens them
 * beside the trigger, as a submenu does, where there's room, and under it on a narrow screen.
 */
export function TurnIntoMenu({
  trigger,
  beside = false,
  ...props
}: Props & { trigger: ReactElement; beside?: boolean }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [side, setSide] = useState<"bottom" | "right">("bottom");

  return (
    <Menu.Root
      onOpenChange={(open) => {
        const room = window.innerWidth - (anchor.current?.getBoundingClientRect().right ?? 0);

        if (open) setSide(beside && room >= 200 ? "right" : "bottom");
      }}
    >
      <Menu.Trigger ref={anchor} render={trigger} />
      <Menu.Content side={side} className="min-w-48">
        <Choices {...props} />
      </Menu.Content>
    </Menu.Root>
  );
}
````

### apps/editor_v2/tests/forms/turn-into.test.ts

````text
import { expect, test } from "vitest";
import { $createParagraphNode, $createTextNode, $getRoot } from "lexical";
import { $isHeadingNode } from "@lexical/rich-text";
import { createFormEditor } from "../helpers/form-editor";
import { govbbFormEditor } from "../../src/presets/govbb-form";

test("a form's text block turns into another through the same Turn into as the toolbar and shortcuts", () => {
  const editor = createFormEditor();

  try {
    editor.update(
      () => {
        const line = $createParagraphNode().append($createTextNode("Before you start"));
        $getRoot().append(line);
        line.selectEnd();

        const offer = govbbFormEditor.turnInto!.$choices();
        expect(offer?.value).toBe("TEXT");
        expect(offer?.choices.map((choice) => choice.label)).toContain("Heading 2");
        govbbFormEditor.turnInto!.$turnInto("HEADING_2");
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      const heading = $getRoot().getLastChild();
      expect($isHeadingNode(heading) && [heading.getTag(), heading.getTextContent()]).toEqual([
        "h2",
        "Before you start",
      ]);
    });
  } finally {
    editor.dispose();
  }
});
````

### apps/editor_v2/tests/pages/turn-into-menus.test.tsx

````text
/** @vitest-environment jsdom */
import { expect, test } from "vitest";
import { act } from "react";
import { govbbPageCodec } from "../../src/presets/govbb-page";
import { pageControl, renderPageEditor, selectPageText } from "../helpers/page-editor";

const body = (editor: Awaited<ReturnType<typeof renderPageEditor>>) =>
  govbbPageCodec.encode(editor.getEditorState().toJSON());

const button = (text: string) =>
  [...document.querySelectorAll<HTMLElement>("button")].find((item) =>
    item.textContent?.startsWith(text),
  )!;

test("Turn into in the block's menu turns the whole block, ticking what it is now", async () => {
  const editor = await renderPageEditor("Who can apply\n\nSecond\n");
  await selectPageText("Who can apply");
  await act(async () => pageControl<HTMLButtonElement>('[aria-label="Block options"]').click());
  await act(async () => button("Turn into").click());

  const choices = [...document.querySelectorAll('[role="menuitemradio"]')];
  expect(choices.find((item) => item.getAttribute("aria-checked") === "true")?.textContent).toMatch(
    /^Text/,
  );

  const heading = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find(
    (item) => item.textContent?.startsWith("Heading 2"),
  );

  await act(async () => heading!.click());
  expect(body(editor)).toBe("## Who can apply\n\nSecond\n");
});

test("a shortcut turns the caret's line into its type, and turns it back into text when it already is", async () => {
  const editor = await renderPageEditor("Fees\n");
  await selectPageText("Fees");

  const press = () =>
    act(async () => {
      pageControl(".page-editable").dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "3",
          code: "Digit3",
          ctrlKey: true,
          altKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });

  await press();
  expect(body(editor)).toBe("### Fees\n");
  await press();
  expect(body(editor)).toBe("Fees\n");
});
````

### apps/editor_v2/tests/pages/turn-into.test.ts

````text
import { expect, test } from "vitest";
import { $getRoot, $isElementNode, $isTextNode, type LexicalEditor } from "lexical";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { $turnLineInto } from "../../src/editor/core/turn-into";
import { govbbPageCodec, govbbPageEditor } from "../../src/presets/govbb-page";

function page(source: string) {
  const prepared = govbbPageCodec.prepare(source);

  if (prepared.mode !== "visual") throw new Error("Expected an editable page");

  return createHeadlessEditor(govbbPageEditor, prepared.state);
}

/** Selects from the start of one piece of text to the end of another, and turns the lines into a type. */
function turn(editor: LexicalEditor, from: string, to: string, type: string) {
  editor.update(
    () => {
      const texts = $getRoot().getAllTextNodes();
      const start = texts.find((node) => node.getTextContent() === from)!;
      const end = texts.find((node) => node.getTextContent() === to)!;
      start.select(0, 0);
      const selection = start.select(0, 0);
      selection.focus.set(end.getKey(), end.getTextContentSize(), "text");
      govbbPageEditor.turnInto!.$turnInto(type);
    },
    { discrete: true },
  );

  return govbbPageCodec
    .encode(editor.getEditorState().toJSON())
    .replace(/^---\n[\s\S]*?---\n\n/, "");
}

function choices(editor: LexicalEditor, text: string) {
  const offers: ReturnType<NonNullable<typeof govbbPageEditor.turnInto>["$choices"]>[] = [];

  editor.update(
    () => {
      $getRoot()
        .getAllTextNodes()
        .find((node) => node.getTextContent() === text)!
        .select(0, 0);
      offers.push(govbbPageEditor.turnInto!.$choices());
    },
    { discrete: true },
  );

  return offers[0] ?? null;
}

test("a line of text turns into a heading, keeping its text", () => {
  expect(turn(page("Who can apply\n"), "Who can apply", "Who can apply", "page-h2")).toBe(
    "## Who can apply\n",
  );
});

test("a list's item turns into text out of the list, which splits around it, and the steps after keep their numbers", () => {
  expect(turn(page("1. One\n2. Two\n3. Three\n"), "Two", "Two", "page-paragraph")).toBe(
    "1. One\n\nTwo\n\n2. Three\n",
  );
});

test("lines turned into a list together make one list, joined to one of its type beside them", () => {
  expect(turn(page("- First\n\nSecond\n\nThird\n"), "Second", "Third", "page-bullet-list")).toBe(
    "- First\n- Second\n- Third\n",
  );
});

test("a line in a list turns the whole list into the other type", () => {
  expect(turn(page("- One\n- Two\n"), "Two", "Two", "page-number-list")).toBe("1. One\n2. Two\n");
});

test("lines turned into a quote together share one, and a quote's line turns back into text outside it", () => {
  expect(turn(page("One\n\nTwo\n"), "One", "Two", "page-quote")).toBe("> One\n>\n> Two\n");
  expect(turn(page("> Quoted\n"), "Quoted", "Quoted", "page-paragraph")).toBe("Quoted\n");
});

test("Turn into offers the page's text blocks, Heading 4 and older headings only where a line is one", () => {
  const editor = page("Text\n\n#### Four\n\n# One\n");
  const titles = (text: string) => choices(editor, text)!.choices.map((choice) => choice.label);

  expect(choices(editor, "Text")?.value).toBe("page-paragraph");
  expect(titles("Text")).toEqual([
    "Text",
    "Heading 2",
    "Heading 3",
    "Quote",
    "Bulleted list",
    "Numbered list",
  ]);
  expect(titles("Four")).toContain("Heading 4");
  expect(choices(editor, "One")?.value).toBe("page-h1");
  expect(titles("One")).toContain("Heading 1");
});

test("text in a table cell or a button doesn't turn", () => {
  const editor = page(
    '| Fee |\n| --- |\n| $5 |\n\n<a data-start-link href="/apply">Start now</a>\n',
  );

  expect(choices(editor, "$5")).toBeNull();
  expect(choices(editor, "Start now")).toBeNull();
});

test("a text choice from the “/” menu turns a line that has text, and leaves an empty one to the insert", () => {
  const editor = page("Fees /h2\n");

  editor.update(
    () => {
      const text = $getRoot().getAllTextNodes()[0]!;
      const typed = text.splitText(5)[1]!;
      typed.select();
      const line = typed.getParent()!;

      expect(
        $turnLineInto(govbbPageEditor, "page-h2", line, typed.getTextContent(), () =>
          typed.remove(),
        ),
      ).toBe(true);
    },
    { discrete: true },
  );
  expect(govbbPageCodec.encode(editor.getEditorState().toJSON())).toBe("## Fees\n");

  const empty = page("/h2\n");

  empty.update(
    () => {
      const text = $getRoot().getAllTextNodes()[0]!;
      const line = text.getParent();

      if (!$isElementNode(line) || !$isTextNode(text)) throw new Error("Expected the typed line");
      text.select();
      expect($turnLineInto(govbbPageEditor, "page-h2", line, "/h2", () => text.remove())).toBe(
        false,
      );
    },
    { discrete: true },
  );
});
````
