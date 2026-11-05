import { glob, readFile } from "node:fs/promises";
import { dirname, posix, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

type ImportEdge = { specifier: string; typeOnly: boolean; line: number };

export type BoundaryIssue = { file: string; line: number; message: string };

// No migration exceptions remain.
export const temporaryLegacyEdges: readonly {
  from: string;
  to: string;
  typeOnly: boolean;
  reason: string;
}[] = [];

const pureFeatureFiles = new Set([
  "src/forms/fields/grouped-checkboxes-groups.ts",
  "src/forms/fields/opening-hours-defaults.ts",
]);

const within = (file: string, directory: string) => file.startsWith(`${directory}/`);

/** The editor's public entry points: @/editor (headless), @/editor/react and @/editor/modules. */
const editorEntries = new Set([
  "src/editor/index.ts",
  "src/editor/react/index.ts",
  "src/editor/modules/index.ts",
]);

const genericBrowserLayer = (file: string) =>
  within(file, "src/editor/react") || within(file, "src/editor/modules");

const formBrowserLayer = (file: string) =>
  within(file, "src/forms/canvas") ||
  (within(file, "src/forms/formats/native") && !within(file, "src/forms/formats/native/schema")) ||
  (within(file, "src/forms/formats/legacy-ssb") &&
    !within(file, "src/forms/formats/legacy-ssb/projection")) ||
  (within(file, "src/forms/content") && file !== "src/forms/content/define-content.ts") ||
  within(file, "src/forms/fields") ||
  (within(file, "src/forms/settings") && file !== "src/forms/settings/define-setting.ts") ||
  within(file, "src/forms/form-pages") ||
  within(file, "src/forms/conditional-logic") ||
  within(file, "src/forms/calculated-fields") ||
  within(file, "src/forms/repetition") ||
  within(file, "src/forms/mentions");

const formPublicLayer = (file: string) =>
  ["src/forms/index.ts", "src/forms/modules.ts", "src/forms/legacy.ts"].includes(file);

const sharedUiLayer = (file: string) => within(file, "src/ui");

const hostLayer = (file: string) => within(file, "src/host");

const pageBrowserLayer = (file: string) =>
  within(file, "src/pages") &&
  (file.endsWith(".tsx") ||
    [
      "src/pages/nodes.ts",
      "src/pages/blocks/node.ts",
      "src/pages/metadata.ts",
      "src/pages/index.ts",
    ].includes(file));

const checked = (file: string) =>
  !/\.test\.tsx?$/.test(file) &&
  (sharedUiLayer(file) ||
    within(file, "src/pages") ||
    within(file, "src/workspace") ||
    within(file, "src/persistence") ||
    within(file, "src/editor/core") ||
    file === "src/editor/index.ts" ||
    within(file, "src/forms/model") ||
    within(file, "src/forms/formats/native/schema") ||
    within(file, "src/forms/form-registry") ||
    within(file, "src/forms/formats/markdown") ||
    file === "src/forms/native.ts" ||
    within(file, "src/forms/formats/legacy-ssb/projection") ||
    within(file, "src/presets") ||
    hostLayer(file) ||
    within(file, "src/templates") ||
    formPublicLayer(file) ||
    genericBrowserLayer(file) ||
    formBrowserLayer(file) ||
    pureFeatureFiles.has(file) ||
    within(file, "src/converters") ||
    [
      "src/forms/field.ts",
      "src/forms/definition.ts",
      "src/forms/content/define-content.ts",
      "src/forms/settings/define-setting.ts",
    ].includes(file));

const browserGlobals = new Set([
  "window",
  "document",
  "navigator",
  "localStorage",
  "sessionStorage",
]);

function edgesAndGlobals(file: string, source: string) {
  const filename = resolve(file);

  const tree = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  // Bind this file without loading dependencies or DOM declarations. Symbol lookup then
  // distinguishes a local document parameter from browser document in another scope.
  const options: ts.CompilerOptions = { noLib: true, noResolve: true, types: [] };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = (requested) => (requested === filename ? tree : undefined);
  const checker = ts.createProgram([filename], options, host).getTypeChecker();

  const local = (node: ts.Identifier) =>
    checker
      .getSymbolAtLocation(node)
      ?.declarations?.some((declaration) => declaration.getSourceFile() === tree) ?? false;

  const edges: ImportEdge[] = [];
  const globals: { name: string; line: number }[] = [];
  const line = (node: ts.Node) => tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;

  const edge = (specifier: ts.Expression | undefined, typeOnly: boolean, node: ts.Node) => {
    edges.push({
      specifier:
        specifier && ts.isStringLiteralLike(specifier) ? specifier.text : "<non-literal import>",
      typeOnly,
      line: line(node),
    });
  };

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const named = clause?.namedBindings;

      const onlyTypes =
        !!clause?.isTypeOnly ||
        (!clause?.name &&
          !!named &&
          ts.isNamedImports(named) &&
          named.elements.length > 0 &&
          named.elements.every((part) => part.isTypeOnly));

      edge(node.moduleSpecifier, onlyTypes, node);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      const clause = node.exportClause;
      edge(
        node.moduleSpecifier,
        node.isTypeOnly ||
          (!!clause &&
            ts.isNamedExports(clause) &&
            clause.elements.length > 0 &&
            clause.elements.every((part) => part.isTypeOnly)),
        node,
      );
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      edge(
        ts.isStringLiteral(node.argument.literal) ? node.argument.literal : undefined,
        true,
        node,
      );
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      edge(node.arguments[0], false, node);
    }

    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "globalThis" &&
      !local(node.expression) &&
      browserGlobals.has(node.name.text)
    ) {
      globals.push({ name: `globalThis.${node.name.text}`, line: line(node) });
    } else if (
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "globalThis" &&
      !local(node.expression) &&
      ts.isStringLiteralLike(node.argumentExpression) &&
      browserGlobals.has(node.argumentExpression.text)
    ) {
      globals.push({
        name: `globalThis[${JSON.stringify(node.argumentExpression.text)}]`,
        line: line(node),
      });
    } else if (ts.isIdentifier(node) && browserGlobals.has(node.text) && !local(node)) {
      const parent = node.parent;

      const propertyName =
        (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        ((ts.isPropertyAssignment(parent) ||
          ts.isPropertyDeclaration(parent) ||
          ts.isPropertySignature(parent) ||
          ts.isMethodDeclaration(parent)) &&
          parent.name === node);

      if (!propertyName) globals.push({ name: node.text, line: line(node) });
    }

    ts.forEachChild(node, visit);
  };

  visit(tree);

  return { edges, globals };
}

function permitted(from: string, to: string, typeOnly: boolean) {
  // Each entry re-exports its own layer: the headless one only core, so converters can use it without React
  if (from === "src/editor/index.ts") return within(to, "src/editor/core");

  if (from === "src/editor/react/index.ts") return within(to, "src/editor/react");

  if (from === "src/editor/modules/index.ts") return within(to, "src/editor/modules");

  if (within(from, "src/pages"))
    return (
      within(to, "src/pages") ||
      within(to, "src/editor") ||
      within(to, "src/ui") ||
      [
        "src/cn.ts",
        "src/persistence/types.ts",
        "lexical",
        "react",
        "react-dom",
        "@phosphor-icons/react",
        "@govtech-bb/govbbmarkd",
        "@govtech-bb/govbbmarkd/content-url",
        "@govtech-bb/govbbmarkd/legacy",
        "@govtech-bb/govbbmarkd/react",
        "@govtech-bb/react",
        "yaml",
        "@govtech-bb/block-kit/contact",
      ].includes(to) ||
      to.startsWith("@lexical/") ||
      to.startsWith("@base-ui/") ||
      (from === "src/pages/preview.tsx" && to === "@govtech-bb/frontend/css?inline") ||
      (typeOnly && ["mdast", "mdast-util-directive", "unist"].includes(to))
    );

  if (from === "src/presets/govbb-page.ts")
    return within(to, "src/pages") || within(to, "src/editor") || to === "lexical";

  if (
    [
      "src/converters/page-markdown-to-lexical.ts",
      "src/converters/lexical-to-page-markdown.ts",
    ].includes(from)
  )
    return within(to, "src/pages") && !to.endsWith(".tsx");

  if (within(from, "src/workspace"))
    return (
      within(to, "src/workspace") ||
      within(to, "src/host") ||
      within(to, "src/persistence") ||
      within(to, "src/presets") ||
      within(to, "src/editor") ||
      within(to, "src/forms") ||
      within(to, "src/pages") ||
      within(to, "src/ui") ||
      within(to, "src/api") ||
      [
        "src/cn.ts",
        "lexical",
        "react",
        "@phosphor-icons/react",
        "@tanstack/react-query",
        "@govtech-bb/frontend/assets/images/govbb-logo.svg?raw",
      ].includes(to) ||
      to.startsWith("@base-ui/") ||
      (from.endsWith(".tsx") && to === "@tanstack/react-router")
    );

  if (within(from, "src/forms/formats/native/schema"))
    return within(to, "src/forms/formats/native/schema");

  if (from === "src/forms/native.ts")
    return (
      within(to, "src/forms/formats/native/schema") ||
      (typeOnly && ["lexical", "src/forms/definition.ts"].includes(to))
    );

  // A field declares the native contract, never the legacy SSB one
  if (within(from, "src/forms/fields") && within(to, "src/forms/formats/legacy-ssb/projection"))
    return false;

  if (sharedUiLayer(from))
    return (
      sharedUiLayer(to) ||
      to === "src/cn.ts" ||
      [
        "react",
        "react-dom",
        "date-fns",
        "react-day-picker",
        "@phosphor-icons/react",
        "@tanstack/react-table",
      ].includes(to) ||
      to.startsWith("@base-ui/") ||
      to.startsWith("date-fns/")
    );

  if (within(from, "src/forms") && !formPublicLayer(from) && formPublicLayer(to)) return false;

  if (formPublicLayer(from)) return within(to, "src/forms") || within(to, "src/converters");

  if (within(from, "src/templates"))
    return (
      within(to, "src/templates") ||
      [
        "react",
        "date-fns",
        "@govtech-bb/react",
        "@govtech-bb/govbbmarkd",
        "@govtech-bb/govbbmarkd/form-links",
        "@govtech-bb/govbbmarkd/react",
      ].includes(to) ||
      to.startsWith("@govtech-bb/frontend/")
    );

  if (hostLayer(from))
    return (
      within(to, "src/templates") ||
      (from === "src/host/site-preview-renderer.ts" && to === "yaml") ||
      within(to, "src/host") ||
      within(to, "src/persistence") ||
      within(to, "src/editor") ||
      within(to, "src/forms") ||
      within(to, "src/pages") ||
      within(to, "src/presets") ||
      within(to, "src/ui") ||
      [
        "src/cn.ts",
        "src/converters/form-schema-to-lexical.ts",
        "src/converters/lexical-to-form-schema.ts",
        "lexical",
        "react",
        "react-dom",
        "@phosphor-icons/react",
      ].includes(to) ||
      to.startsWith("@lexical/") ||
      to.startsWith("@base-ui/")
    );

  if (["src/presets/content.ts", "src/presets/govbb-form.ts"].includes(from))
    return (
      [
        "src/editor/index.ts",
        "src/editor/modules/index.ts",
        "src/forms/index.ts",
        "src/forms/modules.ts",
        "react",
      ].includes(to) || within(to, "src/presets")
    );

  if (from === "src/presets/demo.ts")
    return [
      "src/forms/formats/native/native-bindings.ts",
      "src/editor/index.ts",
      "src/forms/definition.ts",
      "src/presets/form-registry/demo.ts",
      "lexical",
    ].includes(to);

  if (
    temporaryLegacyEdges.some(
      (edge) => edge.from === from && edge.to === to && edge.typeOnly === typeOnly,
    )
  )
    return true;

  if (within(from, "src/forms/form-registry"))
    return (
      within(to, "src/forms/form-registry") ||
      within(to, "src/forms/formats/native/schema") ||
      to === "src/editor/index.ts" ||
      (typeOnly && (to === "react" || to === "src/forms/definition.ts"))
    );

  if (within(from, "src/persistence"))
    return within(to, "src/persistence") || (typeOnly && to === "lexical");

  if (within(from, "src/editor/core"))
    return within(to, "src/editor/core") || to === "lexical" || (typeOnly && to === "react");

  if (genericBrowserLayer(from))
    return (
      within(to, "src/editor") ||
      within(to, "src/ui") ||
      to === "src/cn.ts" ||
      ["lexical", "react", "react-dom", "@phosphor-icons/react"].includes(to) ||
      to.startsWith("@lexical/") ||
      to.startsWith("@base-ui/") ||
      to.startsWith("react-dom/")
    );

  // Public converters orchestrate only these configured headless/read bridges.
  if (
    from === "src/converters/form-markdown-to-lexical.ts" &&
    ["src/forms/canvas/form-runtime.ts", "src/forms/formats/native/native-source.ts"].includes(to)
  )
    return true;

  if (
    [
      "src/converters/lexical-to-form-schema.ts",
      "src/converters/form-schema-to-lexical.ts",
    ].includes(from)
  )
    return (
      [
        "src/forms/formats/native/native-bindings.ts",
        "src/forms/canvas/form-context.ts",
        "src/forms/definition.ts",
      ].includes(to) ||
      (from === "src/converters/form-schema-to-lexical.ts" &&
        ["src/editor/index.ts", "src/converters/lexical-to-form-schema.ts"].includes(to)) ||
      within(to, "src/forms/formats/native/schema") ||
      (typeOnly && to === "lexical")
    );

  if (
    from === "src/converters/lexical-to-legacy-ssb.ts" &&
    [
      "src/forms/canvas/form-compile.ts",
      "src/forms/formats/legacy-ssb/legacy-mappings.ts",
    ].includes(to)
  )
    return true;

  if (within(from, "src/converters"))
    return (
      within(to, "src/forms/model") ||
      within(to, "src/forms/formats/native/schema") ||
      within(to, "src/forms/formats/markdown") ||
      within(to, "src/forms/formats/legacy-ssb/projection") ||
      (typeOnly && (to === "lexical" || to === "src/forms/definition.ts"))
    );

  if (
    [
      "src/forms/field.ts",
      "src/forms/definition.ts",
      "src/forms/content/define-content.ts",
      "src/forms/settings/define-setting.ts",
    ].includes(from)
  )
    return (
      within(to, "src/forms/model") ||
      within(to, "src/forms/formats/native/schema") ||
      to === "src/forms/native.ts" ||
      to === "src/editor/index.ts" ||
      [
        "src/forms/field.ts",
        "src/forms/definition.ts",
        "src/forms/content/define-content.ts",
        "src/forms/settings/define-setting.ts",
      ].includes(to) ||
      within(to, "src/forms/formats/markdown") ||
      within(to, "src/forms/form-registry") ||
      (typeOnly && (to === "react" || to === "lexical"))
    );

  if (pureFeatureFiles.has(from)) return within(to, "src/forms/model") || pureFeatureFiles.has(to);

  if (
    from === "src/forms/canvas/form-codec.ts" &&
    [
      "src/persistence/types.ts",
      "src/converters/lexical-to-form-markdown.ts",
      "src/converters/form-markdown-to-lexical.ts",
    ].includes(to)
  )
    return true;

  if (formBrowserLayer(from))
    return (
      within(to, "src/forms/form-registry") ||
      within(to, "src/forms/model") ||
      within(to, "src/forms/formats/native/schema") ||
      formBrowserLayer(to) ||
      pureFeatureFiles.has(to) ||
      within(to, "src/forms/formats/legacy-ssb/projection") ||
      within(to, "src/editor") ||
      within(to, "src/ui") ||
      [
        "src/forms/field.ts",
        "src/forms/definition.ts",
        "src/forms/content/define-content.ts",
        "src/forms/settings/define-setting.ts",
        "src/forms/native.ts",
        "src/cn.ts",
        "src/converters/lexical-to-form-schema.ts",
        "src/converters/lexical-to-legacy-ssb.ts",
      ].includes(to) ||
      within(to, "src/forms/formats/markdown") ||
      [
        "lexical",
        "react",
        "react-dom",
        "react-day-picker",
        "date-fns",
        "selecto",
        "@phosphor-icons/react",
      ].includes(to) ||
      to.startsWith("@lexical/") ||
      to.startsWith("@base-ui/") ||
      to.startsWith("@phosphor-icons/core/")
    );

  if (within(from, "src/forms/model"))
    return within(to, "src/forms/model") || to === "src/editor/index.ts" || to === "date-fns";

  if (within(from, "src/forms/formats/markdown"))
    return (
      within(to, "src/forms/formats/markdown") ||
      within(to, "src/forms/model") ||
      (typeOnly && to === "lexical")
    );

  if (within(from, "src/forms/formats/legacy-ssb/projection"))
    return within(to, "src/forms/formats/legacy-ssb/projection") || within(to, "src/forms/model");

  if (within(from, "src/presets/form-registry"))
    return (
      within(to, "src/presets/form-registry") ||
      within(to, "src/forms/model") ||
      within(to, "src/forms/formats/native/schema") ||
      within(to, "src/forms/form-registry") ||
      pureFeatureFiles.has(to) ||
      to === "@phosphor-icons/react" ||
      (from === "src/presets/form-registry/preview.tsx" &&
        [
          "src/forms/definition.ts",
          "src/forms/native.ts",
          "src/cn.ts",
          "src/editor/react/index.ts",
          "src/ui/preview-sheet.tsx",
        ].includes(to))
    );

  return within(to, "src/forms/model") || pureFeatureFiles.has(to);
}

/** Enforces package ownership, including public composition and pure conversion layers. */
export function boundaryIssues(sources: ReadonlyMap<string, string>): BoundaryIssue[] {
  const issues: BoundaryIssue[] = [];

  for (const [file, source] of sources) {
    // Every src module outside the editor reaches it only through its entry points, and the editor's own modules,
    // entry points included, never import one. Tests may reach inside.
    const test = /\.test\.tsx?$/.test(file);
    const editorModule = within(file, "src/editor") && !test;
    const editorConsumer = !within(file, "src/editor") && !test;

    if (!checked(file) && !editorModule && !editorConsumer) continue;
    const { edges, globals } = edgesAndGlobals(file, source);

    for (const edge of edges) {
      const base = edge.specifier.startsWith(".")
        ? posix.normalize(posix.join(posix.dirname(file), edge.specifier))
        : edge.specifier.startsWith("@/")
          ? posix.normalize(`src/${edge.specifier.slice(2)}`)
          : edge.specifier;

      const to =
        [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find(
          (candidate) => sources.has(candidate),
        ) ?? base;

      if (editorConsumer && within(to, "src/editor") && !editorEntries.has(to))
        issues.push({
          file,
          line: edge.line,
          message: `Editor import bypasses its entry points: ${edge.specifier}. Import @/editor, @/editor/react or @/editor/modules instead`,
        });
      else if (editorModule && editorEntries.has(to))
        issues.push({
          file,
          line: edge.line,
          message: `Editor module imports an editor entry point: ${edge.specifier}. Import the module that owns it instead`,
        });
      else if (checked(file) && !permitted(file, to, edge.typeOnly))
        issues.push({
          file,
          line: edge.line,
          message: `${edge.typeOnly ? "Type" : "Runtime"} import crosses a completed boundary: ${edge.specifier}`,
        });
    }

    if (!checked(file)) continue;

    if (
      !sharedUiLayer(file) &&
      !genericBrowserLayer(file) &&
      !formBrowserLayer(file) &&
      !pageBrowserLayer(file) &&
      !(within(file, "src/workspace") && file.endsWith(".tsx")) &&
      !hostLayer(file) &&
      !(within(file, "src/templates") && file.endsWith(".tsx")) &&
      !formPublicLayer(file)
    )
      for (const global of globals)
        issues.push({
          file,
          line: global.line,
          message: `Browser global in a pure module: ${global.name}`,
        });
  }

  return issues;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const sources = new Map<string, string>();

  for await (const file of glob("src/**/*.{ts,tsx,json}", { cwd: root })) {
    sources.set(file, file.endsWith(".json") ? "" : await readFile(resolve(root, file), "utf8"));
  }

  const issues = boundaryIssues(sources);

  if (issues.length) {
    for (const issue of issues) console.error(`${issue.file}:${issue.line} ${issue.message}`);
    process.exitCode = 1;
  } else {
    const count = [...sources.keys()].filter(checked).length;
    console.log(
      `PASS ${count} completed boundaries; ${temporaryLegacyEdges.length} explicit temporary legacy edges`,
    );
  }
}
