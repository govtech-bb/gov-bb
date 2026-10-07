import { expect, test } from "vitest";
import { boundaryIssues } from "./check-boundaries";

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
        ["src/forms/core/example.ts", source],
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
      "src/forms/core/logic.ts",
      'import type { DurationTransform } from "../../canvas/dynamic-text";',
    ),
  ).toHaveLength(1);
  expect(
    check(
      "src/forms/core/logic.ts",
      'import { DurationTransform } from "../../canvas/dynamic-text";',
    ),
  ).toHaveLength(1);
  expect(
    check(
      "src/forms/core/other.ts",
      'import type { DurationTransform } from "../../canvas/dynamic-text";',
    ),
  ).toHaveLength(1);
});

test("pure helpers reject browser globals while local document data remains valid", () => {
  const check = (source: string) =>
    boundaryIssues(new Map([["src/forms/core/example.ts", source]]));

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
      ["src/editor/core/example.ts", 'import type { Settings } from "../../forms/core/settings";'],
      ["src/forms/core/settings.ts", ""],
    ]),
  );

  expect(issues).toHaveLength(1);
});

test("form composition can use generic core contracts without depending on editor React runtime", () => {
  const check = (source: string) =>
    boundaryIssues(
      new Map([
        ["src/forms/core/definition.ts", source],
        ["src/editor/core/definition.ts", ""],
        ["src/editor/core/module.ts", ""],
        ["src/editor/react/context.tsx", ""],
      ]),
    );

  expect(
    check(
      'import { defineEditor } from "../../editor/core/definition"; import type { EditorModule } from "../../editor/core/module";',
    ),
  ).toEqual([]);
  expect(check('import { useEditorDefinition } from "../../editor/react/context";')).toHaveLength(
    1,
  );
});

test("generic React surfaces and modules reject product imports while allowing browser and shared UI", () => {
  const check = (file: string, source: string) =>
    boundaryIssues(
      new Map([
        [file, source],
        ["src/forms/core/settings.ts", ""],
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
      'import type { Settings } from "../../forms/core/settings";',
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
    ["src/forms/source/dialect.ts", ""],
    ["src/forms/definition.ts", ""],
  ]);

  for (const [file, source] of [
    ["src/forms/source/example.ts", 'import { govbbFormEditor } from "../../presets/govbb-form";'],
    [
      "src/converters/lexicalToMarkdown/index.ts",
      'import { legacyFormDefinition } from "../../forms/legacy/definition";',
    ],
  ])
    expect(boundaryIssues(new Map([...files, [file!, source!]]))).toHaveLength(1);
  expect(
    boundaryIssues(
      new Map([
        ...files,
        [
          "src/converters/lexicalToMarkdown/index.ts",
          'import { createFormSourceDialect } from "../../forms/source/dialect"; import type { FormEditorDefinition } from "../../forms/definition";',
        ],
      ]),
    ),
  ).toEqual([]);
});

test("migrated field modules cannot reach the privileged legacy canvas", () => {
  expect(
    boundaryIssues(
      new Map([
        [
          "src/forms/features/custom/module.ts",
          'import { $createInputNode } from "../../../canvas/nodes";',
        ],
        ["src/canvas/nodes.tsx", ""],
      ]),
    ),
  ).toHaveLength(1);
});

test("migrated form editor and React owners reject canvas dependencies without banning their browser UI", () => {
  const files = new Map([
    ["src/canvas/nodes.tsx", ""],
    ["src/forms/core/settings.ts", ""],
  ]);

  for (const file of ["src/forms/editor/example.ts", "src/forms/react/example.tsx"]) {
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
          "src/forms/core/example.ts",
          'import type { LegacySsbFormSchema } from "../adapters/ssb/schema";',
        ],
        ["src/forms/adapters/ssb/schema.ts", ""],
      ]),
    ),
  ).toHaveLength(1);
});

test("native schema has no editor, browser, preset or legacy dependencies even as types", () => {
  const check = (source: string) =>
    boundaryIssues(
      new Map([
        ["src/forms/schema/example.ts", source],
        ["src/forms/schema/types.ts", ""],
        ["src/forms/native.ts", ""],
        ["src/forms/core/settings.ts", ""],
        ["src/forms/adapters/ssb/schema.ts", ""],
      ]),
    );

  expect(check('import type { FormDefinitionV2 } from "./types";')).toEqual([]);

  for (const source of [
    'import type { EditorState } from "lexical";',
    'import type { ReactNode } from "react";',
    'import type { NativeFieldHandler } from "../native";',
    'import type { LegacySsbFormSchema } from "../adapters/ssb/schema";',
    'import type { Settings } from "../core/settings";',
    "export const storage = localStorage;",
  ])
    expect(check(source)).toHaveLength(1);
});

test("native module contracts permit serialized types without constructing editor nodes", () => {
  const check = (source: string) =>
    boundaryIssues(
      new Map([
        ["src/forms/native.ts", source],
        ["src/forms/schema/types.ts", ""],
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
    "src/forms/content.ts",
    "src/forms/features/short-answer/definition.ts",
  ]) {
    const source = file.includes("features/")
      ? 'import type { Rule } from "../../adapters/ssb/rules";'
      : 'import type { Rule } from "./adapters/ssb/rules";';

    expect(
      boundaryIssues(
        new Map([
          [file, source],
          ["src/forms/adapters/ssb/rules.ts", ""],
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
        ["src/forms/editor/native-bindings.ts", ""],
        ["src/forms/features/number/presentation.ts", ""],
        ["src/forms/schema/types.ts", ""],
        ["src/forms/adapters/ssb/schema.ts", ""],
      ]),
    );

  for (const file of [
    "src/converters/formSchemaToLexical/index.ts",
    "src/converters/lexicalToFormSchema/index.ts",
  ]) {
    expect(
      check(
        file,
        'import { nativeBridge } from "../../forms/editor/native-bindings"; import type { FormDefinitionV2 } from "../../forms/schema/types";',
      ),
    ).toEqual([]);
    expect(
      check(file, 'import { NumberInput } from "../../forms/features/number/presentation";'),
    ).toHaveLength(1);
    expect(
      check(file, 'import type { LegacySsbFormSchema } from "../../forms/adapters/ssb/schema";'),
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
        ["src/forms/adapters/ssb/example.ts", source],
        ["src/forms/features/checkbox-accordion/groups.ts", ""],
      ]),
    );

  expect(check('import type { EditorState } from "lexical";')).toHaveLength(1);
  expect(check('import { $getRoot } from "lexical";')).toHaveLength(1);
  expect(
    check('import type { FormGroup } from "../../features/checkbox-accordion/groups";'),
  ).toHaveLength(1);
  expect(check("export const body = document.body;")).toHaveLength(1);
});

test("public conversion permits only its declared configured editor bridge", () => {
  const check = (file: string, source: string) =>
    boundaryIssues(
      new Map([
        [file, source],
        ["src/forms/editor/runtime.ts", ""],
        ["src/forms/editor/compile.ts", ""],
        ["src/forms/features/pages/presentation.tsx", ""],
      ]),
    );

  expect(
    check(
      "src/converters/markdownToLexical/index.ts",
      'import { createFormRuntime } from "../../forms/editor/runtime";',
    ),
  ).toEqual([]);
  expect(
    check(
      "src/converters/lexicalToLegacySsb/index.ts",
      'import { compileForm } from "../../forms/editor/compile";',
    ),
  ).toEqual([]);
  expect(
    check(
      "src/converters/lexicalToFormSchema/index.ts",
      'import { compileForm } from "../../forms/editor/compile";',
    ),
  ).toHaveLength(1);
  expect(
    check(
      "src/converters/lexicalToMarkdown/index.ts",
      'import { createFormRuntime } from "../../forms/editor/runtime";',
    ),
  ).toHaveLength(1);
  expect(
    check(
      "src/converters/markdownToLexical/index.ts",
      'import { PageBreak } from "../../forms/features/pages/presentation";',
    ),
  ).toHaveLength(1);
});

test("declarative registry modules cannot construct Lexical nodes or depend on a default preset", () => {
  const files = new Map([
    ["src/forms/source/model.ts", ""],
    ["src/forms/registry/builders.ts", ""],
    ["src/forms/editor/nodes.tsx", ""],
    ["src/presets/form-registry/entries.tsx", ""],
  ]);

  const check = (file: string, source: string) =>
    boundaryIssues(new Map([...files, [file, source]]));

  expect(
    check("src/forms/registry/custom.ts", 'import type { SourceBlock } from "../source/model";'),
  ).toHaveLength(1);
  expect(
    check("src/forms/registry/custom.ts", 'import { $createParagraphNode } from "lexical";'),
  ).toHaveLength(1);
  expect(
    check(
      "src/forms/registry/custom.ts",
      'import { govbbFormRegistry } from "../../presets/form-registry/entries";',
    ),
  ).toHaveLength(1);
  expect(
    check(
      "src/presets/form-registry/custom.ts",
      'import { question } from "../../forms/registry/builders";',
    ),
  ).toEqual([]);
  expect(
    check(
      "src/presets/form-registry/custom.ts",
      'import { $createInputNode } from "../../forms/editor/nodes";',
    ),
  ).toHaveLength(1);
});

test("public composition is supported without upward preset imports or internal barrel cycles", () => {
  const files = new Map([
    ["src/editor/index.ts", ""],
    ["src/forms/index.ts", ""],
    ["src/forms/modules.ts", ""],
    ["src/forms/editor/nodes.tsx", ""],
    ["src/forms/features/short-answer/module.tsx", ""],
    ["src/presets/form-registry/entries.tsx", ""],
    ["src/presets/govbb-form.ts", ""],
  ]);

  const check = (file: string, source: string) =>
    boundaryIssues(new Map([...files, [file, source]]));

  expect(
    check(
      "src/presets/govbb-form.ts",
      'import { defineFormEditor } from "../forms"; import { ShortAnswerModule } from "../forms/modules";',
    ),
  ).toEqual([]);
  expect(
    check(
      "src/presets/govbb-form.ts",
      'import { ShortAnswerModule } from "../forms/features/short-answer/module";',
    ),
  ).toHaveLength(1);
  expect(
    check(
      "src/forms/editor/example.ts",
      'import { govbbFormRegistry } from "../../presets/form-registry/entries";',
    ),
  ).toHaveLength(1);
  expect(
    check("src/forms/features/custom/module.ts", 'import { defineField } from "../..";'),
  ).toHaveLength(1);
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
    ["src/forms/core/dates.ts", ""],
    ["src/presets/govbb-form.ts", ""],
  ]);

  const check = (source: string) =>
    boundaryIssues(new Map([...files, ["src/ui/example.tsx", source]]));

  expect(check('export { parseDay } from "../forms/core/dates";')).toHaveLength(1);
  expect(check('import { govbbFormEditor } from "../presets/govbb-form";')).toHaveLength(1);
  expect(
    check(
      'import { parseISO } from "date-fns"; export const focused = () => document.activeElement;',
    ),
  ).toEqual([]);
});

test("page modules use generic editor contracts without depending on forms, presets or workspace hosts", () => {
  const files = new Map([
    ["src/editor/core/module.ts", ""],
    ["src/editor/modules/formatting/module.tsx", ""],
    ["src/pages/definition.ts", ""],
    ["src/forms/core/settings.ts", ""],
    ["src/forms/editor/nodes.tsx", ""],
    ["src/presets/govbb-page.ts", ""],
    ["src/host/page-editor.tsx", ""],
    ["src/workspace/documents.ts", ""],
  ]);

  const check = (source: string) =>
    boundaryIssues(new Map([...files, ["src/pages/modules/custom.tsx", source]]));

  expect(
    check(
      'import type { EditorModule } from "../../editor/core/module"; import type { PageModule } from "../definition";',
    ),
  ).toEqual([]);
  expect(
    check('import { FormattingModule } from "../../editor/modules/formatting/module";'),
  ).toEqual([]);

  for (const source of [
    'import type { Settings } from "../../forms/core/settings";',
    'import { FormTitleNode } from "../../forms/editor/nodes";',
    'import { govbbPageEditor } from "../../presets/govbb-page";',
    'const load = () => import("../../host/page-editor");',
    'export { openDocument } from "../../workspace/documents";',
  ])
    expect(check(source)).toHaveLength(1);
});

test("public page converters use page conversion contracts without importing form or browser surfaces", () => {
  const files = new Map([
    ["src/pages/converters.ts", ""],
    ["src/pages/definition.ts", ""],
    ["src/pages/editor.tsx", ""],
    ["src/forms/editor/native-bindings.ts", ""],
    ["src/presets/govbb-page.ts", ""],
  ]);

  for (const file of [
    "src/converters/pageMarkdownToLexical/index.ts",
    "src/converters/lexicalToPageMarkdown/index.ts",
  ]) {
    const check = (source: string) => boundaryIssues(new Map([...files, [file, source]]));
    expect(
      check(
        'export { pageMarkdownToLexical } from "../../pages/converters"; import type { PageEditorDefinition } from "../../pages/definition";',
      ),
    ).toEqual([]);
    expect(check('export { PageEditor } from "../../pages/editor";')).toHaveLength(1);
    expect(
      check('import { serializedToNativeForm } from "../../forms/editor/native-bindings";'),
    ).toHaveLength(1);
    expect(check('import { govbbPageEditor } from "../../presets/govbb-page";')).toHaveLength(1);
    expect(check('export const saved = localStorage.getItem("page");')).toHaveLength(1);
  }
});

test("workspace composition may assemble both document domains while reusable layers cannot reach upward", () => {
  const files = new Map([
    ["src/pages/converters.ts", ""],
    ["src/forms/editor/native-bindings.ts", ""],
    ["src/host/page-editor.tsx", ""],
    ["src/presets/govbb-page.ts", ""],
    ["src/persistence/draft-store.ts", ""],
    ["src/workspace/documents.ts", ""],
  ]);

  expect(
    boundaryIssues(
      new Map([
        ...files,
        [
          "src/workspace/composition.ts",
          'import { PageDraftEditor } from "../host/page-editor"; import { govbbPageEditor } from "../presets/govbb-page"; import { DraftStore } from "../persistence/draft-store"; import { serializedToNativeForm } from "../forms/editor/native-bindings";',
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
            `import { openDocument } from "${file.startsWith("src/editor/") ? "../../" : "../"}workspace/documents";`,
          ],
        ]),
      ),
    ).toHaveLength(1);
});

test("pure page conversion and workspace models reject browser globals while browser modules allow them", () => {
  for (const file of [
    "src/pages/markdown.ts",
    "src/pages/converters.ts",
    "src/pages/definition.ts",
    "src/workspace/model.ts",
    "src/workspace/validation.ts",
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

  for (const file of ["src/workspace/workspace.tsx", "src/workspace/api-page.tsx"])
    expect(boundaryIssues(new Map([[file, source]]))).toEqual([]);

  for (const file of [
    "src/workspace/model.ts",
    "src/workspace/api-pages.ts",
    "src/pages/editor.tsx",
    "src/host/page-editor.tsx",
  ])
    expect(boundaryIssues(new Map([[file, source]]))).toHaveLength(1);
});
