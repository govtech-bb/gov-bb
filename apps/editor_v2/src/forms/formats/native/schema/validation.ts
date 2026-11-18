import { nativeDiagnostic, type NativeDiagnostic, type NativePath } from "./diagnostics";
import { isDateOnly, isTimeOnly } from "./semantics";
import { visitNativeReferences, type NativeReference } from "./references";
import type {
  AnyFormBlock,
  AnyFormDefinition,
  ContentBase,
  ContentBlock,
  Expression,
  NativeScalar,
  NativeValueType,
  QuestionBase,
  QuestionBlock,
  Condition,
  LogicAction,
  VisibilityTarget,
} from "./types";

export type NativeFieldCapability = {
  readonly kind: string;
  readonly config?: Readonly<Record<string, NativeScalar>>;
  readonly valueType: NativeValueType;
  readonly validate?: (block: QuestionBase, path: NativePath) => readonly NativeDiagnostic[];
  readonly references?: (
    block: QuestionBase,
    visit: (reference: NativeReference) => string,
  ) => void;
};

export type NativeContentCapability = {
  readonly kind: string;
  readonly config?: Readonly<Record<string, NativeScalar>>;
  readonly validate?: (block: ContentBase, path: NativePath) => readonly NativeDiagnostic[];
  readonly references?: (block: ContentBase, visit: (reference: NativeReference) => string) => void;
};

export type NativeSchemaCapabilities = {
  readonly fields: readonly NativeFieldCapability[];
  readonly contents: readonly NativeContentCapability[];
  readonly structural?: readonly ("logic" | "calculated")[];
  readonly pageRoles?: readonly string[];
  readonly actions?: readonly string[];
  readonly operators?: readonly string[];
  readonly formats?: readonly string[];
};

export type NativeValidationResult =
  | { status: "ready"; schema: AnyFormDefinition; diagnostics: NativeDiagnostic[] }
  | { status: "blocked"; schema: null; diagnostics: NativeDiagnostic[] };

type ObjectValue = Record<string, unknown>;

const own = (value: object, key: string) => Object.hasOwn(value, key);

const object = (value: unknown): value is ObjectValue =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const builtinFields = new Set([
  "text",
  "long-text",
  "number",
  "email",
  "phone",
  "date",
  "time",
  "file",
  "address-lookup",
  "opening-hours",
  "boolean",
  "choice",
]);

const builtinContents = new Set([
  "paragraph",
  "question-label",
  "heading",
  "callout",
  "list",
  "expandable",
]);

const stringFields = new Set(["text", "long-text", "email", "phone", "address-lookup"]);

const scalar = (value: unknown): value is NativeScalar =>
  typeof value === "string" ||
  typeof value === "boolean" ||
  (typeof value === "number" && Number.isFinite(value));

/** Claims may use disjoint literal configurations, but an unconstrained claim overlaps every same-kind claim. */
export function validateNativeCapabilities(
  capabilities: NativeSchemaCapabilities,
): NativeDiagnostic[] {
  const diagnostics: NativeDiagnostic[] = [];

  for (const [category, claims] of [
    ["fields", capabilities.fields],
    ["contents", capabilities.contents],
  ] as const)
    claims.forEach((claim, index) => {
      if (!claim.kind.trim())
        diagnostics.push(
          nativeDiagnostic("capability-kind", "A native module needs a nonempty kind.", [
            category,
            index,
            "kind",
          ]),
        );

      for (let other = 0; other < index; other++) {
        const previous = claims[other]!;

        if (claim.kind !== previous.kind) continue;

        const disjoint = Object.entries(claim.config ?? {}).some(
          ([key, value]) =>
            previous.config && own(previous.config, key) && previous.config[key] !== value,
        );

        if (!disjoint)
          diagnostics.push(
            nativeDiagnostic(
              "capability-overlap",
              `Overlapping native ${category} claims for ${claim.kind}.`,
              [category, index],
            ),
          );
      }
    });

  return diagnostics;
}

function effectiveConfig(kind: string, value: unknown): ObjectValue {
  const config = object(value) ? { ...value } : {};

  if (kind === "choice" && config.presentation === undefined)
    config.presentation = config.selection === "multiple" ? "checkboxes" : "radio";

  if (kind === "callout" && config.tone === undefined) config.tone = "inset";

  if (kind === "list" && config.ordered === undefined) config.ordered = false;

  return config;
}

export function nativeCapabilityMatches(
  claim: { kind: string; config?: Readonly<Record<string, NativeScalar>> },
  block: { kind: string; config?: unknown },
): boolean {
  const config = effectiveConfig(block.kind, block.config);

  return (
    claim.kind === block.kind &&
    Object.entries(claim.config ?? {}).every(([key, value]) => config[key] === value)
  );
}

/** Validate without coercing, stripping properties, changing IDs, or touching the input object. */
export function validateFormDefinition(
  value: unknown,
  capabilities?: NativeSchemaCapabilities,
): NativeValidationResult {
  const diagnostics: NativeDiagnostic[] = [];
  let blockId: string | undefined;

  const issue = (code: string, message: string, path: NativePath) =>
    diagnostics.push(nativeDiagnostic(code, message, path, blockId));

  const json = (item: unknown, path: NativePath, ancestors: Set<object>, depth: number): void => {
    if (item === null || scalar(item)) return;

    if (typeof item !== "object" || depth > 128) {
      issue(
        "not-json",
        depth > 128 ? "The JSON definition is nested too deeply." : "Use only finite JSON values.",
        path,
      );

      return;
    }

    if (ancestors.has(item)) {
      issue("not-json", "JSON cannot contain a circular reference.", path);

      return;
    }

    const proto = Object.getPrototypeOf(item);

    if (!Array.isArray(item) && proto !== Object.prototype && proto !== null) {
      issue("not-json", "Use a plain JSON object.", path);

      return;
    }

    if (Object.getOwnPropertySymbols(item).length)
      issue("not-json", "JSON cannot contain symbol properties.", path);
    const next = new Set(ancestors);
    next.add(item);

    if (Array.isArray(item)) {
      for (let index = 0; index < item.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(item, String(index));

        if (!descriptor || !own(descriptor, "value"))
          issue("not-json", "JSON arrays cannot contain holes or accessors.", [...path, index]);
        else json(descriptor.value, [...path, index], next, depth + 1);
      }

      for (const key of Object.keys(item))
        if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= item.length)
          issue("not-json", "JSON arrays cannot contain named properties.", [...path, key]);
    } else
      for (const key of Object.getOwnPropertyNames(item)) {
        const descriptor = Object.getOwnPropertyDescriptor(item, key)!;

        if (!descriptor.enumerable || !own(descriptor, "value"))
          issue("not-json", "JSON cannot contain hidden properties or accessors.", [...path, key]);
        else json(descriptor.value, [...path, key], next, depth + 1);
      }
  };

  json(value, [], new Set(), 0);

  if (diagnostics.length) return { status: "blocked", schema: null, diagnostics };

  const record = (
    input: unknown,
    path: NativePath,
    allowed: readonly string[],
    required: readonly string[] = [],
  ): ObjectValue | undefined => {
    if (!object(input)) {
      issue("object", "Expected a JSON object.", path);

      return;
    }

    for (const key of Object.keys(input))
      if (!allowed.includes(key))
        issue("unknown-property", `Unsupported property ${key}.`, [...path, key]);

    for (const key of required)
      if (!own(input, key)) issue("missing-property", `Missing ${key}.`, [...path, key]);

    return input;
  };

  const text = (input: unknown, path: NativePath, nonempty = false): input is string => {
    if (typeof input !== "string" || (nonempty && !input.trim())) {
      issue("string", nonempty ? "Expected a nonempty string." : "Expected text.", path);

      return false;
    }

    return true;
  };

  const bool = (input: unknown, path: NativePath) => {
    if (typeof input !== "boolean") issue("boolean", "Expected true or false.", path);
  };

  const number = (input: unknown, path: NativePath, minimum?: number, integer = false) => {
    if (
      typeof input !== "number" ||
      !Number.isFinite(input) ||
      (minimum !== undefined && input < minimum) ||
      (integer && !Number.isSafeInteger(input))
    )
      issue(
        "number",
        `Expected a finite${integer ? " whole" : ""} number${minimum !== undefined ? ` of at least ${minimum}` : ""}.`,
        path,
      );
  };

  const enumeration = (input: unknown, path: NativePath, values: readonly unknown[]) => {
    if (!values.includes(input)) issue("enum", `Expected one of: ${values.join(", ")}.`, path);
  };

  const array = (input: unknown, path: NativePath, minimum = 0): unknown[] => {
    if (!Array.isArray(input)) {
      issue("array", "Expected an array.", path);

      return [];
    }

    if (input.length < minimum)
      issue("array-length", `Add at least ${minimum} item${minimum === 1 ? "" : "s"}.`, path);

    return input;
  };

  const optional = (
    record: ObjectValue,
    key: string,
    path: NativePath,
    check: (input: unknown, path: NativePath) => void,
  ) => {
    if (own(record, key)) check(record[key], [...path, key]);
  };

  const unique = (values: unknown[], path: NativePath, name: string) => {
    const seen = new Set<unknown>();
    values.forEach((item, index) => {
      if (seen.has(item)) issue("duplicate", `Duplicate ${name}.`, [...path, index]);
      seen.add(item);
    });
  };

  const scope = (record: ObjectValue, path: NativePath) =>
    optional(record, "scope", path, (item, at) => enumeration(item, at, ["form", "current"]));

  const reference = (input: ObjectValue, path: NativePath, display = false) => {
    const keys = ["answer", "value", "context"].filter((key) => own(input, key));
    record(input, path, [
      keys[0] ?? "answer",
      ...(keys[0] === "context" ? [] : ["scope"]),
      ...(display ? ["format", "fallback"] : []),
    ]);

    if (keys.length !== 1)
      issue("reference", "A reference must name exactly one answer, value or context.", path);

    if (keys[0] === "context")
      enumeration(
        input.context,
        [...path, "context"],
        ["today", "submissionReference", "submittedAt"],
      );
    else if (keys[0]) {
      text(input[keys[0]], [...path, keys[0]], true);
      scope(input, path);
    }

    if (display) {
      optional(input, "fallback", path, text);

      if (own(input, "format")) {
        const fmt = object(input.format) ? input.format : undefined;

        const format = record(
          input.format,
          [...path, "format"],
          fmt?.type === "currency"
            ? ["type", "currency", "fractionDigits"]
            : fmt?.type === "number"
              ? ["type", "fractionDigits"]
              : fmt?.type === "date"
                ? ["type", "style"]
                : fmt?.type === "boolean-label"
                  ? ["type", "trueLabel", "falseLabel"]
                  : ["type"],
          ["type"],
        );

        if (format) {
          enumeration(
            format.type,
            [...path, "format", "type"],
            ["number", "currency", "date", "choice-label", "boolean-label"],
          );

          if (
            format.type === "currency" &&
            (typeof format.currency !== "string" || !/^[A-Z]{3}$/.test(format.currency))
          )
            issue("currency", "Use a three-letter uppercase currency code.", [
              ...path,
              "format",
              "currency",
            ]);
          optional(format, "fractionDigits", [...path, "format"], (item, at) => {
            number(item, at, 0, true);

            if (typeof item === "number" && item > 20)
              issue("fraction-digits", "Use at most 20 fraction digits.", at);
          });
          optional(format, "style", [...path, "format"], (item, at) =>
            enumeration(item, at, ["short", "medium", "long", "full"]),
          );
          optional(format, "trueLabel", [...path, "format"], text);
          optional(format, "falseLabel", [...path, "format"], text);
        }
      }
    }
  };

  const richText = (input: unknown, path: NativePath): void => {
    if (typeof input === "string") return;
    array(input, path).forEach((inline, index) => {
      const at = [...path, index];

      if (typeof inline === "string") return;

      if (!object(inline)) {
        issue("rich-text", "Expected text or a supported inline object.", at);

        return;
      }

      if (own(inline, "text")) {
        record(inline, at, ["text", "marks"], ["text"]);
        text(inline.text, [...at, "text"]);

        if (own(inline, "marks")) {
          const marks = array(inline.marks, [...at, "marks"]);
          marks.forEach((mark, item) =>
            enumeration(
              mark,
              [...at, "marks", item],
              ["bold", "italic", "underline", "strikethrough", "code"],
            ),
          );
          unique(marks, [...at, "marks"], "text mark");
        }
      } else if (own(inline, "link")) {
        record(inline, at, ["link", "content"], ["link", "content"]);
        text(inline.link, [...at, "link"], true);
        richText(inline.content, [...at, "content"]);

        if (
          typeof inline.link === "string" &&
          /^(?:javascript|data|vbscript):/i.test(inline.link.trim())
        )
          issue("link", "Use a safe link destination.", [...at, "link"]);
      } else if (own(inline, "break")) {
        record(inline, at, ["break"], ["break"]);
        enumeration(inline.break, [...at, "break"], [true]);
      } else reference(inline, at, true);
    });
  };

  const expression = (input: unknown, path: NativePath): void => {
    if (scalar(input)) return;

    if (!object(input)) {
      issue("expression", "Expected a scalar, typed reference or expression.", path);

      return;
    }

    if (!own(input, "op")) {
      reference(input, path);

      return;
    }

    const op = input.op;
    record(
      input,
      path,
      op === "round"
        ? ["op", "args", "increment", "ties"]
        : op === "lookup"
          ? ["op", "args", "entries", "fallback"]
          : ["op", "args"],
      ["op", "args"],
    );
    enumeration(
      op,
      [...path, "op"],
      [
        "add",
        "subtract",
        "multiply",
        "divide",
        "min",
        "max",
        "coalesce",
        "year",
        "monthsBetween",
        "wholeYearsBetween",
        "daysBetween",
        "round",
        "lookup",
        "concat",
        "toText",
      ],
    );
    const args = array(input.args, [...path, "args"]);
    args.forEach((arg, index) => expression(arg, [...path, "args", index]));

    const count = ["round", "lookup", "year", "toText"].includes(String(op))
      ? 1
      : ["coalesce", "monthsBetween", "wholeYearsBetween", "daysBetween"].includes(String(op))
        ? 2
        : undefined;

    if (count !== undefined ? args.length !== count : args.length < 2)
      issue(
        "expression-arity",
        count
          ? `${String(op)} requires exactly ${count} argument${count === 1 ? "" : "s"}.`
          : `${String(op)} requires at least two arguments.`,
        [...path, "args"],
      );

    if (op === "round") {
      number(input.increment, [...path, "increment"], 0);

      if (input.increment === 0)
        issue("round-increment", "The rounding increment must be positive.", [
          ...path,
          "increment",
        ]);
      enumeration(input.ties, [...path, "ties"], ["towardPositiveInfinity"]);
    }

    if (op === "lookup") {
      const keys: unknown[] = [];
      array(input.entries, [...path, "entries"]).forEach((item, index) => {
        const at = [...path, "entries", index],
          entry = record(item, at, ["key", "value"], ["key", "value"]);

        if (!entry) return;

        if (!scalar(entry.key))
          issue("lookup-key", "A lookup key must be a non-null scalar.", [...at, "key"]);
        keys.push(entry.key);
        expression(entry.value, [...at, "value"]);
      });
      unique(keys, [...path, "entries"], "typed lookup key");
      expression(input.fallback, [...path, "fallback"]);
    }
  };

  const condition = (input: unknown, path: NativePath): void => {
    if (typeof input === "boolean") return;

    if (!object(input)) {
      issue("condition", "Expected a condition or true/false.", path);

      return;
    }

    const op = input.op;
    record(
      input,
      path,
      op === "all" || op === "any"
        ? ["op", "conditions"]
        : op === "not"
          ? ["op", "condition"]
          : op === "empty"
            ? ["op", "value"]
            : op === "selected"
              ? ["op", "question", "option", "scope"]
              : ["op", "left", "right"],
      ["op"],
    );
    enumeration(
      op,
      [...path, "op"],
      [
        "all",
        "any",
        "not",
        "eq",
        "ne",
        "gt",
        "gte",
        "lt",
        "lte",
        "empty",
        "selected",
        "contains",
        "startsWith",
        "endsWith",
      ],
    );

    if (op === "all" || op === "any")
      array(input.conditions, [...path, "conditions"], 1).forEach((child, index) =>
        condition(child, [...path, "conditions", index]),
      );
    else if (op === "not") condition(input.condition, [...path, "condition"]);
    else if (op === "empty") expression(input.value, [...path, "value"]);
    else if (op === "selected") {
      text(input.question, [...path, "question"], true);
      text(input.option, [...path, "option"], true);
      scope(input, path);
    } else {
      expression(input.left, [...path, "left"]);
      expression(input.right, [...path, "right"]);
    }
  };

  const visibilityTarget = (input: unknown, path: NativePath): void => {
    if (typeof input === "string") {
      text(input, path, true);

      return;
    }

    if (!object(input)) {
      issue("target", "Expected a block ID or structural target address.", path);

      return;
    }

    if (own(input, "question")) {
      record(
        input,
        path,
        own(input, "part") ? ["question", "part"] : ["question", "option"],
        own(input, "part") ? ["question", "part"] : ["question", "option"],
      );
      text(input.question, [...path, "question"], true);

      if (own(input, "part"))
        enumeration(input.part, [...path, "part"], ["label", "hint", "input"]);
      else text(input.option, [...path, "option"], true);
    } else {
      record(input, path, ["list", "item"], ["list", "item"]);
      text(input.list, [...path, "list"], true);
      text(input.item, [...path, "item"], true);
    }
  };

  const action = (input: unknown, path: NativePath): void => {
    if (!object(input)) {
      issue("action", "Expected a conditional logic action.", path);

      return;
    }

    const type = input.type;
    record(
      input,
      path,
      type === "setVisible"
        ? ["type", "targets", "value"]
        : type === "error"
          ? ["type", "target", "message"]
          : type === "goTo"
            ? ["type", "target"]
            : type === "setCompletionEnabled"
              ? ["type", "value"]
              : ["type", "target", "value"],
      ["type"],
    );
    enumeration(
      type,
      [...path, "type"],
      [
        "setVisible",
        "setRequired",
        "setLabel",
        "setTitle",
        "setValue",
        "error",
        "goTo",
        "setCompletionEnabled",
      ],
    );

    if (type === "setVisible")
      array(input.targets, [...path, "targets"], 1).forEach((target, index) =>
        visibilityTarget(target, [...path, "targets", index]),
      );
    else if (type !== "setCompletionEnabled") text(input.target, [...path, "target"], true);

    if (["setVisible", "setRequired", "setCompletionEnabled"].includes(String(type)))
      bool(input.value, [...path, "value"]);
    else if (type === "setValue") expression(input.value, [...path, "value"]);
    else if (type === "setLabel" || type === "setTitle") richText(input.value, [...path, "value"]);
    else if (type === "error") text(input.message, [...path, "message"]);
  };

  const repeat = (input: unknown, path: NativePath, page: boolean) => {
    const value = record(
      input,
      path,
      ["min", "max", "addLabel", ...(page ? ["key", "itemLabel"] : [])],
      ["min", "addLabel", ...(page ? ["key"] : [])],
    );

    if (!value) return;
    number(value.min, [...path, "min"], 0, true);
    optional(value, "max", path, (item, at) => number(item, at, 1, true));
    text(value.addLabel, [...path, "addLabel"]);

    if (typeof value.min === "number" && typeof value.max === "number" && value.min > value.max)
      issue("repeat-bounds", "The minimum repeat count exceeds the maximum.", path);

    if (page) {
      text(value.key, [...path, "key"], true);
      optional(value, "itemLabel", path, text);
    }
  };

  const validation = (input: unknown, path: NativePath, kind: string) => {
    if (!object(input)) {
      issue("validation", "Expected an answer validation rule.", path);

      return;
    }

    const type = input.type;
    record(
      input,
      path,
      [
        "id",
        "type",
        "message",
        ...(type === "pattern"
          ? ["pattern", "flags"]
          : ["integer", "email", "phone"].includes(String(type))
            ? []
            : ["value"]),
        ...(["minimum", "maximum", "dateBefore", "dateAfter"].includes(String(type))
          ? ["inclusive"]
          : []),
        ...(type === "maxFileSize" ? ["unit"] : []),
      ],
      ["id", "type", "message"],
    );
    text(input.id, [...path, "id"], true);
    text(input.message, [...path, "message"]);
    enumeration(
      type,
      [...path, "type"],
      [
        "minLength",
        "maxLength",
        "pattern",
        "minimum",
        "maximum",
        "integer",
        "equals",
        "email",
        "phone",
        "dateBefore",
        "dateAfter",
        "minAge",
        "maxAge",
        "minSelections",
        "maxSelections",
        "fileTypes",
        "dateIn",
        "minFiles",
        "maxFiles",
        "maxFileSize",
      ],
    );

    const allowedKinds: Record<string, string[]> = {
      minimum: ["number"],
      maximum: ["number"],
      integer: ["number"],
      minAge: ["date"],
      maxAge: ["date"],
      dateBefore: ["date"],
      dateAfter: ["date"],
      minSelections: ["choice"],
      maxSelections: ["choice"],
      fileTypes: ["file"],
      dateIn: ["date"],
      minFiles: ["file"],
      maxFiles: ["file"],
      maxFileSize: ["file"],
      minLength: [...stringFields],
      maxLength: [...stringFields],
      pattern: [...stringFields, "opening-hours"],
      email: [...stringFields],
      phone: [...stringFields],
    };

    if (
      builtinFields.has(kind) &&
      allowedKinds[String(type)] &&
      !allowedKinds[String(type)]!.includes(kind)
    )
      issue("validation-kind", `${String(type)} does not apply to ${kind} questions.`, [
        ...path,
        "type",
      ]);

    if (type === "pattern") {
      text(input.pattern, [...path, "pattern"]);
      text(input.flags, [...path, "flags"]);

      if (typeof input.pattern === "string" && typeof input.flags === "string")
        try {
          new RegExp(input.pattern, input.flags);
        } catch {
          issue("pattern", "The regular expression or its flags are invalid.", path);
        }
    } else if (type === "dateBefore" || type === "dateAfter")
      expression(input.value, [...path, "value"]);
    else if (type === "equals") {
      if (!scalar(input.value))
        issue("equals", "An exact comparison needs a scalar value.", [...path, "value"]);
    } else if (type === "fileTypes" || type === "dateIn") {
      const types = array(input.value, [...path, "value"], 1);
      types.forEach((item, index) => {
        text(item, [...path, "value", index], true);

        if (type === "dateIn" && !isDateOnly(item))
          issue("date-in", "Use valid date-only values in an allowed-date list.", [
            ...path,
            "value",
            index,
          ]);
      });
      unique(types, [...path, "value"], type === "dateIn" ? "allowed date" : "file type");
    } else if (!["integer", "email", "phone"].includes(String(type)))
      number(
        input.value,
        [...path, "value"],
        ["minimum", "maximum"].includes(String(type)) ? undefined : 0,
        !["minimum", "maximum", "maxFileSize"].includes(String(type)),
      );
    optional(input, "inclusive", path, bool);

    if (type === "maxFileSize") {
      enumeration(input.unit, [...path, "unit"], ["MB"]);

      if (input.value === 0)
        issue("file-size", "The file size limit must be positive.", [...path, "value"]);
    }
  };

  const layout = (input: unknown, path: NativePath) => {
    const value = record(input, path, ["under"], ["under"]);

    if (!value) return;

    if (object(value.under) && own(value.under, "block")) {
      record(value.under, [...path, "under"], ["block"], ["block"]);
      text(value.under.block, [...path, "under", "block"], true);
    } else {
      const target = record(
        value.under,
        [...path, "under"],
        ["question", "option"],
        ["question", "option"],
      );

      if (target) {
        text(target.question, [...path, "under", "question"], true);
        text(target.option, [...path, "under", "option"], true);
      }
    }
  };

  const block = (input: unknown, path: NativePath, nested = false): void => {
    const previousBlock = blockId;
    blockId = object(input) && typeof input.id === "string" ? input.id : undefined;

    if (!object(input)) {
      issue("block", "Expected a form block.", path);
      blockId = previousBlock;

      return;
    }

    const type = input.type;

    const keys: Record<string, string[]> = {
      page: [
        "id",
        "type",
        "role",
        "title",
        "description",
        "visible",
        "repeat",
        "review",
        "navigation",
      ],
      question: [
        "id",
        "type",
        "kind",
        "key",
        "label",
        "hint",
        "visible",
        "disabled",
        "default",
        "required",
        "validation",
        "options",
        "config",
        "submit",
        "review",
        "repeat",
        "parts",
        "layout",
      ],
      content: ["id", "type", "kind", "content", "visible", "config", "layout"],
      calculated: ["id", "type", "name", "valueType", "expression", "key", "submit", "visible"],
      logic: ["id", "type", "rules", "visible"],
    };

    record(input, path, keys[String(type)] ?? ["id", "type"], ["id", "type"]);
    text(input.id, [...path, "id"], true);
    enumeration(type, [...path, "type"], nested ? ["content"] : Object.keys(keys));
    optional(input, "visible", path, bool);
    optional(input, "layout", path, layout);

    if (type === "page") {
      enumeration(
        input.role,
        [...path, "role"],
        ["questions", "review", "declaration", "confirmation", "result"],
      );
      richText(input.title, [...path, "title"]);
      optional(input, "description", path, richText);

      if (own(input, "repeat")) {
        repeat(input.repeat, [...path, "repeat"], true);

        if (input.role !== "questions")
          issue("page-repeat", "Only question pages can repeat.", [...path, "repeat"]);
      }

      if (own(input, "navigation")) {
        const navigation = record(
          input.navigation,
          [...path, "navigation"],
          ["nextLabel", "backLabel"],
        );

        if (navigation) {
          optional(navigation, "nextLabel", [...path, "navigation"], text);
          optional(navigation, "backLabel", [...path, "navigation"], text);
        }
      }

      if (own(input, "review")) {
        const review = record(
          input.review,
          [...path, "review"],
          ["questions", "emptyAnswers", "changeLinks"],
          ["questions", "emptyAnswers", "changeLinks"],
        );

        if (review) {
          enumeration(review.questions, [...path, "review", "questions"], ["preceding"]);
          enumeration(review.emptyAnswers, [...path, "review", "emptyAnswers"], ["omit", "show"]);
          bool(review.changeLinks, [...path, "review", "changeLinks"]);
        }

        if (input.role !== "review")
          issue("page-review", "Review configuration belongs to a review page.", [
            ...path,
            "review",
          ]);
      }
    } else if (type === "question") {
      text(input.kind, [...path, "kind"], true);
      text(input.key, [...path, "key"], true);
      richText(input.label, [...path, "label"]);

      if (own(input, "hint")) {
        if (
          Array.isArray(input.hint) &&
          input.hint.some((item) => object(item) && own(item, "type"))
        )
          input.hint.forEach((item, index) => block(item, [...path, "hint", index], true));
        else richText(input.hint, [...path, "hint"]);
      }

      for (const key of ["disabled", "submit", "review"]) optional(input, key, path, bool);

      if (own(input, "required")) {
        const required = record(
          input.required,
          [...path, "required"],
          ["value", "message"],
          ["value", "message"],
        );

        if (required) {
          bool(required.value, [...path, "required", "value"]);
          text(required.message, [...path, "required", "message"]);
        }
      }

      if (
        own(input, "default") &&
        !scalar(input.default) &&
        !(Array.isArray(input.default) && input.default.every(scalar))
      ) {
        if (input.kind === "date" && object(input.default)) {
          record(input.default, [...path, "default"], ["context"], ["context"]);
          enumeration(input.default.context, [...path, "default", "context"], ["today"]);
        } else
          issue(
            "default",
            "A default answer must use scalar JSON values; only dates support the today context.",
            [...path, "default"],
          );
      }

      if (own(input, "repeat")) repeat(input.repeat, [...path, "repeat"], false);

      if (own(input, "parts")) {
        const parts = record(input.parts, [...path, "parts"], ["label", "hint", "input"]);

        if (parts)
          for (const part of Object.keys(parts)) {
            const state = record(parts[part], [...path, "parts", part], ["visible"]);

            if (state) optional(state, "visible", [...path, "parts", part], bool);
          }
      }

      if (own(input, "validation")) {
        const rules = array(input.validation, [...path, "validation"]);
        rules.forEach((rule, index) =>
          validation(rule, [...path, "validation", index], String(input.kind)),
        );
        unique(
          rules.map((rule) => (object(rule) ? rule.id : undefined)),
          [...path, "validation"],
          "validation ID",
        );
      }

      if (own(input, "options")) {
        const options = array(input.options, [...path, "options"], 1);
        options.forEach((item, index) => {
          const at = [...path, "options", index],
            option = record(
              item,
              at,
              ["id", "label", "value", "visible"],
              ["id", "label", "value"],
            );

          if (option) {
            text(option.id, [...at, "id"], true);
            richText(option.label, [...at, "label"]);

            if (!scalar(option.value))
              issue("option-value", "An option value must be a non-null scalar.", [...at, "value"]);
            optional(option, "visible", at, bool);
          }
        });
        unique(
          options.map((item) => (object(item) ? item.id : undefined)),
          [...path, "options"],
          "option ID",
        );
        unique(
          options.map((item) => (object(item) ? item.value : undefined)),
          [...path, "options"],
          "typed option value",
        );

        if (input.kind !== "choice" && builtinFields.has(String(input.kind)))
          issue("options-kind", "Only choice questions have options.", [...path, "options"]);
      }

      const kind = String(input.kind);

      const configKeys: Record<string, string[]> = {
        text: ["width", "placeholder", "mask"],
        "long-text": ["width", "placeholder", "mask"],
        email: ["width", "placeholder", "mask"],
        phone: ["width", "placeholder", "mask"],
        number: ["width", "placeholder", "step"],
        time: ["width", "placeholder", "stepSeconds"],
        "address-lookup": ["placeholder", "provider"],
        "opening-hours": [],
        date: [],
        file: ["multiple"],
        boolean: [],
        choice: ["selection", "presentation", "groups", "width", "placeholder"],
      };

      const config = own(input, "config")
        ? record(
            input.config,
            [...path, "config"],
            configKeys[kind] ?? (object(input.config) ? Object.keys(input.config) : []),
          )
        : undefined;

      if (config) {
        optional(config, "multiple", [...path, "config"], bool);
        optional(config, "width", [...path, "config"], (item, at) =>
          enumeration(item, at, ["short", "medium", "long"]),
        );

        for (const key of ["placeholder", "mask", "provider"])
          optional(config, key, [...path, "config"], text);

        for (const key of ["step", "stepSeconds"])
          optional(config, key, [...path, "config"], (item, at) => {
            number(item, at, 0);

            if (item === 0) issue("step", "The input increment must be positive.", at);
          });
      }

      if (kind === "choice") {
        if (!config)
          issue("choice-config", "A choice question needs a selection configuration.", [
            ...path,
            "config",
          ]);
        else {
          enumeration(config.selection, [...path, "config", "selection"], ["single", "multiple"]);
          optional(config, "presentation", [...path, "config"], (item, at) =>
            enumeration(item, at, ["radio", "checkboxes", "dropdown", "accordion"]),
          );

          if (
            (["radio", "dropdown"].includes(String(config.presentation)) &&
              config.selection !== "single") ||
            (["checkboxes", "accordion"].includes(String(config.presentation)) &&
              config.selection !== "multiple")
          )
            issue(
              "choice-presentation",
              "This presentation does not match the choice selection mode.",
              [...path, "config", "presentation"],
            );

          if (own(config, "groups")) {
            if (config.presentation !== "accordion")
              issue("choice-groups", "Choice groups belong to accordion presentation.", [
                ...path,
                "config",
                "groups",
              ]);

            const groups = array(config.groups, [...path, "config", "groups"], 1),
              membership: string[] = [];

            groups.forEach((item, index) => {
              const at = [...path, "config", "groups", index],
                group = record(
                  item,
                  at,
                  ["id", "label", "higherRisk", "optionIds"],
                  ["id", "label", "optionIds"],
                );

              if (group) {
                text(group.id, [...at, "id"], true);
                richText(group.label, [...at, "label"]);
                optional(group, "higherRisk", at, bool);
                array(group.optionIds, [...at, "optionIds"], 1).forEach((id, option) => {
                  if (text(id, [...at, "optionIds", option], true)) membership.push(id);
                });
              }
            });
            unique(
              groups.map((group) => (object(group) ? group.id : undefined)),
              [...path, "config", "groups"],
              "group ID",
            );
            unique(membership, [...path, "config", "groups"], "group option membership");

            if (
              Array.isArray(input.options) &&
              input.options.some(
                (option) => object(option) && !membership.includes(String(option.id)),
              )
            )
              issue("choice-groups", "Every option must belong to exactly one accordion group.", [
                ...path,
                "config",
                "groups",
              ]);
          }
        }

        if (!own(input, "options"))
          issue("choice-options", "A choice question needs options.", [...path, "options"]);
      }

      if (
        !builtinFields.has(kind) &&
        !capabilities?.fields.some((module) =>
          nativeCapabilityMatches(module, { kind, config: input.config }),
        )
      )
        issue("unsupported-field", `Unsupported native question kind: ${kind}.`, [...path, "kind"]);
    } else if (type === "content") {
      text(input.kind, [...path, "kind"], true);
      richText(input.content, [...path, "content"]);

      const kind = String(input.kind),
        configKeys: Record<string, string[]> = {
          paragraph: [],
          "question-label": [],
          heading: ["level"],
          callout: ["tone"],
          list: ["ordered", "items"],
          expandable: ["blocks"],
        };

      const config = own(input, "config")
        ? record(
            input.config,
            [...path, "config"],
            configKeys[kind] ?? (object(input.config) ? Object.keys(input.config) : []),
          )
        : undefined;

      if (["heading", "list", "expandable"].includes(kind) && !config)
        issue("content-config", `${kind} needs its typed configuration.`, [...path, "config"]);

      if (config) {
        if (kind === "heading") enumeration(config.level, [...path, "config", "level"], [1, 2, 3]);
        else if (kind === "callout")
          optional(config, "tone", [...path, "config"], (item, at) =>
            enumeration(item, at, ["inset", "warning"]),
          );
        else if (kind === "list") {
          optional(config, "ordered", [...path, "config"], bool);
          const items = array(config.items, [...path, "config", "items"]);
          items.forEach((child, index) => {
            const at = [...path, "config", "items", index],
              item = record(child, at, ["id", "content", "visible"], ["id", "content"]);

            if (item) {
              text(item.id, [...at, "id"], true);
              richText(item.content, [...at, "content"]);
              optional(item, "visible", at, bool);
            }
          });
          unique(
            items.map((item) => (object(item) ? item.id : undefined)),
            [...path, "config", "items"],
            "list item ID",
          );
        } else if (kind === "expandable")
          array(config.blocks, [...path, "config", "blocks"]).forEach((child, index) =>
            block(child, [...path, "config", "blocks", index], true),
          );
      }

      if (
        !builtinContents.has(kind) &&
        !capabilities?.contents.some((module) =>
          nativeCapabilityMatches(module, { kind, config: input.config }),
        )
      )
        issue("unsupported-content", `Unsupported native content kind: ${kind}.`, [
          ...path,
          "kind",
        ]);
    } else if (type === "calculated") {
      optional(input, "name", path, text);
      enumeration(input.valueType, [...path, "valueType"], ["string", "number", "boolean", "date"]);
      optional(input, "expression", path, expression);
      optional(input, "key", path, (item, at) => text(item, at, true));
      optional(input, "submit", path, bool);

      if (input.submit === true && !own(input, "key"))
        issue("calculated-key", "A submitted calculated value needs an answer key.", [
          ...path,
          "key",
        ]);
    } else if (type === "logic") {
      const rules = array(input.rules, [...path, "rules"], 1);
      rules.forEach((item, index) => {
        const at = [...path, "rules", index],
          rule = record(item, at, ["id", "when", "actions", "enabled"], ["id", "when", "actions"]);

        if (rule) {
          text(rule.id, [...at, "id"], true);
          optional(rule, "enabled", at, bool);
          condition(rule.when, [...at, "when"]);
          array(rule.actions, [...at, "actions"], 1).forEach((item, index) =>
            action(item, [...at, "actions", index]),
          );
        }
      });
      unique(
        rules.map((rule) => (object(rule) ? rule.id : undefined)),
        [...path, "rules"],
        "rule ID",
      );
    }

    blockId = previousBlock;
  };

  const form = record(
    value,
    [],
    [
      "schemaVersion",
      "id",
      "title",
      "description",
      "mode",
      "locale",
      "timeZone",
      "settings",
      "blocks",
    ],
    ["schemaVersion", "id", "title", "mode", "locale", "timeZone", "settings", "blocks"],
  );

  if (!form) return { status: "blocked", schema: null, diagnostics };

  if (form.schemaVersion !== 2)
    issue(
      "schema-version",
      own(form, "schemaVersion")
        ? "Unsupported form schema version; expected 2."
        : "This is not a v2 form definition. Import a JSON file exported from this form builder.",
      ["schemaVersion"],
    );
  text(form.id, ["id"], true);
  text(form.title, ["title"]);
  optional(form, "description", [], richText);
  enumeration(form.mode, ["mode"], ["application", "calculator"]);

  if (text(form.locale, ["locale"], true))
    try {
      new Intl.Locale(form.locale);
    } catch {
      issue("locale", "Use a valid locale identifier.", ["locale"]);
    }

  if (text(form.timeZone, ["timeZone"], true))
    try {
      new Intl.DateTimeFormat("en", { timeZone: form.timeZone });
    } catch {
      issue("time-zone", "Use a valid IANA time zone.", ["timeZone"]);
    }

  const settings = record(
    form.settings,
    ["settings"],
    ["visibility", "hiddenAnswers", "closingDateTime", "contact", "notifications"],
    ["visibility", "hiddenAnswers"],
  );

  if (settings) {
    enumeration(
      settings.visibility,
      ["settings", "visibility"],
      ["draft", "preview", "public", "maintenance"],
    );
    enumeration(settings.hiddenAnswers, ["settings", "hiddenAnswers"], ["retain", "clear"]);
    optional(settings, "closingDateTime", ["settings"], (item, at) => {
      if (
        text(item, at) &&
        (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(item) ||
          !Number.isFinite(Date.parse(item)) ||
          !isDateOnly(item.slice(0, 10)))
      )
        issue("closing-date", "Use a valid timestamp with an explicit offset.", at);
    });

    if (own(settings, "contact")) {
      const contact = record(
        settings.contact,
        ["settings", "contact"],
        ["title", "telephoneNumber", "email", "address"],
      );

      if (contact) {
        optional(contact, "title", ["settings", "contact"], text);
        optional(contact, "telephoneNumber", ["settings", "contact"], text);
        optional(contact, "email", ["settings", "contact"], (item, at) => {
          if (text(item, at) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item))
            issue("contact-email", "Use a valid contact email address.", at);
        });

        if (own(contact, "address")) {
          const address = record(
            contact.address,
            ["settings", "contact", "address"],
            ["line1", "line2", "city", "country"],
            ["line1", "city"],
          );

          if (address)
            for (const key of Object.keys(address))
              text(
                address[key],
                ["settings", "contact", "address", key],
                ["line1", "city"].includes(key),
              );
        }
      }
    }

    if (own(settings, "notifications")) {
      const notifications = record(
        settings.notifications,
        ["settings", "notifications"],
        ["applicant", "department"],
      );

      if (notifications)
        for (const kind of ["applicant", "department"])
          if (own(notifications, kind)) {
            const path = ["settings", "notifications", kind],
              notification = record(
                notifications[kind],
                path,
                ["enabled", "recipient", "subject"],
                ["enabled", "recipient"],
              );

            if (!notification) continue;
            bool(notification.enabled, [...path, "enabled"]);
            optional(notification, "subject", path, text);

            const recipient = record(
              notification.recipient,
              [...path, "recipient"],
              kind === "applicant"
                ? ["answer"]
                : object(notification.recipient) && own(notification.recipient, "contact")
                  ? ["contact"]
                  : ["context"],
            );

            if (recipient) {
              if (kind === "applicant")
                text(recipient.answer, [...path, "recipient", "answer"], true);
              else if (own(recipient, "contact")) {
                enumeration(recipient.contact, [...path, "recipient", "contact"], ["email"]);

                if (!object(settings.contact) || !settings.contact.email)
                  issue(
                    "contact-recipient",
                    "The department notification needs a contact email address.",
                    [...path, "recipient"],
                  );
              } else
                enumeration(
                  recipient.context,
                  [...path, "recipient", "context"],
                  ["departmentEmail"],
                );
            }
          }
    }
  }

  array(form.blocks, ["blocks"], 1).forEach((item, index) => block(item, ["blocks", index]));

  if (diagnostics.length) return { status: "blocked", schema: null, diagnostics };
  // SAFETY: every owned form/block property passed the non-coercing checks above; extension configs remain opaque until their module validators run.
  const schema = value as AnyFormDefinition;
  const invalidModules = new Set<string>();

  if (capabilities) {
    diagnostics.push(...validateNativeCapabilities(capabilities));

    const check = (entry: AnyFormBlock, path: NativePath) => {
      if (entry.type === "question" || entry.type === "content") {
        const before = diagnostics.length;
        const modules = entry.type === "question" ? capabilities.fields : capabilities.contents;
        const matches = modules.filter((module) => nativeCapabilityMatches(module, entry));

        if (matches.length !== 1)
          diagnostics.push(
            nativeDiagnostic(
              matches.length ? "ambiguous-module" : "missing-module",
              matches.length
                ? `More than one installed module claims ${entry.kind}.`
                : `No installed module supports ${entry.kind} with this configuration.`,
              path,
              entry.id,
            ),
          );
        else
          try {
            if (entry.type === "question")
              // SAFETY: modules was selected from capabilities.fields for this question, and exactly one match was found.
              diagnostics.push(
                ...((matches[0] as NativeFieldCapability).validate?.(entry, path) ?? []),
              );
            else
              // SAFETY: modules was selected from capabilities.contents for this content block, and exactly one match was found.
              diagnostics.push(
                ...((matches[0] as NativeContentCapability).validate?.(entry, path) ?? []),
              );
          } catch (error) {
            diagnostics.push(
              nativeDiagnostic(
                "module-validation",
                error instanceof Error
                  ? error.message
                  : `The ${entry.kind} module could not validate this block.`,
                path,
                entry.id,
              ),
            );
          }

        if (
          (!builtinFields.has(entry.kind) && entry.type === "question" && !matches[0]?.validate) ||
          (!builtinContents.has(entry.kind) && entry.type === "content" && !matches[0]?.validate)
        )
          diagnostics.push(
            nativeDiagnostic(
              "module-validation",
              `The ${entry.kind} module must validate its configuration.`,
              path,
              entry.id,
            ),
          );

        if (diagnostics.slice(before).some((issue) => issue.severity === "error"))
          invalidModules.add(entry.id);
      } else if (
        (entry.type === "logic" || entry.type === "calculated") &&
        capabilities.structural &&
        !capabilities.structural.includes(entry.type)
      )
        diagnostics.push(
          nativeDiagnostic(
            "missing-module",
            `No installed module supports ${entry.type}.`,
            path,
            entry.id,
          ),
        );
      nestedBlocks(entry).forEach((child) => check(child.block, [...path, ...child.path]));
    };

    schema.blocks.forEach((entry, index) => check(entry, ["blocks", index]));
  }

  diagnostics.push(...validateReferencesAndSemantics(schema, capabilities, invalidModules));

  return diagnostics.some((item) => item.severity === "error")
    ? { status: "blocked", schema: null, diagnostics }
    : { status: "ready", schema, diagnostics };
}

type NestedBlock = { block: ContentBlock; path: (string | number)[] };

function nestedBlocks(block: AnyFormBlock): NestedBlock[] {
  if (block.type === "question" && Array.isArray(block.hint))
    return block.hint.flatMap((child, index) =>
      typeof child === "object" && "type" in child && child.type === "content"
        ? [{ block: child, path: ["hint", index] }]
        : [],
    );

  if (block.type === "content" && block.kind === "expandable")
    // SAFETY: structural validation checked expandable.config.blocks before semantic traversal began.
    return ((block as Extract<ContentBlock, { kind: "expandable" }>).config?.blocks ?? []).map(
      (child, index) => ({ block: child, path: ["config", "blocks", index] }),
    );

  return [];
}

type BlockEntry = {
  block: AnyFormBlock;
  path: NativePath;
  page?: Extract<AnyFormBlock, { type: "page" }>;
  scope: string;
  order: number;
  parent?: string;
};

function validateReferencesAndSemantics(
  form: AnyFormDefinition,
  capabilities?: NativeSchemaCapabilities,
  invalidModules: ReadonlySet<string> = new Set(),
): NativeDiagnostic[] {
  const diagnostics: NativeDiagnostic[] = [],
    entries = new Map<string, BlockEntry>(),
    answerKeys = new Map<string, Set<string>>();

  const issue = (code: string, message: string, path: NativePath, blockId?: string) =>
    diagnostics.push(nativeDiagnostic(code, message, path, blockId));

  let currentPage: Extract<AnyFormBlock, { type: "page" }> | undefined;

  const add = (block: AnyFormBlock, path: NativePath, order: number, parent?: string): void => {
    if (entries.has(block.id))
      issue("duplicate-id", `Duplicate block ID: ${block.id}.`, [...path, "id"], block.id);
    const scope = currentPage?.repeat ? currentPage.id : "form";
    entries.set(block.id, { block, path, page: currentPage, scope, order, parent });

    const key =
      block.type === "page"
        ? block.repeat?.key
        : block.type === "question" || block.type === "calculated"
          ? block.key
          : undefined;

    if (key !== undefined) {
      const keyScope = block.type === "page" ? "form" : scope,
        seen = answerKeys.get(keyScope) ?? new Set<string>();

      if (seen.has(key))
        issue(
          "duplicate-key",
          `Duplicate submitted key in ${keyScope}: ${key}.`,
          [
            ...path,
            block.type === "page" ? "repeat" : "key",
            ...(block.type === "page" ? ["key"] : []),
          ],
          block.id,
        );
      seen.add(key);
      answerKeys.set(keyScope, seen);
    }

    nestedBlocks(block).forEach((child) =>
      add(child.block, [...path, ...child.path], order, block.id),
    );
  };

  form.blocks.forEach((block, index) => {
    if (block.type === "page") currentPage = block;
    add(block, ["blocks", index], index);
  });
  const first = form.blocks[0];

  if (first?.type !== "page" || first.role !== "questions")
    issue("first-page", "The first block must be an unconditional questions page.", ["blocks", 0]);
  else if (first.visible === false)
    issue(
      "first-page",
      "The first questions page cannot be hidden.",
      ["blocks", 0, "visible"],
      first.id,
    );

  for (const entry of entries.values()) {
    const { block, path } = entry;

    if (!entry.page) issue("page-owner", "Every block must belong to a page.", path, block.id);

    if (block.type === "question" && entry.page?.role === "confirmation")
      issue(
        "confirmation-content",
        "Keep only text, headings and lists on the confirmation page. Move other blocks to an earlier page.",
        path,
        block.id,
      );

    if (block.type === "page") {
      if (
        form.mode === "calculator" &&
        ["review", "declaration", "confirmation"].includes(block.role)
      )
        issue(
          "page-mode",
          "Calculators use a result page, not submission pages.",
          [...path, "role"],
          block.id,
        );

      if (form.mode === "application" && block.role === "result")
        issue(
          "page-mode",
          "Application completion uses a confirmation page.",
          [...path, "role"],
          block.id,
        );

      if (capabilities?.pageRoles && !capabilities.pageRoles.includes(block.role))
        issue(
          "missing-module",
          `No installed module supports the ${block.role} page role.`,
          [...path, "role"],
          block.id,
        );
    }
  }

  const questionType = (question: QuestionBase): string => {
    let type: string;

    if (question.kind === "choice") {
      // SAFETY: structural validation checked this built-in choice kind and its options before semantic traversal.
      const choice = question as Extract<QuestionBlock, { kind: "choice" }>;
      type = typeof choice.options?.[0]?.value;

      if (choice.config?.selection === "multiple") type += "[]";
    } else if (stringFields.has(question.kind)) type = "string";
    else if (question.kind === "opening-hours") type = "string[]";
    else if (question.kind === "file") type = "file[]";
    else if (["number", "boolean", "date", "time"].includes(question.kind)) type = question.kind;
    else
      type =
        capabilities?.fields.find((module) => nativeCapabilityMatches(module, question))
          ?.valueType ?? "unknown";

    return question.repeat ? `${type}[]` : type;
  };

  const refType = (reference: { answer?: string; value?: string; context?: string }): string => {
    if (reference.context)
      return reference.context === "today" || reference.context === "submittedAt"
        ? "date"
        : "string";
    const target = entries.get(reference.answer ?? reference.value ?? "")?.block;

    return target?.type === "question"
      ? questionType(target)
      : target?.type === "calculated"
        ? target.valueType
        : "unknown";
  };

  const compatible = (left: string, right: string) =>
    left === right || left === "unknown" || right === "unknown";

  const expressionType = (
    expression: Expression,
    path: NativePath,
    blockId: string,
    expected?: string,
  ): string => {
    if (typeof expression !== "object")
      return expected === "date" && isDateOnly(expression) ? "date" : typeof expression;

    if (!("op" in expression)) return refType(expression);

    const argumentType = ["year", "monthsBetween", "wholeYearsBetween", "daysBetween"].includes(
      expression.op,
    )
      ? "date"
      : undefined;

    const types = expression.args.map((arg, index) =>
      expressionType(arg, [...path, "args", index], blockId, argumentType),
    );

    if (capabilities?.operators && !capabilities.operators.includes(expression.op))
      issue(
        "missing-module",
        `No installed module supports ${expression.op}.`,
        [...path, "op"],
        blockId,
      );

    const requireType = (type: string) =>
      types.forEach((actual, index) => {
        if (!compatible(actual, type))
          issue(
            "expression-type",
            `${expression.op} needs ${type} arguments; this argument is ${actual}.`,
            [...path, "args", index],
            blockId,
          );
      });

    switch (expression.op) {
      case "lookup": {
        const output = expressionType(
          expression.fallback,
          [...path, "fallback"],
          blockId,
          expected,
        );

        expression.entries.forEach((entry, index) => {
          const keyType = types[0] === "date" && isDateOnly(entry.key) ? "date" : typeof entry.key;

          if (!compatible(keyType, types[0]!))
            issue(
              "lookup-key-type",
              "The lookup key and table keys must use the same type.",
              [...path, "entries", index, "key"],
              blockId,
            );

          const actual = expressionType(
            entry.value,
            [...path, "entries", index, "value"],
            blockId,
            output,
          );

          if (!compatible(actual, output))
            issue(
              "expression-type",
              "All lookup results and the fallback must use the same type.",
              [...path, "entries", index, "value"],
              blockId,
            );
        });

        return output;
      }

      case "coalesce":
        if (!compatible(types[0]!, types[1]!))
          issue("expression-type", "Coalesce must preserve the value type.", path, blockId);

        return types[0]!;
      case "year":
      case "monthsBetween":
      case "wholeYearsBetween":
      case "daysBetween":
        requireType("date");

        return "number";
      case "concat":
        requireType("string");

        return "string";
      case "toText":
        if (types[0]!.endsWith("[]"))
          issue("expression-type", "toText cannot implicitly flatten a collection.", path, blockId);

        return "string";
      default:
        requireType("number");

        return "number";
    }
  };

  const conditionTypes = (condition: Condition, path: NativePath, blockId: string): void => {
    if (typeof condition === "boolean") return;

    if (capabilities?.operators && !capabilities.operators.includes(condition.op))
      issue(
        "missing-module",
        `No installed module supports ${condition.op}.`,
        [...path, "op"],
        blockId,
      );

    if (condition.op === "all" || condition.op === "any")
      condition.conditions.forEach((child, index) =>
        conditionTypes(child, [...path, "conditions", index], blockId),
      );
    else if (condition.op === "not")
      conditionTypes(condition.condition, [...path, "condition"], blockId);
    else if (condition.op === "empty") expressionType(condition.value, [...path, "value"], blockId);
    else if (condition.op !== "selected" && "left" in condition) {
      const expectedLeft =
        typeof condition.right === "object" && !("op" in condition.right)
          ? refType(condition.right)
          : undefined;

      const left = expressionType(condition.left, [...path, "left"], blockId, expectedLeft),
        right = expressionType(condition.right, [...path, "right"], blockId, left);

      if (!compatible(left, right))
        issue("condition-type", `Cannot compare ${left} with ${right}.`, path, blockId);

      if (left.endsWith("[]") || right.endsWith("[]"))
        issue(
          "condition-type",
          "Use selected/empty for collections; scalar comparisons cannot read a repeated answer.",
          path,
          blockId,
        );

      if (
        ["gt", "gte", "lt", "lte"].includes(condition.op) &&
        !["number", "date", "time", "unknown"].includes(left)
      )
        issue(
          "condition-type",
          "Ordered comparisons require numbers, dates or times.",
          path,
          blockId,
        );

      if (["contains", "startsWith", "endsWith"].includes(condition.op) && left !== "string")
        issue("condition-type", "Text comparisons require text operands.", path, blockId);
    }
  };

  const referenceScope = (reference: NativeReference, target: BlockEntry): void => {
    const source = reference.blockId ? entries.get(reference.blockId) : undefined;
    const fromScope = source?.scope ?? "form";
    const resolved = reference.scope === "form" ? "form" : fromScope;

    if (reference.scope === "current" && fromScope === "form")
      issue(
        "reference-scope",
        "Current-entry references need an enclosing repeated page.",
        reference.path,
        reference.blockId,
      );

    if (target.scope !== resolved)
      issue(
        "reference-scope",
        `The reference to ${reference.id} crosses a repeat scope; form references must be explicit.`,
        reference.path,
        reference.blockId,
      );
  };

  const checkReference = (reference: NativeReference) => {
    let holder: unknown = form;

    for (const part of reference.path.slice(0, -1))
      // SAFETY: only arrays and non-null records are indexed; their property values stay unknown until the next check.
      holder =
        object(holder) || Array.isArray(holder)
          ? (holder as Record<string | number, unknown>)[part]
          : undefined;

    if (object(holder) && object(holder.format)) {
      const format = holder.format.type,
        type = reference.kind === "context" ? refType({ context: reference.id }) : refType(holder);

      const target = entries.get(reference.id)?.block;

      if (capabilities?.formats && !capabilities.formats.includes(String(format)))
        issue(
          "missing-module",
          `No installed module supports the ${String(format)} format.`,
          [...reference.path.slice(0, -1), "format"],
          reference.blockId,
        );

      if (
        ((format === "number" || format === "currency") && type !== "number") ||
        (format === "date" && type !== "date") ||
        (format === "boolean-label" && type !== "boolean") ||
        (format === "choice-label" && !(target?.type === "question" && target.kind === "choice"))
      )
        issue(
          "format-type",
          `The ${String(format)} format does not apply to this reference.`,
          [...reference.path.slice(0, -1), "format"],
          reference.blockId,
        );
    }

    if (reference.kind === "context") return;

    if (reference.kind === "option") {
      const owner = entries.get(reference.ownerId!)?.block;

      if (
        owner?.type !== "question" ||
        owner.kind !== "choice" ||
        !owner.options?.some((option) => option.id === reference.id)
      )
        issue(
          "reference-option",
          `Unknown option ${reference.id} on question ${reference.ownerId}.`,
          reference.path,
          reference.blockId,
        );

      return;
    }

    if (reference.kind === "list-item") {
      const owner = entries.get(reference.ownerId!)?.block;

      if (
        owner?.type !== "content" ||
        owner.kind !== "list" ||
        // SAFETY: owner is a structurally validated list content block, as narrowed immediately above.
        !(owner as Extract<ContentBlock, { kind: "list" }>).config?.items.some(
          (item) => item.id === reference.id,
        )
      )
        issue(
          "reference-list-item",
          `Unknown item ${reference.id} on list ${reference.ownerId}.`,
          reference.path,
          reference.blockId,
        );

      return;
    }

    const target = entries.get(reference.id);

    if (!target) {
      issue(
        "reference-missing",
        `Unknown ${reference.kind} reference: ${reference.id}.`,
        reference.path,
        reference.blockId,
      );

      return;
    }

    const expected =
      reference.kind === "answer" || reference.kind === "question"
        ? "question"
        : reference.kind === "value"
          ? "calculated"
          : reference.kind === "page"
            ? "page"
            : undefined;

    if (expected && target.block.type !== expected)
      issue(
        "reference-kind",
        `${reference.id} is not a ${expected}.`,
        reference.path,
        reference.blockId,
      );

    // Action targets and layout addresses use dedicated scope rules below.
    const actionTarget =
      reference.path.includes("actions") &&
      (reference.path.at(-1) === "target" || reference.path.includes("targets"));

    if (!actionTarget && !reference.path.includes("layout")) referenceScope(reference, target);

    if (
      reference.path[0] === "settings" &&
      (target.block.type !== "question" || target.block.kind !== "email")
    )
      issue(
        "notification-recipient",
        "Applicant notifications must reference an email question at form scope.",
        reference.path,
        reference.blockId,
      );
  };

  visitNativeReferences(form, checkReference);

  for (const { block, path } of entries.values()) {
    if (invalidModules.has(block.id)) continue;

    const visit = (reference: NativeReference) => {
      checkReference({ ...reference, path: [...path, ...reference.path], blockId: block.id });

      return reference.id;
    };

    try {
      if (block.type === "question")
        capabilities?.fields
          .find((module) => nativeCapabilityMatches(module, block))
          ?.references?.(block, visit);

      if (block.type === "content")
        capabilities?.contents
          .find((module) => nativeCapabilityMatches(module, block))
          ?.references?.(block, visit);
    } catch (error) {
      issue(
        "module-references",
        error instanceof Error ? error.message : "This module could not read its references.",
        path,
        block.id,
      );
    }
  }

  const dependencies = new Map<string, Set<string>>();

  const edge = (from: string, to: string) => {
    const edges = dependencies.get(from) ?? new Set<string>();
    edges.add(to);
    dependencies.set(from, edges);
  };

  const expressionDependencies = (expression: Expression): string[] => {
    if (typeof expression !== "object") return [];

    if ("answer" in expression) return [expression.answer];

    if ("value" in expression) return [expression.value];

    if ("context" in expression) return [];

    return [
      ...expression.args.flatMap(expressionDependencies),
      ...(expression.op === "lookup"
        ? [
            ...expression.entries.flatMap((entry) => expressionDependencies(entry.value)),
            ...expressionDependencies(expression.fallback),
          ]
        : []),
    ];
  };

  const conditionDependencies = (condition: Condition): string[] => {
    if (typeof condition === "boolean") return [];

    if (condition.op === "all" || condition.op === "any")
      return condition.conditions.flatMap(conditionDependencies);

    if (condition.op === "not") return conditionDependencies(condition.condition);

    if (condition.op === "selected") return [condition.question];

    if (condition.op === "empty") return expressionDependencies(condition.value);

    return "left" in condition
      ? [...expressionDependencies(condition.left), ...expressionDependencies(condition.right)]
      : [];
  };

  const targetId = (target: VisibilityTarget): string =>
    typeof target === "string" ? target : "question" in target ? target.question : target.list;

  const checkActionTarget = (
    action: LogicAction,
    targetId: string,
    from: BlockEntry,
    path: NativePath,
  ) => {
    const target = entries.get(targetId);

    if (!target) return;
    const type = target.block.type;

    const wanted =
      action.type === "setRequired" || action.type === "setLabel"
        ? "question"
        : action.type === "setTitle" || action.type === "goTo"
          ? "page"
          : action.type === "setValue"
            ? "calculated"
            : undefined;

    if (
      (wanted && type !== wanted) ||
      (action.type === "error" && type !== "question" && type !== "page")
    )
      issue("action-target-kind", `${action.type} cannot target ${type}.`, path, from.block.id);

    if (action.type === "setVisible" && (type === "logic" || type === "calculated"))
      issue(
        "action-target-kind",
        "Visibility targets must render respondent content.",
        path,
        from.block.id,
      );

    const repeatPageWrite =
      from.scope === "form" && type === "page" && ["setVisible", "setTitle"].includes(action.type);

    if (
      (from.scope !== target.scope && !repeatPageWrite) ||
      (from.scope !== "form" && type === "page")
    )
      issue(
        "action-scope",
        "A repeated entry can affect only its own descendants; form rules cannot fan out into entries.",
        path,
        from.block.id,
      );

    if (action.type === "goTo") {
      if (from.scope !== "form")
        issue("action-scope", "A per-entry rule cannot navigate.", path, from.block.id);

      if (target.order <= (from.page ? entries.get(from.page.id)!.order : from.order))
        issue(
          "navigation-order",
          "Conditional navigation must target a later page.",
          path,
          from.block.id,
        );

      if (target.block.type === "page" && target.block.role === "confirmation")
        issue(
          "navigation-confirmation",
          "Confirmation is reached only after successful host submission.",
          path,
          from.block.id,
        );
    }
  };

  for (const entry of entries.values()) {
    const { block, path } = entry;

    if (block.type === "question") {
      if (entry.page) edge(block.id, entry.page.id);
      const type = questionType(block);

      if (block.kind === "choice") {
        const values = block.options?.map((option) => option.value) ?? [];

        if (values.some((value) => typeof value !== typeof values[0]))
          issue(
            "option-type",
            "A choice question must use one scalar type for all option values.",
            [...path, "options"],
            block.id,
          );

        if (block.default !== undefined) {
          // SAFETY: block.kind is choice here and structural validation already checked its config discriminator.
          const multi =
            (block as Extract<QuestionBlock, { kind: "choice" }>).config?.selection === "multiple";

          if (multi !== Array.isArray(block.default))
            issue(
              "default-type",
              "The default answer must match the choice selection mode.",
              [...path, "default"],
              block.id,
            );
          const defaults = Array.isArray(block.default) ? block.default : [block.default];

          if (defaults.some((value) => !scalar(value) || !values.includes(value)))
            issue(
              "default-option",
              "The default answer must use existing submitted option values.",
              [...path, "default"],
              block.id,
            );

          if (new Set(defaults).size !== defaults.length)
            issue(
              "default-option",
              "A multiple-choice default cannot repeat an option.",
              [...path, "default"],
              block.id,
            );
        }
      } else if (
        block.default !== undefined &&
        !(
          block.kind === "date" &&
          typeof block.default === "object" &&
          !Array.isArray(block.default) &&
          block.default.context === "today"
        )
      ) {
        const actual = Array.isArray(block.default)
          ? `${typeof block.default[0]}[]`
          : typeof block.default;

        const expected = type === "date" || type === "time" ? "string" : type;

        if (
          (actual !== expected &&
            !(
              Array.isArray(block.default) &&
              block.default.length === 0 &&
              expected.endsWith("[]")
            )) ||
          (Array.isArray(block.default) &&
            block.default.some((value) => typeof value !== expected.slice(0, -2)))
        )
          issue(
            "default-type",
            `Expected a ${type} default answer.`,
            [...path, "default"],
            block.id,
          );

        if (
          (type === "date" && !isDateOnly(block.default)) ||
          (type === "time" && !isTimeOnly(block.default))
        )
          issue(
            "default-date",
            `Use a valid ${type}-only default answer.`,
            [...path, "default"],
            block.id,
          );
      }

      for (let index = 0; index < (block.validation?.length ?? 0); index++) {
        const validation = block.validation![index]!,
          at = [...path, "validation", index];

        if (validation.type === "dateAfter" || validation.type === "dateBefore") {
          const actual = expressionType(validation.value, [...at, "value"], block.id, "date");

          if (!compatible(actual, "date"))
            issue(
              "validation-type",
              "A date bound must be a date or date reference.",
              [...at, "value"],
              block.id,
            );
        }

        if (validation.type === "equals") {
          const expected = type === "date" || type === "time" ? "string" : type;

          if (typeof validation.value !== expected)
            issue(
              "validation-type",
              "An exact answer constraint must match the question's value type.",
              [...at, "value"],
              block.id,
            );
        }
      }

      for (const [min, max] of [
        ["minLength", "maxLength"],
        ["minimum", "maximum"],
        ["minAge", "maxAge"],
        ["minSelections", "maxSelections"],
        ["minFiles", "maxFiles"],
      ]) {
        const low = block.validation?.find((rule) => rule.type === min),
          high = block.validation?.find((rule) => rule.type === max);

        if (
          low &&
          high &&
          "value" in low &&
          "value" in high &&
          typeof low.value === "number" &&
          typeof high.value === "number" &&
          low.value > high.value
        )
          issue(
            "validation-bounds",
            `${min} cannot exceed ${max}.`,
            [...path, "validation"],
            block.id,
          );
      }
    }

    if (block.type === "calculated" && block.expression !== undefined) {
      const actual = expressionType(
        block.expression,
        [...path, "expression"],
        block.id,
        block.valueType,
      );

      if (!compatible(actual, block.valueType))
        issue(
          "calculated-type",
          `The expression produces ${actual}, but this value declares ${block.valueType}.`,
          [...path, "expression"],
          block.id,
        );
      expressionDependencies(block.expression).forEach((id) => edge(block.id, id));
    }

    if ((block.type === "question" || block.type === "content") && block.layout) {
      const under = block.layout.under,
        id = "block" in under ? under.block : under.question,
        target = entries.get(id);

      if (
        target &&
        (target.page?.id !== entry.page?.id ||
          target.order >= entry.order ||
          target.scope !== entry.scope ||
          (target.parent && target.parent !== entry.parent))
      )
        issue(
          "layout-order",
          "Layout must refer to an earlier anchor in the same page and repeat scope.",
          [...path, "layout", "under"],
          block.id,
        );

      if (target && "block" in under && target.block.type !== "content")
        issue(
          "layout-kind",
          "A block layout anchor must be content; use a question/option address for choices.",
          [...path, "layout", "under"],
          block.id,
        );
    }

    if (block.type === "logic")
      block.rules.forEach((rule, index) => {
        const at = [...path, "rules", index];
        conditionTypes(rule.when, [...at, "when"], block.id);
        const inputs = conditionDependencies(rule.when);
        rule.actions.forEach((action, actionIndex) => {
          const actionPath = [...at, "actions", actionIndex];

          if (capabilities?.actions && !capabilities.actions.includes(action.type))
            issue(
              "missing-module",
              `No installed module supports ${action.type}.`,
              [...actionPath, "type"],
              block.id,
            );

          if (action.type === "setVisible")
            action.targets.forEach((target, targetIndex) => {
              const id = targetId(target);
              checkActionTarget(action, id, entry, [...actionPath, "targets", targetIndex]);

              if (id === first?.id && typeof target === "string")
                issue(
                  "first-page",
                  "The first questions page must remain unconditional.",
                  [...actionPath, "targets", targetIndex],
                  block.id,
                );

              // Only whole block and input-part visibility mask effective answers; labels/hints/options are presentation.
              if (typeof target === "string" || ("part" in target && target.part === "input"))
                inputs.forEach((input) => edge(id, input));

              if (
                typeof target !== "string" &&
                "list" in target &&
                entries.get(target.list)?.block.type !== "content"
              )
                issue(
                  "action-target-kind",
                  "A list-item address must name a list block.",
                  [...actionPath, "targets", targetIndex],
                  block.id,
                );
            });
          else if ("target" in action)
            checkActionTarget(action, action.target, entry, [...actionPath, "target"]);

          if (action.type === "setValue") {
            const target = entries.get(action.target)?.block,
              actual = expressionType(
                action.value,
                [...actionPath, "value"],
                block.id,
                target?.type === "calculated" ? target.valueType : undefined,
              );

            if (target?.type === "calculated" && !compatible(actual, target.valueType))
              issue(
                "calculated-type",
                `This assignment produces ${actual}, but ${target.id} declares ${target.valueType}.`,
                [...actionPath, "value"],
                block.id,
              );
            [...inputs, ...expressionDependencies(action.value)].forEach((id) =>
              edge(action.target, id),
            );
          }
        });
      });
  }

  const visited = new Set<string>(),
    stack = new Set<string>(),
    reported = new Set<string>();

  const walk = (id: string, chain: string[]) => {
    if (stack.has(id)) {
      const cycle = [...chain.slice(chain.indexOf(id)), id],
        signature = [...new Set(cycle)].sort().join("|");

      if (!reported.has(signature)) {
        const entry = entries.get(id);
        issue(
          "dependency-cycle",
          `Cyclic effective-answer/calculation dependency: ${cycle.join(" → ")}.`,
          entry?.path ?? [],
          id,
        );
        reported.add(signature);
      }

      return;
    }

    if (visited.has(id)) return;
    stack.add(id);

    for (const dependency of dependencies.get(id) ?? []) walk(dependency, [...chain, id]);
    stack.delete(id);
    visited.add(id);
  };

  dependencies.forEach((_, id) => walk(id, []));

  return diagnostics;
}
