import { existsSync, readFileSync } from "node:fs";
import type { FormEditorDefinition } from "../src/forms/definition";
import {
  nativeCapabilityMatches,
  nativeSemanticEqual,
  validateFormDefinition,
  type AnyFormDefinition,
} from "../src/forms/schema";
import { registryDocument } from "../src/forms/registry/validation";
import { formSchemaToLexical } from "../src/converters/formSchemaToLexical";
import { lexicalToFormSchema } from "../src/converters/lexicalToFormSchema";
import { lexicalToMarkdown } from "../src/converters/lexicalToMarkdown";
import { markdownToLexical } from "../src/converters/markdownToLexical";
import { createHeadlessEditor } from "../src/editor/core/create-editor";

export type CapabilityRow = {
  category: "field" | "content" | "page" | "action" | "operator" | "format" | "registry";
  name: string;
  native: {
    kind?: string;
    config?: Readonly<Record<string, string | number | boolean>>;
    valueType?: string;
    blockType?: string;
    scope?: string;
    role?: string;
    type?: string;
    op?: string;
  };
  owner: string;
  status: "pending" | "contract" | "complete";
  tests: readonly string[];
  fixtures: readonly string[];
};

export type NativeCoverageMatrix = { version: number; capabilities: readonly CapabilityRow[] };

const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, child: unknown) =>
    child && typeof child === "object" && !Array.isArray(child)
      ? Object.fromEntries(Object.entries(child).sort(([a], [b]) => a.localeCompare(b)))
      : child,
  );

const claim = (value: {
  kind: string;
  config?: Readonly<Record<string, string | number | boolean>>;
  valueType?: string;
  blockType?: string;
}) => {
  const result: CapabilityRow["native"] = { kind: value.kind };

  if (value.config) result.config = value.config;

  if (value.valueType) result.valueType = value.valueType;

  if (value.blockType) result.blockType = value.blockType;

  return result;
};

type EvidenceValue = null | string | number | boolean | EvidenceValue[] | EvidenceObject;

type EvidenceObject = { [key: string]: EvidenceValue };

function evidence(value: unknown): EvidenceValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;

  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (Array.isArray(value)) return value.map(evidence);

  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, evidence(child)]));
  throw Error("Evidence must be JSON");
}

function record(value: EvidenceValue | undefined): EvidenceObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

export function parseCoverageMatrix(input: unknown): NativeCoverageMatrix {
  const matrix = record(evidence(input));

  if (!matrix || typeof matrix.version !== "number" || !Array.isArray(matrix.capabilities))
    throw Error("Invalid capability matrix");

  const capabilities = matrix.capabilities.map((value): CapabilityRow => {
    const row = record(value);

    if (!row) throw Error("Invalid capability row");
    const { category, status, name, owner, tests, fixtures } = row;

    if (
      category !== "field" &&
      category !== "content" &&
      category !== "page" &&
      category !== "action" &&
      category !== "operator" &&
      category !== "format" &&
      category !== "registry"
    )
      throw Error("Invalid capability category");

    if (status !== "pending" && status !== "contract" && status !== "complete")
      throw Error("Invalid capability status");

    if (
      typeof name !== "string" ||
      typeof owner !== "string" ||
      !Array.isArray(tests) ||
      !tests.every((path): path is string => typeof path === "string") ||
      !Array.isArray(fixtures) ||
      !fixtures.every((path): path is string => typeof path === "string")
    )
      throw Error("Invalid capability proof paths");
    const native = record(row.native);

    if (!native) throw Error("Invalid native capability claim");

    if (
      Object.keys(native).some(
        (key) =>
          !["kind", "config", "valueType", "blockType", "scope", "role", "type", "op"].includes(
            key,
          ),
      )
    )
      throw Error("Unknown native capability property");
    const mapped: CapabilityRow["native"] = {};

    for (const key of ["kind", "valueType", "blockType", "scope", "role", "type", "op"] as const) {
      const value = native[key];

      if (value !== undefined) {
        if (typeof value !== "string") throw Error(`Invalid native capability ${key}`);
        mapped[key] = value;
      }
    }

    if (native.config !== undefined) {
      const config = record(native.config);

      if (!config) throw Error("Invalid native discriminator");
      const parsed: Record<string, string | number | boolean> = {};

      for (const [key, value] of Object.entries(config)) {
        if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean")
          throw Error("Invalid native discriminator value");
        parsed[key] = value;
      }

      mapped.config = parsed;
    }

    return { category, status, name, owner, tests, fixtures, native: mapped };
  });

  return { version: matrix.version, capabilities };
}

/** Contract coverage is useful during migration; only complete rows count as conversion proof. */
export function checkNativeFormCoverage(
  definition: FormEditorDefinition,
  matrix: NativeCoverageMatrix,
  exists: (path: string) => boolean = existsSync,
) {
  const errors: string[] = [],
    pending: string[] = [];

  if (matrix.version !== 1) errors.push(`Unsupported capability matrix version ${matrix.version}`);
  const installed = new Map<string, object | undefined>();

  for (const field of definition.fields)
    installed.set(`field:${field.kind}`, field.native && claim(field.native));

  for (const content of definition.contents)
    installed.set(`content:${content.kind}`, content.native && claim(content.native));

  for (const role of definition.nativeFeatures.pageRoles) installed.set(`page:${role}`, { role });

  for (const type of definition.nativeFeatures.actions) installed.set(`action:${type}`, { type });

  for (const op of definition.nativeFeatures.operators) installed.set(`operator:${op}`, { op });

  for (const type of definition.nativeFeatures.formats) installed.set(`format:${type}`, { type });

  for (const entry of definition.registry)
    installed.set(`registry:${entry.key}`, "scope" in entry ? { scope: entry.scope } : undefined);
  const seen = new Set<string>();

  for (const row of matrix.capabilities) {
    const key = `${row.category}:${row.name}`;

    if (seen.has(key)) errors.push(`Duplicate capability row ${key}`);
    seen.add(key);

    if (!installed.has(key)) errors.push(`Capability row has no installed owner: ${key}`);

    if (!exists(row.owner)) errors.push(`Missing capability owner ${row.owner}`);

    if (!["pending", "contract", "complete"].includes(row.status))
      errors.push(`Invalid coverage status for ${key}`);

    if (row.status !== "pending") {
      const actual = installed.get(key);

      if (!actual) errors.push(`Installed capability has no native mapping: ${key}`);
      else if (canonical(actual) !== canonical(row.native))
        errors.push(`Native discriminator changed without matrix update: ${key}`);

      if (!row.tests.length) errors.push(`No tests recorded for ${key}`);
    }

    for (const file of [...row.tests, ...row.fixtures])
      if (!exists(file)) errors.push(`Missing proof file for ${key}: ${file}`);

    if (row.status === "complete" && !row.fixtures.length)
      errors.push(`No native round-trip fixture recorded for ${key}`);

    if (row.status !== "complete") pending.push(key);
  }

  for (const key of installed.keys())
    if (!seen.has(key)) errors.push(`Installed capability missing from matrix: ${key}`);

  return { errors, pending, count: installed.size };
}

/** Only actual native payload positions establish coverage; an inventory row cannot prove itself. */
export function nativeEvidenceContains(
  row: CapabilityRow,
  fixture: EvidenceValue | undefined,
): boolean {
  const nodes: EvidenceObject[] = [];

  const visit = (value: EvidenceValue | undefined) => {
    if (Array.isArray(value)) value.forEach(visit);
    else {
      const node = record(value);

      if (!node) return;
      nodes.push(node);
      Object.values(node).forEach(visit);
    }
  };

  visit(fixture);
  const claim = row.native;

  return nodes.some((node) => {
    if (row.category === "registry") return node.key === row.name && node.scope === claim.scope;

    if (row.category === "field" || row.category === "content") {
      if (
        row.category === "content" &&
        (claim.blockType === "logic" || claim.blockType === "calculated")
      )
        return node.type === claim.blockType;

      return (
        node.type === (row.category === "field" ? "question" : "content") &&
        typeof claim.kind === "string" &&
        typeof node.kind === "string" &&
        nativeCapabilityMatches(
          { kind: claim.kind, config: claim.config },
          { kind: node.kind, config: node.config },
        )
      );
    }

    if (row.category === "page") return node.type === "page" && node.role === row.name;

    if (row.category === "operator") return node.op === row.name;

    if (row.category === "action") return node.type === row.name;

    return record(node.format)?.type === row.name;
  });
}

export function checkNativeCoverageEvidence(
  definition: FormEditorDefinition,
  matrix: NativeCoverageMatrix,
  read: (path: string) => unknown = (path) => JSON.parse(readFileSync(path, "utf8")),
  roundTrip = true,
): string[] {
  const errors: string[] = [],
    fixtures = new Map<string, EvidenceValue>();

  for (const path of new Set(matrix.capabilities.flatMap((row) => [...row.fixtures]))) {
    let fixture: EvidenceValue;

    try {
      fixture = evidence(read(path));
    } catch (error) {
      errors.push(`Cannot read native evidence ${path}: ${String(error)}`);
      continue;
    }

    const payload = record(fixture);
    const documents: AnyFormDefinition[] = [];

    if (payload?.schemaVersion === 2) {
      const validated = validateFormDefinition(fixture, definition.nativeCapabilities);

      if (validated.status !== "ready") {
        errors.push(`Invalid native evidence ${path}: ${validated.diagnostics[0]?.message}`);
        continue;
      }

      documents.push(validated.schema);
    } else if (payload?.format === "native-registry-fixtures" && Array.isArray(payload.entries)) {
      for (const value of payload.entries) {
        const entry = record(value);
        const current = definition.registry.find((candidate) => candidate.key === entry?.key);

        if (
          !entry ||
          !current ||
          current.scope !== entry.scope ||
          !nativeSemanticEqual(
            current.scope === "form" ? current.form : current.blocks,
            entry.scope === "form" ? entry.form : entry.blocks,
          )
        ) {
          errors.push(`Native registry fixture differs from installed entry: ${entry?.key}`);
          continue;
        }

        documents.push(registryDocument(current));
      }
    } else {
      errors.push(`Evidence must contain native v2 definitions: ${path}`);
      continue;
    }

    fixtures.set(path, fixture);

    for (const document of documents) {
      const result = validateFormDefinition(document, definition.nativeCapabilities);

      if (result.status !== "ready") {
        errors.push(
          `Invalid native evidence ${path} (${document.id}): ${result.diagnostics[0]!.message}`,
        );
        continue;
      }

      if (!roundTrip) continue;
      const imported = formSchemaToLexical(document, definition);

      if (imported.status !== "ready") {
        errors.push(
          `Native import proof failed ${path} (${document.id}): ${imported.diagnostics[0]!.message}`,
        );
        continue;
      }

      const source = lexicalToMarkdown(imported.state, definition),
        parsed = markdownToLexical(source, definition);

      if (!parsed.state) {
        errors.push(`Native Markdown proof failed ${path} (${document.id})`);
        continue;
      }

      const editor = createHeadlessEditor(definition, parsed.state);

      try {
        const exported = lexicalToFormSchema(editor.getEditorState(), definition, editor);

        if (exported.status !== "ready" || !nativeSemanticEqual(document, exported.schema))
          errors.push(`Native round-trip differs ${path} (${document.id})`);
      } finally {
        editor.dispose();
      }
    }
  }

  for (const row of matrix.capabilities)
    if (
      row.status === "complete" &&
      !row.fixtures.some((path) => nativeEvidenceContains(row, fixtures.get(path)))
    )
      errors.push(`Native proof does not exercise ${row.category}:${row.name}`);

  return errors;
}
