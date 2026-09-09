import { z } from "zod";

export type ContentObject = Record<string, unknown>;

export interface ContentField {
  label: string;
  type: "text" | "number" | "boolean" | "select" | "object" | "array" | "hours";
  hint?: string;
  optional?: boolean;
  readonly?: boolean;
  multiline?: boolean;
  format?: "date" | "url" | "email" | "percentage" | "slug";
  min?: number;
  max?: number;
  integer?: boolean;
  options?: readonly (string | number)[];
  fields?: Record<string, ContentField>;
  item?: ContentField;
  identity?: string;
  fixed?: boolean;
  default?: unknown;
  tokens?: readonly string[];
}

export interface ContentIssue {
  path: (string | number)[];
  message: string;
}

export interface SmartToolDefinition {
  validate?: (content: ContentObject, base?: ContentObject) => ContentIssue[];
  id: string;
  kind:
    | "locator"
    | "checklist"
    | "decision-guide"
    | "calculator"
    | "calendar"
    | "live-feed";
  title: string;
  url: string;
  category: string;
  introduction?: string;
  fields: Record<string, ContentField>;
  views: readonly { id: string; label: string }[];
}

export const textField = (
  label: string,
  extra: Partial<ContentField> = {},
): ContentField => ({ type: "text", label, ...extra });
export const numberField = (
  label: string,
  extra: Partial<ContentField> = {},
): ContentField => ({ type: "number", label, min: 0, ...extra });
export const objectField = (
  label: string,
  fields: Record<string, ContentField>,
  extra: Partial<ContentField> = {},
): ContentField => ({ type: "object", label, fields, ...extra });
export const arrayField = (
  label: string,
  item: ContentField,
  extra: Partial<ContentField> = {},
): ContentField => ({ type: "array", label, item, ...extra });

const dateSchema = z.iso.date();
const timeRangeSchema = z
  .looseObject({
    opens: z
      .string()
      .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Enter an opening time."),
    closes: z
      .string()
      .regex(/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/, "Enter a closing time."),
  })
  .refine(
    (range) => range.closes > range.opens,
    "Closing must be later than opening.",
  );

export const hoursSchema = z
  .array(timeRangeSchema)
  .superRefine((ranges, ctx) => {
    for (let i = 1; i < ranges.length; i++) {
      if (ranges[i].opens < ranges[i - 1].closes)
        ctx.addIssue({
          code: "custom",
          path: [i],
          message: "Opening periods must be in order and must not overlap.",
        });
    }
  });

export function schemaForField(field: ContentField): z.ZodType {
  let schema: z.ZodType;
  switch (field.type) {
    case "text": {
      let value = z.string();
      if (!field.optional) value = value.min(1, "Enter a value.");
      schema = value;
      if (field.format === "slug")
        schema = z
          .string()
          .regex(
            /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
            "Use lowercase letters and numbers separated by hyphens.",
          );
      if (field.format === "date") schema = dateSchema;
      if (field.format === "email") schema = z.email();
      if (field.format === "url")
        schema = z
          .string()
          .refine(
            (v) => /^(https?:\/\/|mailto:|tel:|\/(?!\/))\S+$/i.test(v),
            "Enter a web address, email link, phone link or site path.",
          );
      if (field.optional && field.format)
        schema = z.union([schema, z.literal("")]);
      if (field.tokens?.length)
        schema = schema.refine(
          (v) =>
            typeof v === "string" &&
            field.tokens!.every((token) => v.includes(token)),
          `Keep ${field.tokens.join(", ")} so the current values are included.`,
        );
      break;
    }
    case "number": {
      let value = z.number();
      if (field.integer) value = value.int();
      if (field.min !== undefined) value = value.min(field.min);
      if (field.max !== undefined) value = value.max(field.max);
      schema = value;
      break;
    }
    case "boolean":
      schema = z.boolean();
      break;
    case "select":
      schema = z
        .union([z.string(), z.number()])
        .refine(
          (v) => field.options?.includes(v),
          "Choose one of the listed options.",
        );
      break;
    case "hours":
      schema = hoursSchema;
      break;
    case "object":
      schema = z.looseObject(
        Object.fromEntries(
          Object.entries(field.fields ?? {}).map(([key, value]) => [
            key,
            schemaForField(value),
          ]),
        ),
      );
      break;
    case "array": {
      schema = z
        .array(schemaForField(field.item!))
        .min(field.min ?? 0)
        .superRefine((values, ctx) => {
          if (!field.identity) return;
          const seen = new Set<unknown>();
          values.forEach((value, i) => {
            const id = (value as ContentObject)[field.identity!];
            if (id === undefined || id === "" || seen.has(id))
              ctx.addIssue({
                code: "custom",
                path: [i, field.identity!],
                message: "Each record needs a unique identifier.",
              });
            seen.add(id);
          });
        });
      break;
    }
  }
  return field.optional ? schema.optional() : schema;
}

export function contentSchema(definition: SmartToolDefinition) {
  return z
    .looseObject({
      schemaVersion: z.literal(1),
      ...Object.fromEntries(
        Object.entries(definition.fields).map(([key, field]) => [
          key,
          schemaForField(field),
        ]),
      ),
    })
    .superRefine((content, ctx) => {
      for (const issue of definition.validate?.(content) ?? [])
        ctx.addIssue({ code: "custom", ...issue });
    });
}

export function fieldDefault(field: ContentField): unknown {
  if (field.default !== undefined) return structuredClone(field.default);
  if (field.optional) return undefined;
  switch (field.type) {
    case "object":
      return Object.fromEntries(
        Object.entries(field.fields ?? {}).map(([key, value]) => [
          key,
          fieldDefault(value),
        ]),
      );
    case "array":
    case "hours":
      return [];
    case "number":
      return null;
    case "boolean":
      return false;
    case "select":
      return "";
    default:
      return "";
  }
}

export const contentPath = (parent: string, key: string | number) =>
  `${parent}/${String(key).replaceAll("~", "~0").replaceAll("/", "~1")}`;
export const sameContent = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

export function withContentFields(
  definition: SmartToolDefinition,
  content: ContentObject,
): SmartToolDefinition {
  const labelFor = (key: string) =>
    key
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replaceAll("_", " ")
      .replace(/^./, (letter) => letter.toUpperCase());
  function wording(label: string, value: unknown): ContentField {
    if (Array.isArray(value))
      return arrayField(label, textField("Text", { multiline: true }));
    if (value && typeof value === "object")
      return objectField(
        label,
        Object.fromEntries(
          Object.entries(value).map(([key, child]) => [
            key,
            wording(labelFor(key), child),
          ]),
        ),
      );
    const text = String(value ?? "");
    const tokens = text.match(/\{[a-zA-Z][a-zA-Z0-9]*\}/g);
    return textField(label, {
      multiline: text.length > 90 || text.includes("\n"),
      optional: text === "",
      ...(/^(https?:\/\/|mailto:|tel:|\/(?!\s))/.test(text)
        ? { format: "url" as const }
        : {}),
      ...(tokens
        ? {
            tokens: [...new Set(tokens)],
            hint: `Keep ${[...new Set(tokens)].join(", ")} where the service should insert the current value.`,
          }
        : {}),
    });
  }
  return {
    ...definition,
    fields: {
      ...definition.fields,
      ...(content.copy ? { copy: wording("Page wording", content.copy) } : {}),
    },
  };
}

export interface ContentChange {
  format?: ContentField["format"];
  path: string;
  label: string;
  before: unknown;
  after: unknown;
}

export function recordLabel(value: unknown, identity?: string): string {
  if (!value || typeof value !== "object") return String(value ?? "Not set");
  const record = value as ContentObject;
  return String(
    record.name ||
      record.title ||
      record.label ||
      record.heading ||
      record.district ||
      record.term ||
      record.display ||
      record.source ||
      (identity ? record[identity] : undefined) ||
      "Record",
  );
}

export function displayContent(
  value: unknown,
  format?: ContentField["format"],
): string {
  if (format === "percentage" && typeof value === "number")
    return `${Number((value * 100).toFixed(6))}%`;
  if (value === undefined || value === null || value === "") return "Not set";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value))
    return value.length
      ? value.map((item) => displayContent(item)).join("; ")
      : "None";
  if (typeof value === "object") {
    if ("opens" in value && "closes" in value)
      return `${value.opens}–${value.closes}`;
    return recordLabel(value);
  }
  return String(value);
}

/** Only declared fields are writable. Omission never removes a record. */
export function prepareContentChange(
  definition: SmartToolDefinition,
  base: ContentObject,
  draft: ContentObject,
  removals: readonly string[] = [],
) {
  if (base.schemaVersion !== 1 || draft.schemaVersion !== 1)
    throw new Error(
      "This content version is not supported. Reload the editor.",
    );
  const removed = new Set(removals);
  const usedRemovals = new Set<string>();
  const changes: ContentChange[] = [];
  function merge(
    field: ContentField,
    before: unknown,
    after: unknown,
    path: string,
    label = field.label,
  ): unknown {
    if (after === undefined) return before;
    if (field.readonly && !sameContent(before, after))
      throw new Error(`${field.label} cannot be changed here.`);
    if (after === null && field.optional) {
      if (before !== undefined)
        changes.push({ path, label, before, after: undefined });
      return undefined;
    }
    if (
      field.type === "object" &&
      after &&
      typeof after === "object" &&
      !Array.isArray(after)
    ) {
      const original = (before ?? {}) as ContentObject;
      const result = { ...original };
      for (const [key, child] of Object.entries(field.fields ?? {})) {
        const next = merge(
          child,
          original[key],
          (after as ContentObject)[key],
          contentPath(path, key),
          path ? `${label} › ${child.label}` : child.label,
        );
        if (next === undefined) delete result[key];
        else result[key] = next;
      }
      return result;
    }
    if (field.type === "array" && field.identity && Array.isArray(after)) {
      const original = Array.isArray(before) ? before : [];
      const key = field.identity;
      const incoming = new Set(after.map((record) => record?.[key]));
      const omitted = original.filter(
        (record) =>
          !incoming.has(record[key]) &&
          !removed.has(contentPath(path, record[key])),
      );
      for (const record of original) {
        if (incoming.has(record[key])) continue;
        const recordPath = contentPath(path, record[key]);
        if (!removed.has(recordPath)) continue;
        if (field.fixed)
          throw new Error(`${field.label}: records cannot be removed here.`);
        usedRemovals.add(recordPath);
        changes.push({
          path: recordPath,
          label: `${label}: removed ${recordLabel(record, key)}`,
          before: record,
          after: undefined,
        });
      }
      const result = after.map((record) => {
        const existing = original.find((item) => item[key] === record?.[key]);
        if (field.fixed && !existing)
          throw new Error(`${field.label}: new records cannot be added here.`);
        const start = changes.length;
        const next = merge(
          field.item!,
          existing,
          record,
          contentPath(path, record?.[key] ?? "new"),
          `${label} › ${recordLabel(existing ?? record, key)}`,
        );
        if (!existing)
          changes.splice(start, changes.length - start, {
            path: contentPath(path, record?.[key] ?? "new"),
            label: `${label}: added ${recordLabel(record, key)}`,
            before: undefined,
            after: next,
          });
        return next;
      });
      // A partial record submission keeps the original order and every omitted record.
      if (omitted.length) {
        const supplied = new Map(
          result.map((record) => [(record as ContentObject)[key], record]),
        );
        const retained = original
          .filter((record) => !removed.has(contentPath(path, record[key])))
          .map((record) => supplied.get(record[key]) ?? record);
        result.splice(
          0,
          result.length,
          ...retained,
          ...result.filter(
            (record) =>
              !original.some(
                (old) => old[key] === (record as ContentObject)[key],
              ),
          ),
        );
      }
      const oldIds = original.map((item) => item[key]);
      const nextIds = result.map((item) => (item as ContentObject)[key]);
      if (field.fixed && !sameContent(oldIds, nextIds))
        throw new Error(`${field.label}: record order cannot be changed here.`);
      if (
        oldIds.length === nextIds.length &&
        oldIds.every((id) => nextIds.includes(id)) &&
        !sameContent(oldIds, nextIds)
      )
        changes.push({
          path,
          label: `${label}: reordered`,
          before: original.map((record) => recordLabel(record, key)),
          after: result.map((record) => recordLabel(record, key)),
        });
      return result;
    }
    if (!sameContent(before, after))
      changes.push({
        path,
        label,
        before,
        after,
        ...(field.format === "percentage" ? { format: field.format } : {}),
      });
    return after;
  }
  const content = merge(
    objectField(definition.title, definition.fields),
    base,
    draft,
    "",
  ) as ContentObject;
  if (usedRemovals.size !== removed.size)
    throw new Error(
      "A removal no longer matches the source. Reload and review your draft.",
    );
  const validated = contentSchema(definition).parse(content);
  const issues = definition.validate?.(validated, base) ?? [];
  if (issues.length)
    throw new z.ZodError(
      issues.map((issue) => ({ code: "custom" as const, ...issue })),
    );
  return { content: validated as ContentObject, changes };
}
