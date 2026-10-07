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
  "src/forms/features/checkbox-accordion/groups.ts",
  "src/forms/features/opening-hours/defaults.ts",
]);

const within = (file: string, directory: string) => file.startsWith(`${directory}/`);

const genericBrowserLayer = (file: string) =>
  within(file, "src/editor/react") ||
  within(file, "src/editor/modules") ||
  file === "src/editor/index.ts";

const formBrowserLayer = (file: string) =>
  within(file, "src/forms/editor") ||
  within(file, "src/forms/react") ||
  (within(file, "src/forms/features") && !pureFeatureFiles.has(file));

const formPublicLayer = (file: string) =>
  ["src/forms/index.ts", "src/forms/modules.ts", "src/forms/legacy.ts"].includes(file);

const sharedUiLayer = (file: string) => within(file, "src/ui");

const hostLayer = (file: string) => within(file, "src/host");

const pageBrowserLayer = (file: string) =>
  within(file, "src/pages") &&
  (file.endsWith(".tsx") ||
    ["src/pages/nodes.ts", "src/pages/metadata.ts", "src/pages/index.ts"].includes(file));

const checked = (file: string) =>
  !/\.test\.tsx?$/.test(file) &&
  (sharedUiLayer(file) ||
    within(file, "src/pages") ||
    within(file, "src/workspace") ||
    within(file, "src/persistence") ||
    within(file, "src/editor/core") ||
    within(file, "src/forms/core") ||
    within(file, "src/forms/schema") ||
    within(file, "src/forms/registry") ||
    within(file, "src/forms/source") ||
    file === "src/forms/native.ts" ||
    within(file, "src/forms/adapters/ssb") ||
    within(file, "src/presets") ||
    hostLayer(file) ||
    formPublicLayer(file) ||
    genericBrowserLayer(file) ||
    formBrowserLayer(file) ||
    pureFeatureFiles.has(file) ||
    within(file, "src/converters") ||
    ["src/forms/field.ts", "src/forms/definition.ts", "src/forms/content.ts"].includes(file));

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
        "unified",
        "remark-parse",
        "mdast-util-to-markdown",
        "remark-gfm",
        "remark-directive",
        "remark-frontmatter",
        "yaml",
        "entities",
      ].includes(to) ||
      to.startsWith("@lexical/") ||
      to.startsWith("@base-ui/") ||
      (typeOnly && ["mdast", "mdast-util-directive", "unist"].includes(to))
    );

  if (from === "src/presets/govbb-page.ts")
    return within(to, "src/pages") || within(to, "src/editor") || to === "lexical";

  if (
    [
      "src/converters/pageMarkdownToLexical/index.ts",
      "src/converters/lexicalToPageMarkdown/index.ts",
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
      (from === "src/workspace/workspace.tsx" && to === "@tanstack/react-router")
    );

  if (within(from, "src/forms/schema")) return within(to, "src/forms/schema");

  if (from === "src/forms/native.ts")
    return (
      within(to, "src/forms/schema") ||
      (typeOnly && ["lexical", "src/forms/definition.ts"].includes(to))
    );

  if (
    /^src\/forms\/features\/[^/]+\/definition\.tsx?$/.test(from) &&
    within(to, "src/forms/adapters/ssb")
  )
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

  if (
    (within(from, "src/editor") &&
      from !== "src/editor/index.ts" &&
      to === "src/editor/index.ts") ||
    (within(from, "src/forms") && !formPublicLayer(from) && formPublicLayer(to))
  )
    return false;

  if (formPublicLayer(from)) return within(to, "src/forms") || within(to, "src/converters");

  if (hostLayer(from))
    return (
      within(to, "src/host") ||
      within(to, "src/persistence") ||
      within(to, "src/editor") ||
      within(to, "src/forms") ||
      within(to, "src/pages") ||
      within(to, "src/presets") ||
      within(to, "src/ui") ||
      [
        "src/cn.ts",
        "src/converters/formSchemaToLexical/index.ts",
        "src/converters/lexicalToFormSchema/index.ts",
        "lexical",
        "react",
        "@phosphor-icons/react",
      ].includes(to) ||
      to.startsWith("@lexical/") ||
      to.startsWith("@base-ui/")
    );

  if (["src/presets/content.ts", "src/presets/govbb-form.ts"].includes(from))
    return (
      ["src/editor/index.ts", "src/forms/index.ts", "src/forms/modules.ts", "react"].includes(to) ||
      within(to, "src/presets")
    );

  if (from === "src/presets/demo.ts")
    return [
      "src/forms/editor/native-bindings.ts",
      "src/editor/core/context.ts",
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

  if (within(from, "src/forms/registry"))
    return (
      within(to, "src/forms/registry") ||
      within(to, "src/forms/schema") ||
      to === "src/editor/core/immutable.ts" ||
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
    from === "src/converters/markdownToLexical/index.ts" &&
    ["src/forms/editor/runtime.ts", "src/forms/editor/native-source.ts"].includes(to)
  )
    return true;

  if (
    [
      "src/converters/lexicalToFormSchema/index.ts",
      "src/converters/formSchemaToLexical/index.ts",
    ].includes(from)
  )
    return (
      [
        "src/forms/editor/native-bindings.ts",
        "src/forms/editor/context.ts",
        "src/forms/definition.ts",
      ].includes(to) ||
      (from === "src/converters/formSchemaToLexical/index.ts" &&
        [
          "src/editor/core/create-editor.ts",
          "src/converters/lexicalToFormSchema/index.ts",
        ].includes(to)) ||
      within(to, "src/forms/schema") ||
      (typeOnly && to === "lexical")
    );

  if (
    from === "src/converters/lexicalToLegacySsb/index.ts" &&
    ["src/forms/editor/compile.ts", "src/forms/editor/legacy-mappings.ts"].includes(to)
  )
    return true;

  if (within(from, "src/converters"))
    return (
      within(to, "src/forms/core") ||
      within(to, "src/forms/schema") ||
      within(to, "src/forms/source") ||
      within(to, "src/forms/adapters/ssb") ||
      (typeOnly && (to === "lexical" || to === "src/forms/definition.ts"))
    );

  if (["src/forms/field.ts", "src/forms/definition.ts", "src/forms/content.ts"].includes(from))
    return (
      within(to, "src/forms/core") ||
      within(to, "src/forms/schema") ||
      to === "src/forms/native.ts" ||
      within(to, "src/editor/core") ||
      ["src/forms/field.ts", "src/forms/definition.ts", "src/forms/content.ts"].includes(to) ||
      within(to, "src/forms/source") ||
      within(to, "src/forms/registry") ||
      (typeOnly && (to === "react" || to === "lexical"))
    );

  if (pureFeatureFiles.has(from)) return within(to, "src/forms/core") || pureFeatureFiles.has(to);

  if (
    from === "src/forms/editor/codec.ts" &&
    [
      "src/persistence/types.ts",
      "src/converters/lexicalToMarkdown/index.ts",
      "src/converters/markdownToLexical/index.ts",
    ].includes(to)
  )
    return true;

  if (formBrowserLayer(from))
    return (
      within(to, "src/forms/registry") ||
      within(to, "src/forms/core") ||
      within(to, "src/forms/schema") ||
      formBrowserLayer(to) ||
      pureFeatureFiles.has(to) ||
      within(to, "src/forms/adapters/ssb") ||
      within(to, "src/editor") ||
      within(to, "src/ui") ||
      [
        "src/forms/field.ts",
        "src/forms/definition.ts",
        "src/forms/content.ts",
        "src/forms/native.ts",
        "src/cn.ts",
        "src/converters/lexicalToFormSchema/index.ts",
        "src/converters/lexicalToLegacySsb/index.ts",
      ].includes(to) ||
      within(to, "src/forms/source") ||
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

  if (within(from, "src/forms/core"))
    return within(to, "src/forms/core") || within(to, "src/editor/core") || to === "date-fns";

  if (within(from, "src/forms/source"))
    return (
      within(to, "src/forms/source") ||
      within(to, "src/forms/core") ||
      (typeOnly && to === "lexical")
    );

  if (within(from, "src/forms/adapters/ssb"))
    return within(to, "src/forms/adapters/ssb") || within(to, "src/forms/core");

  if (within(from, "src/presets/form-registry"))
    return (
      within(to, "src/presets/form-registry") ||
      within(to, "src/forms/core") ||
      within(to, "src/forms/schema") ||
      within(to, "src/forms/registry") ||
      pureFeatureFiles.has(to) ||
      to === "@phosphor-icons/react" ||
      (from === "src/presets/form-registry/preview.tsx" &&
        [
          "src/forms/definition.ts",
          "src/forms/native.ts",
          "src/cn.ts",
          "src/editor/react/contributions.tsx",
          "src/editor/react/composer.tsx",
        ].includes(to))
    );

  return within(to, "src/forms/core") || pureFeatureFiles.has(to);
}

/** Enforces package ownership, including public composition and pure conversion layers. */
export function boundaryIssues(sources: ReadonlyMap<string, string>): BoundaryIssue[] {
  const issues: BoundaryIssue[] = [];

  for (const [file, source] of sources) {
    if (!checked(file)) continue;
    const { edges, globals } = edgesAndGlobals(file, source);

    for (const edge of edges) {
      const base = edge.specifier.startsWith(".")
        ? posix.normalize(posix.join(posix.dirname(file), edge.specifier))
        : edge.specifier;

      const to =
        [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find(
          (candidate) => sources.has(candidate),
        ) ?? base;

      if (!permitted(file, to, edge.typeOnly))
        issues.push({
          file,
          line: edge.line,
          message: `${edge.typeOnly ? "Type" : "Runtime"} import crosses a completed boundary: ${edge.specifier}`,
        });
    }

    if (
      !sharedUiLayer(file) &&
      !genericBrowserLayer(file) &&
      !formBrowserLayer(file) &&
      !pageBrowserLayer(file) &&
      !(within(file, "src/workspace") && file.endsWith(".tsx")) &&
      !hostLayer(file) &&
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
