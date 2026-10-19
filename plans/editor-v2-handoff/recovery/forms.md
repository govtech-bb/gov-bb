# Unreviewed forms worktree recovery snapshot

Source: `/private/tmp/claude-501/-Users-phrog-Code-work-gov-bb/f9381145-23fe-41a0-a9b6-1f904ff93cae/scratchpad/wt/forms`.

This is an archival Markdown snapshot, not approved implementation. The tracked patch is relative to the recorded HEAD and includes both staged and unstaged changes. The untracked files below must also be recovered. Do not apply blindly to the integration branch.

## Base and original status

```text
bc40e9c4b9731051d901ba1309fcfa5eb43b654b
 M apps/editor_v2/docs/ARCHITECTURE.md
 M apps/editor_v2/scripts/check-boundaries.ts
 M apps/editor_v2/src/editor/react/insert-modal.tsx
 M apps/editor_v2/src/forms/editor/content-module.tsx
 M apps/editor_v2/src/forms/editor/field-module.tsx
 M apps/editor_v2/src/forms/editor/structure/insertion.tsx
 M apps/editor_v2/src/forms/features/calculations/module.tsx
 M apps/editor_v2/src/forms/features/logic/module.tsx
 M apps/editor_v2/src/forms/features/pages/insertion.tsx
 M apps/editor_v2/src/forms/react/authoring-preview.tsx
 M apps/editor_v2/src/presets/form-registry/preview.tsx
 M apps/editor_v2/src/routes/prototypes.components.tsx
?? apps/editor_v2/src/ui/preview-sheet.test.tsx
?? apps/editor_v2/src/ui/preview-sheet.tsx
?? apps/editor_v2/tests/editor/insert-previews.test.tsx
```

## Tracked patch

````diff
diff --git a/apps/editor_v2/docs/ARCHITECTURE.md b/apps/editor_v2/docs/ARCHITECTURE.md
index 49b0c829efbc090f0c297063177b829356c78007..4f7cefa73b611731dff8fc64b303d3c212c6fb1f 100644
--- a/apps/editor_v2/docs/ARCHITECTURE.md
+++ b/apps/editor_v2/docs/ARCHITECTURE.md
@@ -72,7 +72,7 @@ A registration returns its cleanup function. Each editor owns its history and li
 
 ## Contributions and actions
 
-Actions supply stable IDs, labels, grouping, optional numeric order, availability and execution callbacks. Slash and insertion-dialog surfaces read the installed actions. `executeAction(editor, definition, id, request)` opens an update; `$executeAction(...)` is for an existing update. Both enforce editor ownership and recheck availability before trigger removal or mutation. A `$prepare` callback can validate an insertion before returning its commit callback.
+Actions supply stable IDs, labels, grouping, optional numeric order, availability and execution callbacks. Slash and insertion-dialog surfaces read the installed actions. An action's preview draws the block alone: the insertion dialog puts every preview on one `PreviewSheet`, and `PreviewQuestion` sets a question's label, hint and “(optional)” (`src/ui/preview-sheet.tsx`). `executeAction(editor, definition, id, request)` opens an update; `$executeAction(...)` is for an existing update. Both enforce editor ownership and recheck availability before trigger removal or mutation. A `$prepare` callback can validate an insertion before returning its commit callback.
 
 `RendererHost` resolves a named renderer in the current editor; `EditorSlot` renders that editor's ordered slot contributions. Missing renderer contributions fail explicitly. Names include their role, such as `field-preview:text` and `widget:file-upload`, so unrelated content and answer kinds cannot collide.
 
diff --git a/apps/editor_v2/scripts/check-boundaries.ts b/apps/editor_v2/scripts/check-boundaries.ts
index a63f031ee2b9958645d728a282134cf535ad2c4c..1859310091204e0efd20f57d12e974499213c249 100644
--- a/apps/editor_v2/scripts/check-boundaries.ts
+++ b/apps/editor_v2/scripts/check-boundaries.ts
@@ -488,6 +488,7 @@ function permitted(from: string, to: string, typeOnly: boolean) {
           "src/cn.ts",
           "src/editor/react/contributions.tsx",
           "src/editor/react/composer.tsx",
+          "src/ui/preview-sheet.tsx",
         ].includes(to))
     );
 
diff --git a/apps/editor_v2/src/editor/react/insert-modal.tsx b/apps/editor_v2/src/editor/react/insert-modal.tsx
index e32bab30521438c9489e2e81593b7e53eb7603a4..2ba43dac544971797149cacc53c7e989fd19d33b 100644
--- a/apps/editor_v2/src/editor/react/insert-modal.tsx
+++ b/apps/editor_v2/src/editor/react/insert-modal.tsx
@@ -4,6 +4,7 @@ import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "rea
 import { Banner } from "../../ui/banner";
 import { Dialog } from "../../ui/dialog";
 import { RowContent } from "../../ui/menu";
+import { PreviewSheet } from "../../ui/preview-sheet";
 import { groupLabel, listEmpty, row } from "../../ui/surface";
 import {
   $availableActions,
@@ -167,7 +168,7 @@ export function InsertModal({
               <>
                 <div className="text-16 font-semibold">{current.title}</div>
                 <p className="mt-1 text-14 leading-5 text-muted">{current.description}</p>
-                {current.preview}
+                {current.preview && <PreviewSheet>{current.preview}</PreviewSheet>}
               </>
             ) : (
               <>
diff --git a/apps/editor_v2/src/forms/editor/content-module.tsx b/apps/editor_v2/src/forms/editor/content-module.tsx
index 0c8f719dbd77648602f3dbd5e5c4b06d417d23f7..3e3f062cabcb3bcd4f6abeec82c48d06d75e63c4 100644
--- a/apps/editor_v2/src/forms/editor/content-module.tsx
+++ b/apps/editor_v2/src/forms/editor/content-module.tsx
@@ -24,14 +24,7 @@ export function formContentModule(
         entry,
         "Layout blocks",
         order + index,
-        <div
-          aria-hidden="true"
-          className="pointer-events-none mt-5 rounded-sm bg-grey-10 p-4 select-none"
-        >
-          <div className="overflow-hidden rounded-sm bg-white p-5 text-(length:--form-text) shadow-sheet [--form-control:2.75rem] [--form-marker:1.75rem] [--form-text:1rem]">
-            {entry.renderPreview?.(entry.sample ?? {})}
-          </div>
-        </div>,
+        entry.renderPreview?.(entry.sample ?? {}),
       ),
     ),
   };
diff --git a/apps/editor_v2/src/forms/editor/field-module.tsx b/apps/editor_v2/src/forms/editor/field-module.tsx
index da85a85d84485e46b1361a1ac6f88788328ea419..cfb30eff71618c5079d4dab352ec357b49d79f69 100644
--- a/apps/editor_v2/src/forms/editor/field-module.tsx
+++ b/apps/editor_v2/src/forms/editor/field-module.tsx
@@ -1,6 +1,7 @@
 import type { ComponentType, ReactNode } from "react";
 import type { LexicalNode } from "lexical";
 import { defineRenderer, defineSlot } from "../../editor/react/contributions";
+import { PreviewQuestion } from "../../ui/preview-sheet";
 import type { FormModule, ResolvedField } from "../field";
 import type { BlockMenuActions, BlockMenuModel } from "../react/block-settings";
 import { formInsertionAction } from "./insertion-action";
@@ -38,22 +39,14 @@ export function fieldModule({
   Preview: ComponentType<FieldPreviewProps>;
   Renderer?: ComponentType<import("../react/widget-settings").WidgetProps>;
 }): FormModule {
-  const preview = (titled: boolean): ReactNode => (
-    <div
-      aria-hidden="true"
-      className="pointer-events-none mt-5 rounded-sm bg-grey-10 p-4 select-none"
-    >
-      <div className="overflow-hidden rounded-sm bg-white p-5 text-(length:--form-text) shadow-sheet [--form-control:2.75rem] [--form-marker:1.75rem] [--form-text:1rem]">
-        {titled && <div className="font-bold leading-[1.5]">{insertion.question.label}</div>}
-        {titled && insertion.question.hint && (
-          <div className="leading-[1.5] text-muted">{insertion.question.hint}</div>
-        )}
-        <div className="mt-2">
-          <Preview options={insertion.question.options} />
-        </div>
-      </div>
-    </div>
-  );
+  const preview = (titled: boolean): ReactNode =>
+    titled ? (
+      <PreviewQuestion label={insertion.question.label} hint={insertion.question.hint}>
+        <Preview options={insertion.question.options} />
+      </PreviewQuestion>
+    ) : (
+      <Preview options={insertion.question.options} />
+    );
 
   function Inspector({ m, a }: { m: BlockMenuModel; a: BlockMenuActions }) {
     return !!m.header && m.kind === field.kind ? <Controls m={m} a={a} /> : null;
diff --git a/apps/editor_v2/src/forms/editor/structure/insertion.tsx b/apps/editor_v2/src/forms/editor/structure/insertion.tsx
index dfe2ca5e186f1cbc5505e8046fcba2e5ac465000..3bc07a2d70e440e17308ab5296f497b73dc2faad 100644
--- a/apps/editor_v2/src/forms/editor/structure/insertion.tsx
+++ b/apps/editor_v2/src/forms/editor/structure/insertion.tsx
@@ -2,6 +2,7 @@ import { BookmarkSimple } from "@phosphor-icons/react";
 import { $createQuestionNode } from "../nodes";
 import { defineContent } from "../../content";
 import { nativeContent } from "../../native";
+import { PreviewQuestion } from "../../../ui/preview-sheet";
 
 export const questionLabelContent = defineContent({
   kind: "title",
@@ -25,14 +26,5 @@ export const questionLabelEntry = {
 };
 
 export function QuestionLabelPreview() {
-  return (
-    <div
-      aria-hidden="true"
-      className="pointer-events-none mt-5 rounded-sm bg-grey-10 p-4 select-none"
-    >
-      <div className="overflow-hidden rounded-sm bg-white p-5 text-(length:--form-text) shadow-sheet [--form-control:2.75rem] [--form-marker:1.75rem] [--form-text:1rem]">
-        <div className="font-bold leading-[1.5]">{questionLabelEntry.sample.label}</div>
-      </div>
-    </div>
-  );
+  return <PreviewQuestion label={questionLabelEntry.sample.label} />;
 }
diff --git a/apps/editor_v2/src/forms/features/calculations/module.tsx b/apps/editor_v2/src/forms/features/calculations/module.tsx
index 3cc6ae11ba9cc5cb1bcb8e8f9d2745957d9c7f03..cff1524ac6b7f8a6514244f3afaf4980f3cdd337 100644
--- a/apps/editor_v2/src/forms/features/calculations/module.tsx
+++ b/apps/editor_v2/src/forms/features/calculations/module.tsx
@@ -1,7 +1,6 @@
 import { defineRenderer } from "../../../editor/react/contributions";
 import type { FormModule } from "../../field";
 import { formInsertionAction } from "../../editor/insertion-action";
-import { AuthoringInsertionPreview } from "../../react/authoring-preview";
 import { CalculatedFields } from "./presentation";
 import { calculatedFieldsContent, calculationActions } from "./definition";
 import { calculatedFieldsEntry } from "./insertion";
@@ -37,9 +36,7 @@ export function CalculationsModule(): FormModule {
         calculatedFieldsEntry,
         "Advanced blocks",
         4001,
-        <AuthoringInsertionPreview>
-          {calculatedFieldsEntry.renderPreview(calculatedFieldsEntry.sample)}
-        </AuthoringInsertionPreview>,
+        calculatedFieldsEntry.renderPreview(calculatedFieldsEntry.sample),
       ),
     ],
     renderers: [defineRenderer("widget:calculated-fields", CalculatedFields)],
diff --git a/apps/editor_v2/src/forms/features/logic/module.tsx b/apps/editor_v2/src/forms/features/logic/module.tsx
index 147cce1755b62fe7417c3b321b893b85ab17afab..c7f30e45c4c6991a8b5ad1c25726111f1d4c3786 100644
--- a/apps/editor_v2/src/forms/features/logic/module.tsx
+++ b/apps/editor_v2/src/forms/features/logic/module.tsx
@@ -1,7 +1,6 @@
 import { defineRenderer, defineSlot } from "../../../editor/react/contributions";
 import type { FormModule } from "../../field";
 import { formInsertionAction } from "../../editor/insertion-action";
-import { AuthoringInsertionPreview } from "../../react/authoring-preview";
 import { ConditionalLogic } from "./presentation";
 import { LogicRuleLinks } from "./rule-links";
 import { logicActions, logicContent } from "./definition";
@@ -45,9 +44,7 @@ export function ConditionalLogicModule(): FormModule {
         conditionalLogicEntry,
         "Advanced blocks",
         4000,
-        <AuthoringInsertionPreview>
-          {conditionalLogicEntry.renderPreview(conditionalLogicEntry.sample)}
-        </AuthoringInsertionPreview>,
+        conditionalLogicEntry.renderPreview(conditionalLogicEntry.sample),
       ),
     ],
     renderers: [defineRenderer("widget:conditional-logic", ConditionalLogic)],
diff --git a/apps/editor_v2/src/forms/features/pages/insertion.tsx b/apps/editor_v2/src/forms/features/pages/insertion.tsx
index 3e3232bfb74f889ede4e35e9cb3c63bf91eb4db1..0146c2d11157c81774adebc1c70c470007a7bb3c 100644
--- a/apps/editor_v2/src/forms/features/pages/insertion.tsx
+++ b/apps/editor_v2/src/forms/features/pages/insertion.tsx
@@ -11,6 +11,7 @@ import {
 } from "../../editor/nodes";
 import { DEFAULT_REPEATABLE } from "../../core/repetition";
 import { RendererHost } from "../../../editor/react/contributions";
+import { PreviewQuestion } from "../../../ui/preview-sheet";
 import { $installedField } from "../../editor/field-context";
 
 export const pageEntries: Entry[] = [
@@ -104,15 +105,9 @@ export function PageInsertionPreview({ entry }: { entry: Entry }) {
 
   const body =
     entry.id === "DECLARATION_PAGE" ? (
-      <>
-        <div className="font-bold leading-[1.5]">{entry.sample?.label}</div>
-        <div className="mt-2">
-          <RendererHost
-            name="field-preview:checkboxes"
-            props={{ options: entry.sample?.options }}
-          />
-        </div>
-      </>
+      <PreviewQuestion label={entry.sample?.label}>
+        <RendererHost name="field-preview:checkboxes" props={{ options: entry.sample?.options }} />
+      </PreviewQuestion>
     ) : (
       <>
         <div className="-mx-5 flex h-11 items-center justify-between bg-grey-10 px-5 text-14 shadow-[inset_0_1px_0_rgb(0_14_48/0.08),inset_0_-1px_0_rgb(0_14_48/0.08)]">
@@ -135,14 +130,5 @@ export function PageInsertionPreview({ entry }: { entry: Entry }) {
       </>
     );
 
-  return (
-    <div
-      aria-hidden="true"
-      className="pointer-events-none mt-5 rounded-sm bg-grey-10 p-4 select-none"
-    >
-      <div className="overflow-hidden rounded-sm bg-white p-5 text-(length:--form-text) shadow-sheet [--form-control:2.75rem] [--form-marker:1.75rem] [--form-text:1rem]">
-        {body}
-      </div>
-    </div>
-  );
+  return body;
 }
diff --git a/apps/editor_v2/src/forms/react/authoring-preview.tsx b/apps/editor_v2/src/forms/react/authoring-preview.tsx
index d855d8924d8c235f0ffe76229b8de0a9216853dc..bb20406480537757bf35ed304135a97b88b6ba66 100644
--- a/apps/editor_v2/src/forms/react/authoring-preview.tsx
+++ b/apps/editor_v2/src/forms/react/authoring-preview.tsx
@@ -19,16 +19,3 @@ export function AuthoringPreview({
     </div>
   );
 }
-
-export function AuthoringInsertionPreview({ children }: { children: ReactNode }) {
-  return (
-    <div
-      aria-hidden="true"
-      className="pointer-events-none mt-5 rounded-sm bg-grey-10 p-4 select-none"
-    >
-      <div className="overflow-hidden rounded-sm bg-white p-5 text-(length:--form-text) shadow-sheet [--form-control:2.75rem] [--form-marker:1.75rem] [--form-text:1rem]">
-        {children}
-      </div>
-    </div>
-  );
-}
diff --git a/apps/editor_v2/src/presets/form-registry/preview.tsx b/apps/editor_v2/src/presets/form-registry/preview.tsx
index f60c59e2e7f7668405b4f2dd70f68db060acceac..e3dd01a3a33c40bc94421e26e483d815df3922d2 100644
--- a/apps/editor_v2/src/presets/form-registry/preview.tsx
+++ b/apps/editor_v2/src/presets/form-registry/preview.tsx
@@ -6,6 +6,7 @@ import type { RichText, QuestionBase } from "../../forms/schema";
 import { useEditorDefinition } from "../../editor/react/composer";
 import { cn } from "../../cn";
 import { RendererHost } from "../../editor/react/contributions";
+import { PreviewQuestion } from "../../ui/preview-sheet";
 
 const text = (rich: RichText): string =>
   typeof rich === "string"
@@ -93,33 +94,16 @@ export function registryPreviewQuestions(
 export function RegistryEntryPreview({ entry }: { entry: FormRegistryEntry }) {
   const definition = formDefinition(useEditorDefinition());
 
-  return (
-    <div
-      aria-hidden="true"
-      className="pointer-events-none mt-5 rounded-sm bg-grey-10 p-4 select-none"
-    >
-      <div className="overflow-hidden rounded-sm bg-white p-5 text-(length:--form-text) shadow-sheet [--form-control:2.75rem] [--form-marker:1.75rem] [--form-text:1rem]">
-        {registryPreviewQuestions(entry, definition).map(
-          ({ key, label, hint, kind, required, width, mask, options, more, under }) => (
-            <div
-              key={key}
-              className={cn("not-first:mt-5", under && "ml-2.5 border-l-8 border-highlight pl-7")}
-            >
-              <div className="font-bold leading-[1.5]">
-                {label}
-                {!required && <span className="font-normal text-muted"> (optional)</span>}
-              </div>
-              {hint && <div className="leading-[1.5] text-muted">{hint}</div>}
-              <div className="mt-2">
-                <RendererHost
-                  name={`field-preview:${kind}`}
-                  props={{ width, mask, more, options }}
-                />
-              </div>
-            </div>
-          ),
-        )}
+  return registryPreviewQuestions(entry, definition).map(
+    ({ key, label, hint, kind, required, width, mask, options, more, under }) => (
+      <div
+        key={key}
+        className={cn("not-first:mt-5", under && "ml-2.5 border-l-8 border-highlight pl-7")}
+      >
+        <PreviewQuestion label={label} hint={hint} optional={!required}>
+          <RendererHost name={`field-preview:${kind}`} props={{ width, mask, more, options }} />
+        </PreviewQuestion>
       </div>
-    </div>
+    ),
   );
 }
diff --git a/apps/editor_v2/src/routes/prototypes.components.tsx b/apps/editor_v2/src/routes/prototypes.components.tsx
index bebbae19d156633108dc15c999d758a16abc64ec..3cba89fb30f666aec0b4081ba30648e1e7e774d3 100644
--- a/apps/editor_v2/src/routes/prototypes.components.tsx
+++ b/apps/editor_v2/src/routes/prototypes.components.tsx
@@ -46,6 +46,7 @@ import { Input } from "../ui/input";
 import { Menu } from "../ui/menu";
 import { NativeSelect } from "../ui/native-select";
 import { Popover } from "../ui/popover";
+import { PreviewQuestion, PreviewSheet } from "../ui/preview-sheet";
 import { Select, type SelectItem } from "../ui/select";
 import { SidePanel, useSidePanel } from "../ui/side-panel";
 import { Switch } from "../ui/switch";
@@ -70,6 +71,7 @@ const sections = [
   ["badge", "Badge"],
   ["banner", "Banner"],
   ["toast", "Toast"],
+  ["preview-sheet", "Preview sheet"],
 ] as const;
 
 /** Every shared component in its states, to try with the mouse and the keyboard. Nothing here is saved. */
@@ -653,6 +655,25 @@ function ComponentsPreview() {
             </Button>
           </Specimen>
         </Section>
+        <Section
+          id="preview-sheet"
+          title="Preview sheet"
+          lead="Shows a block on its page before it goes in, in the insert dialog."
+        >
+          <Specimen
+            title="A question"
+            note="The label, “(optional)” when it is, the hint, then the answer as the form draws it."
+            wide
+          >
+            <div className="w-full max-w-md">
+              <PreviewSheet>
+                <PreviewQuestion label="Passport number" hint="For example, 502135326" optional>
+                  <div className="h-(--form-control) max-w-[24ch] rounded-sm border-2 border-ink bg-white" />
+                </PreviewQuestion>
+              </PreviewSheet>
+            </div>
+          </Specimen>
+        </Section>
       </main>
     </div>
   );
````

## Untracked files

### apps/editor_v2/src/ui/preview-sheet.test.tsx

````text
/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { PreviewQuestion, PreviewSheet } from "./preview-sheet";

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

test("a sheet is a picture: hidden from screen readers, with the question's parts in GovBB's order", async () => {
  await act(async () =>
    root.render(
      <PreviewSheet>
        <PreviewQuestion label="Passport number" hint="For example, 502135326" optional>
          <span data-answer="">box</span>
        </PreviewQuestion>
      </PreviewSheet>,
    ),
  );

  const sheet = host.firstElementChild!;
  expect(sheet.getAttribute("aria-hidden")).toBe("true");
  expect(sheet.textContent).toBe("Passport number (optional)For example, 502135326box");
});

test("a required question has no optional mark, and a label alone draws no answer", async () => {
  await act(async () =>
    root.render(
      <PreviewSheet>
        <PreviewQuestion label="Which roads do you need to close?" />
      </PreviewSheet>,
    ),
  );

  expect(host.textContent).toBe("Which roads do you need to close?");
  expect(host.querySelectorAll(".mt-2")).toHaveLength(0);
});
````

### apps/editor_v2/src/ui/preview-sheet.tsx

````text
import type { ReactNode } from "react";

/**
 * The page a block's preview is drawn on in the insert dialog: a white sheet on the grey desk, at the form's preview
 * sizes. A picture only, so it is hidden from screen readers and takes no pointer; the dialog says what the block is.
 */
export function PreviewSheet({ children }: { children: ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none mt-5 rounded-sm bg-grey-10 p-4 select-none"
    >
      <div className="overflow-hidden rounded-sm bg-white p-5 text-(length:--form-text) shadow-sheet [--form-control:2.75rem] [--form-marker:1.75rem] [--form-text:1rem]">
        {children}
      </div>
    </div>
  );
}

/** A question in a preview, as GovBB sets it: the label, “(optional)” when it is, the hint, then the answer. */
export function PreviewQuestion({
  label,
  hint,
  optional,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  optional?: boolean;
  /** The answer's drawing. */
  children?: ReactNode;
}) {
  return (
    <>
      <div className="leading-[1.5] font-bold">
        {label}
        {optional && <span className="font-normal text-muted"> (optional)</span>}
      </div>
      {hint && <div className="leading-[1.5] text-muted">{hint}</div>}
      {children && <div className="mt-2">{children}</div>}
    </>
  );
}
````

### apps/editor_v2/tests/editor/insert-previews.test.tsx

````text
/** @vitest-environment jsdom */
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $getRoot,
  type LexicalEditor,
  type SerializedEditorState,
} from "lexical";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { EditorDefinition } from "../../src/editor/core/definition";
import { EditorComposer } from "../../src/editor/react/composer";
import { InsertModal } from "../../src/editor/react/insert-modal";
import { formSchemaToLexical } from "../../src/converters/form-schema-to-lexical";
import { contentEditor } from "../../src/presets/content";
import { govbbFormEditor } from "../../src/presets/govbb-form";
import { emptyNativeForm } from "../helpers/native-form";

let host: HTMLDivElement;

let root: Root;

let editor: LexicalEditor;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // jsdom has no layout: the list's highlighted row has nowhere to scroll
  Element.prototype.scrollIntoView = () => {};

  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  vi.unstubAllGlobals();
});

function Capture() {
  [editor] = useLexicalComposerContext();

  return null;
}

/** Opens the insert dialog on a new last line, then walks every entry it offers. */
async function previewSheets(definition: EditorDefinition, initialState?: SerializedEditorState) {
  const render = (targetKey: string | null) =>
    act(async () =>
      root.render(
        <EditorComposer definition={definition} initialState={initialState}>
          <Capture />
          <InsertModal
            request={targetKey ? { targetKey, mode: "insert" } : null}
            onClose={() => {}}
          />
        </EditorComposer>,
      ),
    );

  await render(null);
  let targetKey = "";
  editor.update(
    () => (targetKey = $getRoot().append($createParagraphNode()).getLastChild()!.getKey()),
    {
      discrete: true,
    },
  );
  await render(targetKey);

  const search = document.querySelector<HTMLInputElement>('input[aria-label="Search blocks"]')!;
  const sheets: Record<string, number> = {};

  for (const option of document.querySelectorAll('[role="option"]')) {
    const pane = document.querySelector('[role="listbox"]')!.nextElementSibling!;
    sheets[option.textContent!] = pane.querySelectorAll(".shadow-sheet").length;
    await act(async () => {
      search.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });
  }

  return sheets;
}

test("the insert dialog draws every block's preview on one sheet, in the form and in content", async () => {
  const form = formSchemaToLexical(emptyNativeForm, govbbFormEditor);

  if (form.status !== "ready") throw Error(form.diagnostics[0]?.message);
  const formSheets = await previewSheets(govbbFormEditor, form.state);

  expect(Object.keys(formSheets).length).toBeGreaterThan(20);
  expect(Object.entries(formSheets).filter(([, count]) => count !== 1)).toEqual([]);

  await act(async () => root.render(null));
  const contentSheets = await previewSheets(contentEditor);

  expect(Object.keys(contentSheets)).toContain("Heading 2");
  expect(Object.entries(contentSheets).filter(([, count]) => count !== 1)).toEqual([]);
});
````
