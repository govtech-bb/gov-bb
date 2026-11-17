import { expect, test } from "vitest";
import { boundaryIssues } from "./check-boundaries";

test("prose templates use the design system without depending on workspace or persistence", () => {
  const check = (source: string) =>
    boundaryIssues(new Map([["src/templates/prose-page.tsx", source]]));

  expect(
    check(
      'import { Header } from "@govtech-bb/react"; import styles from "@govtech-bb/frontend/css?inline"; document.getElementById("preview");',
    ),
  ).toEqual([]);
  expect(check('import { compileContentMarkdown } from "@govtech-bb/govbbmarkd";')).toEqual([]);
  expect(check('import { hideStartLinks } from "@govtech-bb/govbbmarkd/form-links";')).toEqual([]);
  expect(check('import { save } from "../persistence/save";')).toHaveLength(1);
  expect(check('import { editor } from "../host/page-editor";')).toHaveLength(1);
  expect(
    boundaryIssues(new Map([["src/templates/prose-page-content.ts", "document.body;"]])),
  ).toHaveLength(1);
  expect(
    boundaryIssues(new Map([["src/host/site-preview.tsx", "import(location.href);"]])),
  ).toHaveLength(1);
});

test("completed boundaries reject runtime imports, re-exports and dynamic imports of legacy UI", () => {
  for (const source of [
    'import { Widget } from "../../canvas/widgets";',
    'export { Widget } from "../../canvas/widgets";',
    'const load = () => import("../../canvas/widgets");',
    'const widgets = require("../../canvas/widgets");',
    'import { type WidgetProps, Widget } from "../../canvas/widgets";',
  ]) {
    const issues = boundaryIssues(
      new Map([
        ["src/forms/model/example.ts", source],
        ["src/canvas/widgets.tsx", ""],
      ]),
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain("Runtime import");
  }
});

test("retired type-only bridges cannot be reintroduced after their owners move", () => {
  const check = (file: string, source: string) =>
    boundaryIssues(
      new Map([
        [file, source],
        ["src/canvas/dynamic-text.ts", ""],
      ]),
    );

  expect(
    check(
      "src/forms/model/logic.ts",
      'import type { DurationTransform } from "../../canvas/dynamic-text";',
    ),
  ).toHaveLength(1);
  expect(
    check(
      "src/forms/model/logic.ts",
      'import { DurationTransform } from "../../canvas/dynamic-text";',
    ),
  ).toHaveLength(1);
  expect(
    check(
      "src/forms/model/other.ts",
      'import type { DurationTransform } from "../../canvas/dynamic-text";',
    ),
  ).toHaveLength(1);
});

test("pure helpers reject browser globals while local document data remains valid", () => {
  const check = (source: string) =>
    boundaryIssues(new Map([["src/forms/model/example.ts", source]]));

  expect(check("export const platform = navigator.userAgent;")).toHaveLength(1);
  expect(check("export const storage = globalThis.localStorage;")).toHaveLength(1);
  expect(check('export const body = globalThis["document"].body;')).toHaveLength(1);
  expect(check("export const body = globalThis[`document`].body;")).toHaveLength(1);
  expect(
    check(
      "function local(document: object) { return document; } export const browser = document.body;",
    ),
  ).toHaveLength(1);
  expect(
    check(
      "function local() { const document = {}; return document; } export const browser = document.body;",
    ),
  ).toHaveLength(1);
  expect(
    check("export function title(document: { title: string }) { return document.title; }"),
  ).toEqual([]);
});

test("generic editor core cannot import form contracts even as types", () => {
  const issues = boundaryIssues(
    new Map([
      ["src/editor/core/example.ts", 'import type { Settings } from "../../forms/model/settings";'],
      ["src/forms/model/settings.ts", ""],
    ]),
  );

  expect(issues).toHaveLength(1);
});

test("form composition can use generic core contracts without depending on editor React runtime", () => {
  const check = (source: string) =>
    boundaryIssues(
      new Map([
        ["src/forms/model/definition.ts", source],
        ["src/editor/index.ts", ""],
        ["src/editor/core/definition.ts", ""],
        ["src/editor/react/index.ts", ""],
      ]),
    );

  expect(check('import { defineEditor, type EditorModule } from "@/editor";')).toEqual([]);
  expect(check('import { defineEditor } from "../../editor";')).toEqual([]);
  expect(check('import { useEditorDefinition } from "@/editor/react";')).toHaveLength(1);
});

test("generic React surfaces and modules reject product imports while allowing browser and shared UI", () => {
  const check = (file: string, source: string) =>
    boundaryIssues(
      new Map([
        [file, source],
        ["src/forms/model/settings.ts", ""],
        ["src/canvas/widgets.tsx", ""],
        ["src/ui/button.tsx", ""],
      ]),
    );

  expect(
    check(
      "src/editor/react/menu.tsx",
      'import { Button } from "../../ui/button"; export const documentTitle = document.title;',
    ),
  ).toEqual([]);
  expect(
    check(
      "src/editor/react/menu.tsx",
      'import type { Settings } from "../../forms/model/settings";',
    ),
  ).toHaveLength(1);
  expect(
    check("src/editor/react/menu.tsx", 'const load = () => import("../../canvas/widgets");'),
  ).toHaveLength(1);
  expect(
    check(
      "src/editor/modules/example/module.ts",
      'export { widgets } from "../../../canvas/widgets";',
    ),
  ).toHaveLength(1);
  expect(
    check("src/editor/modules/example/module.ts", 'import { token } from "@govtech-bb/frontend";'),
  ).toHaveLength(1);
});

test("configured source and converter boundaries reject default presets and browser composition", () => {
  const files = new Map([
    ["src/presets/govbb-form.ts", ""],
    ["src/forms/legacy/definition.ts", ""],
    ["src/forms/formats/markdown/dialect.ts", ""],
    ["src/forms/definition.ts", ""],
  ]);

  for (const [file, source] of [
    [
      "src/forms/formats/markdown/example.ts",
      'import { govbbFormEditor } from "../../presets/govbb-form";',
    ],
    [
      "src/converters/lexical-to-form-markdown.ts",
      'import { legacyFormDefinition } from "../forms/legacy/definition";',
    ],
  ])
    expect(boundaryIssues(new Map([...files, [file!, source!]]))).toHaveLength(1);
  expect(
    boundaryIssues(
      new Map([
        ...files,
        [
          "src/converters/lexical-to-form-markdown.ts",
          'import { createFormSourceDialect } from "../forms/formats/markdown/dialect"; import type { FormEditorDefinition } from "../forms/definition";',
        ],
      ]),
    ),
  ).toEqual([]);
});

test("migrated field modules cannot reach the privileged legacy canvas", () => {
  expect(
    boundaryIssues(
      new Map([
        ["src/forms/fields/custom.ts", 'import { $createInputNode } from "../../canvas/nodes";'],
        ["src/canvas/nodes.tsx", ""],
      ]),
    ),
  ).toHaveLength(1);
});

test("migrated form editor and React owners reject canvas dependencies without banning their browser UI", () => {
  const files = new Map([
    ["src/canvas/nodes.tsx", ""],
    ["src/forms/model/settings.ts", ""],
  ]);

  for (const file of ["src/forms/canvas/example.ts", "src/forms/canvas/example.tsx"]) {
    expect(
      boundaryIssues(
        new Map([...files, [file, 'import { InputNode } from "../../canvas/nodes";']]),
      ),
    ).toHaveLength(1);
    expect(
      boundaryIssues(
        new Map([
          ...files,
          [file, "export const measure = () => document.body.getBoundingClientRect();"],
        ]),
      ),
    ).toEqual([]);
  }
});

test("pure stored form models cannot depend on the legacy output target", () => {
  expect(
    boundaryIssues(
      new Map([
        [
          "src/forms/model/example.ts",
          'import type { LegacySsbFormSchema } from "../formats/legacy-ssb/projection/schema";',
        ],
        ["src/forms/formats/legacy-ssb/projection/schema.ts", ""],
      ]),
    ),
  ).toHaveLength(1);
});

test("native schema has no editor, browser, preset or legacy dependencies even as types", () => {
  const check = (source: string) =>
    boundaryIssues(
      new Map([
        ["src/forms/formats/native/schema/example.ts", source],
        ["src/forms/formats/native/schema/types.ts", ""],
        ["src/forms/native.ts", ""],
        ["src/forms/model/settings.ts", ""],
        ["src/forms/formats/legacy-ssb/projection/schema.ts", ""],
      ]),
    );

  expect(check('import type { FormDefinitionV2 } from "./types";')).toEqual([]);

  for (const source of [
    'import type { EditorState } from "lexical";',
    'import type { ReactNode } from "react";',
    'import type { NativeFieldHandler } from "../../../native";',
    'import type { LegacySsbFormSchema } from "../../legacy-ssb/projection/schema";',
    'import type { Settings } from "../../../model/settings";',
    "export const storage = localStorage;",
  ])
    expect(check(source)).toHaveLength(1);
});

test("native module contracts permit serialized types without constructing editor nodes", () => {
  const check = (source: string) =>
    boundaryIssues(
      new Map([
        ["src/forms/native.ts", source],
        ["src/forms/formats/native/schema/types.ts", ""],
        ["src/forms/definition.ts", ""],
      ]),
    );

  expect(
    check(
      'import type { SerializedLexicalNode } from "lexical"; import type { FormEditorDefinition } from "./definition";',
    ),
  ).toEqual([]);
  expect(check('import { $createParagraphNode } from "lexical";')).toHaveLength(1);
  expect(check("export const element = document.body;")).toHaveLength(1);
});

test("native declarations cannot import compatibility schema types", () => {
  for (const file of [
    "src/forms/field.ts",
    "src/forms/content/define-content.ts",
    "src/forms/fields/text-input.tsx",
  ]) {
    const source =
      file.includes("content/") || file.includes("fields/")
        ? 'import type { Rule } from "../formats/legacy-ssb/projection/rules";'
        : 'import type { Rule } from "./formats/legacy-ssb/projection/rules";';

    expect(
      boundaryIssues(
        new Map([
          [file, source],
          ["src/forms/formats/legacy-ssb/projection/rules.ts", ""],
        ]),
      ),
    ).toHaveLength(1);
  }
});

test("native converters can use their configured bridge without importing concrete field UI", () => {
  const check = (file: string, source: string) =>
    boundaryIssues(
      new Map([
        [file, source],
        ["src/forms/formats/native/native-bindings.ts", ""],
        ["src/forms/fields/number.tsx", ""],
        ["src/forms/formats/native/schema/types.ts", ""],
        ["src/forms/formats/legacy-ssb/projection/schema.ts", ""],
      ]),
    );

  for (const file of [
    "src/converters/form-schema-to-lexical.ts",
    "src/converters/lexical-to-form-schema.ts",
  ]) {
    expect(
      check(
        file,
        'import { nativeBridge } from "../forms/formats/native/native-bindings"; import type { FormDefinitionV2 } from "../forms/formats/native/schema/types";',
      ),
    ).toEqual([]);
    expect(check(file, 'import { NumberInput } from "../forms/fields/number";')).toHaveLength(1);
    expect(
      check(
        file,
        'import type { LegacySsbFormSchema } from "../forms/formats/legacy-ssb/projection/schema";',
      ),
    ).toHaveLength(1);
  }
});

test("persistence accepts the serialized document type but no editor runtime, form preset or browser access", () => {
  const check = (source: string) =>
    boundaryIssues(
      new Map([
        ["src/persistence/example.ts", source],
        ["src/presets/govbb-form.ts", ""],
      ]),
    );

  expect(check('import type { SerializedEditorState } from "lexical";')).toEqual([]);
  expect(check('import { createEditor } from "lexical";')).toHaveLength(1);
  expect(check('import { govbbFormCodec } from "../presets/govbb-form";')).toHaveLength(1);
  expect(check('export const stored = localStorage.getItem("draft");')).toHaveLength(1);
});

test("legacy SSB transformation remains independent of Lexical, concrete features and browser UI", () => {
  const check = (source: string) =>
    boundaryIssues(
      new Map([
        ["src/forms/formats/legacy-ssb/projection/example.ts", source],
        ["src/forms/fields/grouped-checkboxes-groups.ts", ""],
      ]),
    );

  expect(check('import type { EditorState } from "lexical";')).toHaveLength(1);
  expect(check('import { $getRoot } from "lexical";')).toHaveLength(1);
  expect(
    check('import type { FormGroup } from "../../fields/grouped-checkboxes-groups";'),
  ).toHaveLength(1);
  expect(check("export const body = document.body;")).toHaveLength(1);
});

test("public conversion permits only its declared configured editor bridge", () => {
  const check = (file: string, source: string) =>
    boundaryIssues(
      new Map([
        [file, source],
        ["src/forms/canvas/form-runtime.ts", ""],
        ["src/forms/canvas/form-compile.ts", ""],
        ["src/forms/form-pages/form-page-presentation.tsx", ""],
      ]),
    );

  expect(
    check(
      "src/converters/form-markdown-to-lexical.ts",
      'import { createFormRuntime } from "../forms/canvas/form-runtime";',
    ),
  ).toEqual([]);
  expect(
    check(
      "src/converters/lexical-to-legacy-ssb.ts",
      'import { compileForm } from "../forms/canvas/form-compile";',
    ),
  ).toEqual([]);
  expect(
    check(
      "src/converters/lexical-to-form-schema.ts",
      'import { compileForm } from "../forms/canvas/form-compile";',
    ),
  ).toHaveLength(1);
  expect(
    check(
      "src/converters/lexical-to-form-markdown.ts",
      'import { createFormRuntime } from "../forms/canvas/form-runtime";',
    ),
  ).toHaveLength(1);
  expect(
    check(
      "src/converters/form-markdown-to-lexical.ts",
      'import { PageBreak } from "../forms/form-pages/form-page-presentation";',
    ),
  ).toHaveLength(1);
});

test("declarative registry modules cannot construct Lexical nodes or depend on a default preset", () => {
  const files = new Map([
    ["src/forms/formats/markdown/model.ts", ""],
    ["src/forms/form-registry/builders.ts", ""],
    ["src/forms/canvas/form-nodes.tsx", ""],
    ["src/presets/form-registry/entries.tsx", ""],
  ]);

  const check = (file: string, source: string) =>
    boundaryIssues(new Map([...files, [file, source]]));

  expect(
    check(
      "src/forms/form-registry/custom.ts",
      'import type { SourceBlock } from "../formats/markdown/model";',
    ),
  ).toHaveLength(1);
  expect(
    check("src/forms/form-registry/custom.ts", 'import { $createParagraphNode } from "lexical";'),
  ).toHaveLength(1);
  expect(
    check(
      "src/forms/form-registry/custom.ts",
      'import { govbbFormRegistry } from "../../presets/form-registry/entries";',
    ),
  ).toHaveLength(1);
  expect(
    check(
      "src/presets/form-registry/custom.ts",
      'import { question } from "../../forms/form-registry/builders";',
    ),
  ).toEqual([]);
  expect(
    check(
      "src/presets/form-registry/custom.ts",
      'import { $createInputNode } from "../../forms/canvas/form-nodes";',
    ),
  ).toHaveLength(1);
});

test("public composition is supported without upward preset imports or internal barrel cycles", () => {
  const files = new Map([
    ["src/editor/index.ts", ""],
    ["src/forms/index.ts", ""],
    ["src/forms/modules.ts", ""],
    ["src/forms/canvas/form-nodes.tsx", ""],
    ["src/forms/fields/text-input.tsx", ""],
    ["src/presets/form-registry/entries.tsx", ""],
    ["src/presets/govbb-form.ts", ""],
  ]);

  const check = (file: string, source: string) =>
    boundaryIssues(new Map([...files, [file, source]]));

  expect(
    check(
      "src/presets/govbb-form.ts",
      'import { defineFormEditor } from "../forms"; import { TextInputModule } from "../forms/modules";',
    ),
  ).toEqual([]);
  expect(
    check(
      "src/presets/govbb-form.ts",
      'import { TextInputModule } from "../forms/fields/text-input";',
    ),
  ).toHaveLength(1);
  expect(
    check(
      "src/forms/canvas/example.ts",
      'import { govbbFormRegistry } from "../../presets/form-registry/entries";',
    ),
  ).toHaveLength(1);
  expect(check("src/forms/fields/custom.ts", 'import { defineField } from "..";')).toHaveLength(1);
  expect(
    check("src/editor/modules/custom/module.ts", 'import { defineEditor } from "../..";'),
  ).toHaveLength(1);
  expect(check("src/forms/index.ts", 'export { InputNode } from "./editor/nodes";')).toEqual([]);
  expect(
    check("src/forms/index.ts", 'export { govbbFormEditor } from "../presets/govbb-form";'),
  ).toHaveLength(1);
});

test("shared UI cannot hide a dependency on form data or a preset", () => {
  const files = new Map([
    ["src/forms/model/dates.ts", ""],
    ["src/presets/govbb-form.ts", ""],
  ]);

  const check = (source: string) =>
    boundaryIssues(new Map([...files, ["src/ui/example.tsx", source]]));

  expect(check('export { parseDay } from "../forms/model/dates";')).toHaveLength(1);
  expect(check('import { govbbFormEditor } from "../presets/govbb-form";')).toHaveLength(1);
  expect(
    check(
      'import { parseISO } from "date-fns"; export const focused = () => document.activeElement;',
    ),
  ).toEqual([]);
});

test("page modules use generic editor contracts without depending on forms, presets or workspace hosts", () => {
  const files = new Map([
    ["src/editor/index.ts", ""],
    ["src/editor/modules/index.ts", ""],
    ["src/pages/definition.ts", ""],
    ["src/forms/model/settings.ts", ""],
    ["src/forms/canvas/form-nodes.tsx", ""],
    ["src/presets/govbb-page.ts", ""],
    ["src/host/page-editor.tsx", ""],
    ["src/workspace/page-sync.ts", ""],
  ]);

  const check = (source: string) =>
    boundaryIssues(new Map([...files, ["src/pages/modules/custom.tsx", source]]));

  expect(
    check(
      'import type { EditorModule } from "@/editor"; import type { PageModule } from "../definition";',
    ),
  ).toEqual([]);
  expect(check('import { FormattingModule } from "@/editor/modules";')).toEqual([]);
  expect(check('import { parseContentMarkdown } from "@govtech-bb/govbbmarkd";')).toEqual([]);
  expect(check('import { renderMarkdownNodes } from "@govtech-bb/govbbmarkd/react";')).toEqual([]);
  expect(
    check('import { parseLegacyPageStartLink } from "@govtech-bb/govbbmarkd/legacy";'),
  ).toEqual([]);
  expect(check('import { isSafeContentUrl } from "@govtech-bb/govbbmarkd/content-url";')).toEqual(
    [],
  );

  for (const source of [
    'import type { Settings } from "../../forms/model/settings";',
    'import { FormTitleNode } from "../../forms/canvas/form-nodes";',
    'import { govbbPageEditor } from "../../presets/govbb-page";',
    'const load = () => import("../../host/page-editor");',
    'export { savePageDraft } from "../../workspace/page-sync";',
    'import { loadContent } from "@govtech-bb/content/load";',
  ])
    expect(check(source)).toHaveLength(1);
});

test("public page converters use page conversion contracts without importing form or browser surfaces", () => {
  const files = new Map([
    ["src/pages/converters.ts", ""],
    ["src/pages/definition.ts", ""],
    ["src/pages/editor.tsx", ""],
    ["src/forms/formats/native/native-bindings.ts", ""],
    ["src/presets/govbb-page.ts", ""],
  ]);

  for (const file of [
    "src/converters/page-markdown-to-lexical.ts",
    "src/converters/lexical-to-page-markdown.ts",
  ]) {
    const check = (source: string) => boundaryIssues(new Map([...files, [file, source]]));
    expect(
      check(
        'export { pageMarkdownToLexical } from "../pages/converters"; import type { PageEditorDefinition } from "../pages/definition";',
      ),
    ).toEqual([]);
    expect(check('export { PageEditor } from "../pages/editor";')).toHaveLength(1);
    expect(
      check('import { serializedToNativeForm } from "../forms/formats/native/native-bindings";'),
    ).toHaveLength(1);
    expect(check('import { govbbPageEditor } from "../presets/govbb-page";')).toHaveLength(1);
    expect(check('export const saved = localStorage.getItem("page");')).toHaveLength(1);
  }
});

test("workspace composition may assemble both document domains while reusable layers cannot reach upward", () => {
  const files = new Map([
    ["src/pages/converters.ts", ""],
    ["src/forms/formats/native/native-bindings.ts", ""],
    ["src/host/page-editor.tsx", ""],
    ["src/presets/govbb-page.ts", ""],
    ["src/persistence/draft-store.ts", ""],
    ["src/workspace/page-sync.ts", ""],
  ]);

  expect(
    boundaryIssues(
      new Map([
        ...files,
        [
          "src/workspace/composition.ts",
          'import { PageDraftEditor } from "../host/page-editor"; import { govbbPageEditor } from "../presets/govbb-page"; import { DraftStore } from "../persistence/draft-store"; import { serializedToNativeForm } from "../forms/formats/native/native-bindings";',
        ],
      ]),
    ),
  ).toEqual([]);

  for (const file of [
    "src/pages/example.ts",
    "src/persistence/example.ts",
    "src/ui/example.tsx",
    "src/editor/core/example.ts",
  ])
    expect(
      boundaryIssues(
        new Map([
          ...files,
          [
            file,
            `import { savePageDraft } from "${file.startsWith("src/editor/") ? "../../" : "../"}workspace/page-sync";`,
          ],
        ]),
      ),
    ).toHaveLength(1);
});

test("pure converters and workspace modules reject browser globals while browser modules allow them", () => {
  for (const file of [
    "src/converters/form-markdown-to-lexical.ts",
    "src/converters/form-schema-to-lexical.ts",
    "src/converters/lexical-to-form-markdown.ts",
    "src/converters/lexical-to-form-schema.ts",
    "src/converters/lexical-to-legacy-ssb.ts",
    "src/converters/lexical-to-page-markdown.ts",
    "src/converters/page-markdown-to-lexical.ts",
    "src/pages/markdown.ts",
    "src/pages/converters.ts",
    "src/pages/definition.ts",
    "src/workspace/model.ts",
    "src/workspace/validation.ts",
    "src/workspace/page-sync.ts",
    "src/workspace/service-pages.ts",
  ]) {
    expect(
      boundaryIssues(
        new Map([[file, 'export const source = globalThis.localStorage.getItem("draft");']]),
      ),
    ).toHaveLength(1);
    expect(
      boundaryIssues(
        new Map([
          [file, "export function title(document: { title: string }) { return document.title; }"],
        ]),
      ),
    ).toEqual([]);
  }

  for (const file of [
    "src/pages/editor.tsx",
    "src/pages/modules/custom.tsx",
    "src/workspace/workspace.tsx",
  ])
    expect(boundaryIssues(new Map([[file, "export const body = document.body;"]]))).toEqual([]);
});

test("routing stays in the workspace UI", () => {
  const source = 'import { Link } from "@tanstack/react-router";';

  for (const file of ["src/workspace/workspace.tsx", "src/workspace/remote-page-pane.tsx"])
    expect(boundaryIssues(new Map([[file, source]]))).toEqual([]);

  for (const file of [
    "src/workspace/model.ts",
    "src/workspace/page-sync.ts",
    "src/workspace/service-pages.ts",
    "src/pages/editor.tsx",
    "src/host/page-editor.tsx",
  ])
    expect(boundaryIssues(new Map([[file, source]]))).toHaveLength(1);
});

const editorFiles = [
  ["src/editor/index.ts", ""],
  ["src/editor/react/index.ts", ""],
  ["src/editor/modules/index.ts", ""],
  ["src/editor/core/actions.ts", ""],
  ["src/editor/core/definition.ts", ""],
  ["src/editor/react/block-rail.tsx", ""],
  ["src/editor/react/editor.tsx", ""],
  ["src/editor/react/shortcut.ts", ""],
  ["src/editor/modules/text/module.ts", ""],
] as const;

const checkEditor = (file: string, source: string) =>
  boundaryIssues(new Map([...editorFiles, [file, source]]));

test("code outside the editor reaches it only through its three entry points", () => {
  for (const source of [
    'import { rankActions } from "@/editor";',
    'import { BlockRail } from "@/editor/react";',
    'import { TextModule } from "@/editor/modules";',
    'import { BlockRail } from "../editor/react";',
    'import { BlockRail } from "@/editor/./react";',
  ])
    expect(checkEditor("src/pages/custom.tsx", source)).toEqual([]);

  for (const [file, source] of [
    ["src/pages/custom.tsx", 'import { BlockRail } from "../editor/react/block-rail";'],
    ["src/pages/custom.tsx", 'import { BlockRail } from "@/editor/react/block-rail";'],
    ["src/forms/canvas/custom.ts", 'import { rankActions } from "../../editor/core/actions";'],
    ["src/presets/custom.ts", 'export { TextModule } from "../editor/modules/text/module";'],
    // Dot segments in an alias can't hide a deep import
    ["src/api/custom.ts", 'import { BlockRail } from "@/./editor/react/block-rail";'],
    ["src/api/custom.ts", 'import { BlockRail } from "@/editor/core/../react/block-rail";'],
    // Layers without boundary rules of their own keep to the entry points too
    ["src/api/custom.ts", 'import { rankActions } from "../editor/core/actions";'],
    ["src/routes/custom.tsx", 'import { BlockRail } from "../editor/react/block-rail";'],
    ["src/app.tsx", 'import { rankActions } from "./editor/core/actions";'],
  ] as const) {
    const issues = checkEditor(file, source);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain("Editor import bypasses its entry points");
  }

  // Tests may reach inside
  expect(
    checkEditor(
      "src/pages/custom.test.tsx",
      'import { BlockRail } from "../editor/react/block-rail";',
    ),
  ).toEqual([]);
});

test("the editor's own modules, entry points included, never import an entry point", () => {
  for (const [file, source] of [
    ["src/editor/react/custom.tsx", 'import { rankActions } from "../core/actions";'],
    ["src/editor/modules/text/custom.ts", 'import { composing } from "../../react/shortcut";'],
    ["src/editor/react/index.ts", 'export { Editor } from "./editor";'],
  ] as const)
    expect(checkEditor(file, source)).toEqual([]);

  for (const [file, source] of [
    // Each layer may otherwise import the other, so only this rule stops these
    ["src/editor/react/custom.tsx", 'import { TextModule } from "@/editor/modules";'],
    ["src/editor/modules/text/custom.ts", 'import { BlockRail } from "@/editor/react";'],
    ["src/editor/react/custom.tsx", 'import { rankActions } from "..";'],
    // A file at the editor's root has no layer, and is still held to it
    ["src/editor/helper.ts", 'import { Editor } from "@/editor/react";'],
    // Nor may an entry point import itself
    ["src/editor/index.ts", 'export { rankActions } from "@/editor";'],
    ["src/editor/react/index.ts", 'export { Editor } from "@/editor/react";'],
    ["src/editor/modules/index.ts", 'export { TextModule } from "./index";'],
  ] as const) {
    const issues = checkEditor(file, source);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain("Editor module imports an editor entry point");
  }
});

test("each editor entry point re-exports only its own layer, so the headless one stays free of React", () => {
  for (const [file, source] of [
    ["src/editor/index.ts", 'export { defineEditor } from "./core/definition";'],
    ["src/editor/react/index.ts", 'export { Editor } from "./editor";'],
    ["src/editor/modules/index.ts", 'export { TextModule } from "./text/module";'],
  ] as const)
    expect(checkEditor(file, source)).toEqual([]);

  for (const [file, source] of [
    ["src/editor/index.ts", 'export { Editor } from "./react/editor";'],
    ["src/editor/index.ts", 'export { Editor } from "@/editor/core/../react/editor";'],
    ["src/editor/index.ts", 'export { TextModule } from "./modules/text/module";'],
    ["src/editor/react/index.ts", 'export { TextModule } from "../modules/text/module";'],
    ["src/editor/modules/index.ts", 'export { Editor } from "../react/editor";'],
  ] as const) {
    const issues = checkEditor(file, source);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain("crosses a completed boundary");
  }
});
