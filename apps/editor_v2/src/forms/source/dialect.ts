import { validateContentSyntax, sourceContentForNode, type ContentSourceHandler } from "./content";
import { sourceSlug } from "./identifiers";
import { sourceFieldForNode, type FieldSourceHandler } from "./field";
import { remapKnownSettings, remapReference, type ReferenceContext } from "../core/references";

export { remapKnownSettings, remapReference, type ReferenceContext } from "../core/references";

import type {
  Diagnostic,
  NodeState,
  SourceOption,
  SourceQuestion,
  SourceContent,
  SourceBlock,
  SourcePage,
  FormDocument,
} from "./model";

export type {
  Diagnostic,
  NodeState,
  SourceOption,
  SourceQuestion,
  SourceContent,
  SourceBlock,
  SourcePage,
  FormDocument,
} from "./model";

import type { SerializedEditorState, SerializedLexicalNode } from "lexical";
import profilesJSON from "./legacy/profiles-v1.json";
import presetDefaultsJSON from "./legacy/preset-defaults-v1.json";
import type { Settings, Setting } from "../core/settings";
import { closingWorks } from "../core/closing";
import { validatePageSettings } from "../core/pages";
import { formulaReferences } from "../core/formula";

type RawNode = { type: string; children?: RawNode[]; [key: string]: unknown };

type Profile = {
  kind: string;
  settings: Settings;
  options?: string[];
  optionValues?: Record<string, string>;
};

const presetDefaults: Record<
  string,
  { fieldId: string; label: string; optionValues?: Record<string, string> }
> = presetDefaultsJSON;

const profiles: Record<string, Profile> = Object.fromEntries(
  Object.entries(profilesJSON).map(([key, profile]) => {
    const defaults = presetDefaults[key]!;

    return [
      key,
      {
        ...profile,
        settings: {
          ...profile.settings,
          sourceFieldId: defaults.fieldId,
          sourceLabel: defaults.label,
        },
        optionValues: defaults.optionValues,
      },
    ];
  }),
);

// Version 1's automatic option-value spelling is frozen with its exceptional registry values.
function profileOptionValue(profile: Profile, label: string) {
  if (profile.optionValues && Object.hasOwn(profile.optionValues, label))
    return profile.optionValues[label]!;

  let slug = label
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  if (slug.length > 48) slug = slug.slice(0, Math.max(0, slug.lastIndexOf("-", 48)));

  return /^[0-9]/.test(slug) ? `option-${slug}` : slug;
}

export function createFormSourceDialect(
  fields: readonly FieldSourceHandler[],
  contents: readonly ContentSourceHandler[] = [],
) {
  validateContentSyntax(
    contents,
    fields.map((field) => field.kind),
  );
  const questionKinds = new Set(fields.map((field) => field.kind));
  const choices = new Set(fields.flatMap((field) => (field.choice ? [field.kind] : [])));

  const contentKinds = new Set(contents.map((content) => content.kind));
  const contentHandler = (kind: string) => contents.find((content) => content.kind === kind);

  const hintHandler = (kind?: string) =>
    contents.find(
      (content) =>
        (kind === undefined ? content.syntax.type === "paragraph" : content.kind === kind) &&
        ["paragraph", "heading"].includes(content.syntax.type),
    );

  const numeric = new Set([
    "minCharacters",
    "maxCharacters",
    "minValue",
    "maxValue",
    "minChoices",
    "maxChoices",
    "maxFileSize",
    "minFiles",
    "maxFiles",
    "step",
  ]);

  const bools = new Set([
    "required",
    "hidden",
    "disabled",
    "folded",
    "hideLabel",
    "other",
    "isDisabled",
    "hasMinCharacters",
    "hasMaxCharacters",
    "hasMinValue",
    "hasMaxValue",
    "hasMinChoices",
    "hasMaxChoices",
    "hasDefaultAnswer",
    "hasOtherOption",
  ]);

  const ordinaryAttrs = new Set([
    "fieldId",
    "width",
    "relativeDate",
    "placeholder",
    "pattern",
    "mask",
    "optionValue",
    ...numeric,
    ...bools,
  ]);

  const attributeType = (kind: string, key: string) =>
    fields.find((field) => field.kind === kind)?.attributes?.[key] ??
    (ordinaryAttrs.has(key)
      ? numeric.has(key)
        ? "number"
        : bools.has(key)
          ? "boolean"
          : "string"
      : undefined);

  function remapSettings(
    kind: string,
    settings: Settings,
    aliases: Map<string, string>,
    context: ReferenceContext,
    role: "field" | "content" = "field",
  ) {
    const common = remapKnownSettings(settings, aliases, context);

    const handler =
      role === "field"
        ? fields.find((field) => field.kind === kind)
        : contents.find((content) => content.kind === kind);

    return (
      handler?.mapReferences?.(common, (reference) =>
        reference.kind === "option"
          ? (context.optionAliases?.get(reference.value) ?? reference.value)
          : remapReference(reference.value, aliases),
      ) ?? common
    );
  }

  const formKeys = new Set([
    "formId",
    "description",
    "contactDetails",
    "departmentEmail",
    "applicantEmail",
  ]);

  const internalKeys = new Set(["field", "sourceKey", "sourceExplicit", "logicVersion"]);

  const ownOptionKeys = new Set([
    "other",
    "hidden",
    "optionValue",
    "sourceOptionValue",
    "disabled",
  ]);

  type KnownFields = { [key: string]: true | KnownFields };

  const formFields = {
    formId: true,
    description: true,
    visibility: true,
    closingDateTime: true,
    contactDetails: {
      title: true,
      telephoneNumber: true,
      email: true,
      address: { line1: true, line2: true, city: true, country: true },
    },
    applicantEmail: { question: true, subject: true },
    departmentEmail: { off: true, to: true, subject: true },
  } satisfies KnownFields;

  const hasUnknownFields = (value: unknown, fields: KnownFields): boolean => {
    if (!value || typeof value !== "object") return false;

    if (Array.isArray(value)) return true;

    return Object.entries(value).some(([key, nested]) => {
      const allowed = fields[key];

      if (!Object.hasOwn(fields, key) || allowed === undefined) return true;

      return allowed === true
        ? nested !== null && typeof nested === "object"
        : hasUnknownFields(nested, allowed);
    });
  };

  const clone = <T>(value: T): T => structuredClone(value);

  const object = (value: unknown): Settings => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};

    // SAFETY: private callers supply parsed JSON or serialized Lexical data; the check selects its object-valued settings.
    return value as Settings;
  };

  const rawState = (node: RawNode) => object(node.$);
  const settings = (node: RawNode) => object(rawState(node).settings);

  const depth = (node: RawNode) => Math.max(0, Number(rawState(node).depth ?? 0));
  const id = (node: RawNode) => String(rawState(node).id ?? "");

  const kind = (node: RawNode): string =>
    sourceFieldForNode(fields, node)?.kind ??
    sourceContentForNode(contents, node)?.kind ??
    (node.type === "widget"
      ? String(node.widget ?? "page-break")
      : node.type === "heading"
        ? String(node.tag)
        : node.type === "question"
          ? "title"
          : node.type);

  const isAnswer = (node: RawNode) => !!sourceFieldForNode(fields, node);

  const plain = (node: RawNode): string =>
    typeof node.text === "string"
      ? node.text
      : node.type === "linebreak"
        ? "\n"
        : (node.children ?? []).map(plain).join("");

  const nonempty = (value: object) => Object.keys(value).length > 0;

  const unique = (base: string, used: Set<string>) => {
    let key = base,
      n = 2;

    while (used.has(key)) key = `${base}-${n++}`;
    used.add(key);

    return key;
  };

  const sourceKeyOK = (key: string) => /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(key);
  const esc = (text: string) => text.replace(/[\\`*_~[\]{}<>#!:|]/g, "\\$&");

  const attr = (name: string, value: Setting) =>
    value === true ? name : `${name}=${JSON.stringify(String(value))}`;

  const attributes = (entries: [string, Setting][], key?: string) =>
    entries.length || key
      ? `{${[...(key ? [`#${key}`] : []), ...entries.map(([name, value]) => attr(name, value))].join(" ")}}`
      : "";

  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

  function inlineFrom(nodes: RawNode[], aliases: Map<string, string>): string {
    return nodes
      .map((node) => {
        if (node.type === "linebreak") return "\\\n";

        if (node.type === "link" || node.type === "autolink") {
          const props = Object.fromEntries(
            Object.entries(node).filter(
              ([k, v]) =>
                ![
                  "type",
                  "version",
                  "children",
                  "format",
                  "indent",
                  "direction",
                  "url",
                  "target",
                  "rel",
                  "title",
                ].includes(k) && v !== undefined,
            ),
          );

          if (nonempty(props) || node.type === "autolink")
            throw new Error(`Unsupported inline ${node.type} properties`);
          const children = inlineFrom(node.children ?? [], aliases);

          const extras = Object.fromEntries(
            ["target", "rel", "title", "format", "indent", "direction"].flatMap((key) => {
              const value = node[key];

              return value !== undefined && value !== null && value !== "" && value !== 0
                ? [[key, value]]
                : [];
            }),
          );

          const link = `[${children}](${encodeURI(String(node.url)).replace(/[()]/g, (c) => (c === "(" ? "%28" : "%29"))})`;

          return nonempty(extras)
            ? `:link[${children}]{url=${JSON.stringify(String(node.url))} props=${JSON.stringify(JSON.stringify(extras))}}`
            : link;
        }

        if (node.type !== "text" && node.type !== "mention")
          throw new Error(`Unsupported inline node: ${node.type}`);

        const allowed = [
          "type",
          "version",
          "text",
          "format",
          "style",
          "detail",
          "mode",
          "field",
          "defaultValue",
          "$",
          "variants",
        ];

        for (const key of Object.keys(node))
          if (!allowed.includes(key)) throw new Error(`Unsupported inline property: ${key}`);

        let text =
          node.type === "mention"
            ? `{{${remapReference(String(node.field), aliases)}${node.defaultValue ? `|${encodeURIComponent(String(node.defaultValue))}` : ""}}}`
            : esc(String(node.text ?? ""));

        const format = Number(node.format ?? 0);
        const state = object(node.$);

        const extras: Settings = {};

        if (node.style) extras.style = String(node.style);

        if (node.detail) extras.detail = Number(node.detail);

        if (node.mode && node.mode !== (node.type === "mention" ? "token" : "normal"))
          extras.mode = String(node.mode);

        if (nonempty(state)) extras.state = state;

        if (node.variants !== undefined) {
          // SAFETY: variants originate in serialized Lexical JSON and are retained unchanged for source recovery.
          extras.variants = node.variants as Setting;
        }

        if (
          format & ~19 ||
          nonempty(extras) ||
          (format & 16 && (node.type === "mention" || format & ~16))
        )
          return `:span[${text}]{data=${JSON.stringify(JSON.stringify({ format, ...extras }))}}`;

        if (format & 16) {
          const raw = String(node.text ?? "");

          const fence = "`".repeat(
            Math.max(0, ...Array.from(raw.matchAll(/`+/g), (m) => m[0].length)) + 1,
          );

          text = `${fence}${raw.startsWith("`") || raw.endsWith("`") || /^ .* $/.test(raw) ? " " : ""}${raw}${raw.startsWith("`") || raw.endsWith("`") || /^ .* $/.test(raw) ? " " : ""}${fence}`;
        }

        if (format & 2) text = `*${text}*`;

        if (format & 1) text = `**${text}**`;

        return text;
      })
      .join("");
  }

  /** The semantic model has no Lexical session keys, selection or repeated body text. */
  function fromEditor(state: SerializedEditorState): FormDocument {
    // SAFETY: Lexical serialized nodes have string type tags and recursively serialized children; RawNode retains their extension properties.
    const flat = clone(state.root.children) as RawNode[];

    for (const node of flat)
      if (
        node.type === "form-title" ||
        (node.type === "widget" && (node.widget ?? "page-break") === "page-break")
      ) {
        const invalid = validatePageSettings(rawState(node).settings);

        if (invalid) throw new Error(invalid);
      }

    // The readable dialect nests options and disclosures. Native layout also permits
    // ordinary blocks and answer inputs as hosts; retain that depth on those nodes.
    const flattenedHosts: number[] = [];

    for (const [index, node] of flat.entries()) {
      const originalDepth = depth(node);

      while (flattenedHosts.length && flattenedHosts.at(-1)! >= originalDepth) flattenedHosts.pop();
      const sourceDepth = originalDepth - flattenedHosts.length;
      const native = object(rawState(node).native);

      if (sourceDepth !== originalDepth)
        node.$ = { ...rawState(node), depth: sourceDepth, nativeSourceDepth: originalDepth };
      const next = flat[index + 1];
      const syntax = sourceContentForNode(contents, node)?.syntax;

      if (
        nonempty(native) &&
        next &&
        depth(next) > originalDepth &&
        node.type !== "option" &&
        syntax?.type !== "list" &&
        !(syntax?.type === "directive" && syntax.nested)
      )
        flattenedHosts.push(originalDepth);
    }

    const title = flat[0];

    if (!title || title.type !== "form-title")
      throw new Error("Start the document with a service name");
    const version = settings(title).logicVersion;

    if (version !== undefined && version !== 1 && version !== 2)
      throw new Error("This editor cannot preserve the saved logic version");

    const checkVersion = (node: RawNode) => {
      if (node !== title && settings(node).logicVersion !== undefined)
        throw new Error("Only the service name block can store the logic version");

      if (version === 2) rejectLegacyConditions(settings(node));
      node.children?.forEach(checkVersion);
    };

    flat.forEach(checkVersion);

    const aliases = new Map<string, string>(),
      used = new Set<string>();

    const choiceFields = new Set(
      flat
        .filter(
          (n) =>
            !!(
              sourceFieldForNode(fields, n)?.choice ||
              sourceFieldForNode(fields, n)?.referencesOptions
            ),
        )
        .map((n) => String(settings(n).field ?? id(n))),
    );

    const optionAliases = new Map<string, string>();
    const context: ReferenceContext = { choiceFields, optionAliases };

    for (let i = 0; i < flat.length; i++) {
      const node = flat[i]!;

      if (!isAnswer(node)) continue;
      const field = String(settings(node).field ?? id(node));

      if (aliases.has(field)) continue;
      let label = "";

      for (let j = i - 1; j >= 0 && depth(flat[j]!) === depth(node); j--) {
        const before = flat[j]!;

        if (before.type === "question") {
          label = plain(before);
          break;
        }

        if (!["paragraph", "heading"].includes(before.type)) break;
      }

      const stored = settings(node).sourceKey;

      const safe =
        typeof stored === "string" && sourceKeyOK(stored)
          ? stored
          : sourceKeyOK(field) && !/^[\da-f]{8}-[\da-f-]{27}$/i.test(field)
            ? field
            : sourceSlug(label || `${kind(node)}-question`);

      aliases.set(field, unique(safe, used));
    }

    // Unknown authoring state may contain opaque identity dependencies. Preserve identities conservatively.
    const opaqueState = (node: RawNode): boolean =>
      Object.keys(rawState(node)).some(
        (key) => !["settings", "depth", "id", "sourceAnchor", "index", "listIndex"].includes(key),
      ) || (node.children ?? []).some(opaqueState);

    const opaque = flat.some(
      (node) =>
        opaqueState(node) ||
        hasUnknownFields(settings(node).formSettings, formFields) ||
        Object.keys(settings(node)).some(
          (k) =>
            ![
              ...ordinaryAttrs,
              ...Object.keys(sourceFieldForNode(fields, node)?.attributes ?? {}),
              ...internalKeys,
              ...ownOptionKeys,
              "ref",
              "sourceFieldId",
              "sourceLabel",
              "sourcePreset",
              "errors",
              "fieldArray",
              "repeatable",
              "button",
              "backButton",
              "pageId",
              "pageType",
              "confirmation",
              "formSettings",
              "sourceUnknown",
              "sourceNode",
              "sourceExplicit",
              "name",
              "conditionals",
              "actions",
              "logicalOperator",
              "calculatedFields",
              "allowedFiles",
              "groups",
              "conditionalTitle",
              "conditionalLabel",
              "defaultAnswer",
              "fieldType",
              "value",
              "minDate",
              "maxDate",
              "minTime",
              "maxTime",
              "hasMinDate",
              "hasMaxDate",
              "hasMinTime",
              "hasMaxTime",
              "hasMaxFileSize",
              "hasMinFiles",
              "hasMaxFiles",
              "multiple",
              "accept",
            ].includes(k),
        ),
    );

    const refs = new Set<string>();

    const collectRefs = (node: RawNode) => {
      if (node.type === "mention" && typeof node.field === "string") refs.add(node.field);

      for (const child of node.children ?? []) collectRefs(child);
    };

    for (const node of flat) {
      collectRefs(node);
      const s = settings(node);
      (sourceFieldForNode(fields, node) ?? sourceContentForNode(contents, node))?.mapReferences?.(
        s,
        (reference) => {
          refs.add(reference.value);

          return reference.value;
        },
      );

      for (const key of ["conditionalTitle", "conditionalLabel"]) {
        const rows = s[key];

        if (Array.isArray(rows))
          for (const row of rows) {
            if (!row || typeof row !== "object" || Array.isArray(row)) continue;

            if (typeof row.field === "string") refs.add(row.field);
            const value = object(row.value);

            if (typeof value.option === "string") refs.add(value.option);

            if (Array.isArray(value.options))
              for (const option of value.options) if (typeof option === "string") refs.add(option);
          }
      }

      if (
        node.type === "widget" &&
        ["conditional-logic", "calculated-fields"].includes(String(node.widget ?? "page-break"))
      ) {
        const collect = (value: unknown, key = "") => {
          if (
            typeof value === "string" &&
            ["field", "jumpToPage", "requireAnswer", "showBlocks", "hideBlocks"].includes(key)
          )
            refs.add(value);
          else if (Array.isArray(value)) value.forEach((v) => collect(v, key));
          else if (value && typeof value === "object")
            Object.entries(value).forEach(([k, v]) => collect(v, k));

          if (key === "expression" && typeof value === "string")
            for (const { field } of formulaReferences(value)) refs.add(field);
        };

        collect(s);

        if (Array.isArray(s.actions))
          for (const action of s.actions) {
            if (!action || typeof action !== "object" || Array.isArray(action)) continue;

            for (const name of ["changeLabel", "changePageTitle"]) {
              const value = action[name];

              if (
                value &&
                typeof value === "object" &&
                !Array.isArray(value) &&
                typeof value.target === "string"
              )
                refs.add(value.target);
            }
          }

        const choiceValues = (rows: Setting | undefined) => {
          if (!Array.isArray(rows)) return;

          for (const row of rows) {
            if (!row || typeof row !== "object" || Array.isArray(row)) continue;

            if (
              row.valueIsLiteral !== true &&
              typeof row.field === "string" &&
              choiceFields.has(row.field)
            )
              for (const value of Array.isArray(row.value) ? row.value : [row.value])
                if (typeof value === "string") refs.add(value);
            choiceValues(row.conditionals);
          }
        };

        choiceValues(s.conditionals);
      }
    }

    const needsId = (node: RawNode) =>
      !!rawState(node).sourceAnchor ||
      opaque ||
      refs.has(id(node)) ||
      [...refs].some((key) => key.startsWith(`${id(node)}:`));

    const blockKeys = new Map<RawNode, string>();

    for (const node of flat)
      if (
        needsId(node) ||
        (node.type === "widget" &&
          ["conditional-logic", "calculated-fields"].includes(String(node.widget ?? "page-break")))
      ) {
        const existing = rawState(node).sourceAnchor;

        const key =
          typeof existing === "string" && sourceKeyOK(existing)
            ? unique(existing, used)
            : unique(
                sourceSlug(
                  plain(node) ||
                    sourceContentForNode(contents, node)?.storage.value ||
                    kind(node) ||
                    "block",
                ),
                used,
              );

        blockKeys.set(node, key);

        if (node.type === "option") optionAliases.set(id(node), key);

        if (id(node) && !aliases.has(id(node))) aliases.set(id(node), key);
      }

    for (let i = 0; i < flat.length; i++) {
      const answer = flat[i]!;

      if (!isAnswer(answer)) continue;

      const field = String(settings(answer).field ?? id(answer)),
        key = aliases.get(field)!;

      if (answer.type !== "option" && id(answer) && id(answer) !== field)
        aliases.set(id(answer), `${key}:answer`);
      let j = i - 1;

      while (
        j >= 0 &&
        depth(flat[j]!) === depth(answer) &&
        ["paragraph", "heading"].includes(flat[j]!.type)
      )
        j--;

      if (j >= 0 && flat[j]!.type === "question" && depth(flat[j]!) === depth(answer)) {
        if (id(flat[j]!)) aliases.set(id(flat[j]!), `${key}:label`);

        for (let h = j + 1; h < i; h++)
          if (id(flat[h]!)) aliases.set(id(flat[h]!), `${key}:hint-${h - j}`);
      }
    }

    const meta = (node: RawNode, omitSettings: string[] = []): NodeState | undefined => {
      const s = Object.fromEntries(
        Object.entries(settings(node)).filter(
          ([key]) => !internalKeys.has(key) && !omitSettings.includes(key),
        ),
      );

      const state = Object.fromEntries(
        Object.entries(rawState(node)).filter(
          ([key]) =>
            !["settings", "depth", "id", "sourceAnchor", "index", "listIndex"].includes(key),
        ),
      );

      // SAFETY: these are non-undefined properties from serialized Lexical JSON, retaining unknown extension values without interpreting them.
      const props = Object.fromEntries(
        Object.entries(node).filter(
          ([key, value]) =>
            value !== undefined &&
            !["children", "type", "version", "kind", "widget", "tag", "$"].includes(key) &&
            !(key === "format" && value === "") &&
            !(key === "indent" && value === 0) &&
            !(key === "direction" && value === null) &&
            !(
              key === "textFormat" &&
              (value === 0 ||
                node.children?.some((child) => ["text", "mention"].includes(child.type)))
            ) &&
            !(
              key === "textStyle" &&
              (value === "" ||
                node.children?.some((child) => ["text", "mention"].includes(child.type)))
            ),
        ),
      ) as Settings;

      const result: NodeState = {};

      if (nonempty(s))
        result.settings = remapSettings(
          kind(node),
          s,
          aliases,
          context,
          isAnswer(node) ? "field" : "content",
        );

      if (nonempty(props)) result.properties = props;

      if (nonempty(state)) result.state = state;

      if (opaque && id(node)) result.identity = id(node);

      return nonempty(result) ? result : undefined;
    };

    const content = (node: RawNode): SourceContent => {
      const handler = sourceContentForNode(contents, node);
      const k = handler?.kind ?? kind(node);

      if (!contentKinds.has(k))
        throw new Error(`Unsupported block: ${k}. The saved record is unchanged.`);

      const block: SourceContent = {
        type: "content",
        kind: k,
        text: inlineFrom(node.children ?? [], aliases),
      };

      if (blockKeys.has(node)) block.key = blockKeys.get(node);
      const metadata = meta(node);

      if (metadata) block.node = metadata;

      return handler?.fromNode?.(node, block) ?? block;
    };

    const parseBlocks = (nodes: RawNode[], level: number): SourceBlock[] => {
      const result: SourceBlock[] = [];

      for (let i = 0; i < nodes.length;) {
        const current = nodes[i]!;

        if (depth(current) !== level)
          throw new Error(`Unsupported nesting at ${plain(current) || kind(current)}`);
        let answerAt = i;

        if (current.type === "question") {
          answerAt++;

          while (
            answerAt < nodes.length &&
            depth(nodes[answerAt]!) === level &&
            ["paragraph", "heading"].includes(nodes[answerAt]!.type)
          )
            answerAt++;
        }

        if (
          (isAnswer(current) || current.type === "question") &&
          nodes[answerAt] &&
          isAnswer(nodes[answerAt]!) &&
          depth(nodes[answerAt]!) === level
        ) {
          const answer = nodes[answerAt]!,
            field = String(settings(answer).field ?? id(answer));

          const key = aliases.get(field)!;

          const q: SourceQuestion = {
            type: "question",
            key,
            kind: kind(answer),
            hints: nodes.slice(i + 1, answerAt).map(content),
            settings: Object.fromEntries(
              Object.entries(settings(answer)).filter(
                ([k]) =>
                  !internalKeys.has(k) && !(answer.type === "option" && ownOptionKeys.has(k)),
              ),
            ),
          };

          if (current.type === "question") {
            q.label = inlineFrom(current.children ?? [], aliases);
            q.labelNode = meta(current);

            if (id(current)) aliases.set(id(current), `${key}:label`);
          }

          q.answerNode = meta(answer, Object.keys(q.settings));

          if (id(answer) && !aliases.has(id(answer))) aliases.set(id(answer), `${key}:answer`);

          if (opaque && field) q.identity = field;

          const explicit = settings(answer).sourceExplicit;

          if (Array.isArray(explicit))
            q.explicit = explicit.filter((value): value is string => typeof value === "string");
          i = answerAt + 1;

          if (answer.type === "option") {
            q.options = [];
            let option = answer;

            for (;;) {
              const start = i;

              while (i < nodes.length && depth(nodes[i]!) > level) i++;
              const own = meta(option, Object.keys(q.settings));

              const sourceOption: SourceOption = {
                text: inlineFrom(option.children ?? [], aliases),
                blocks: parseBlocks(nodes.slice(start, i), level + 1),
              };

              if (blockKeys.has(option)) sourceOption.key = blockKeys.get(option);

              if (own) sourceOption.node = own;
              q.options.push(sourceOption);
              const next = nodes[i];

              if (!next || next.type !== "option" || kind(next) !== q.kind || depth(next) !== level)
                break;
              option = next;
              i++;
            }

            q.answerNode = undefined;
          } else if (answer.children?.length)
            throw new Error(`An input contains unsupported editable text: ${key}`);
          result.push(fields.find((field) => field.kind === q.kind)?.fromNode?.(answer, q) ?? q);
        } else {
          const block = content(current);
          i++;
          const start = i;

          while (i < nodes.length && depth(nodes[i]!) > level) i++;

          if (i > start) {
            const syntax = contentHandler(block.kind)?.syntax;

            if (syntax?.type !== "list" && !(syntax?.type === "directive" && syntax.nested))
              throw new Error(`Unsupported nested content under ${block.kind}`);
            block.blocks = parseBlocks(nodes.slice(start, i), level + 1);
          }

          result.push(block);
        }
      }

      return result;
    };

    const document: FormDocument = {
      formatVersion: settings(title).logicVersion === 2 ? 2 : 1,
      title: inlineFrom(title.children ?? [], aliases),
      settings: clone(object(settings(title).formSettings)),
      unknown: clone(object(settings(title).sourceUnknown)),
      pages: [],
    };

    let start = title,
      pageNodes: RawNode[] = [];

    const finish = () => {
      const s = settings(start),
        type =
          s.confirmation === true
            ? "confirmation"
            : ["check-answers", "declaration", "result"].includes(String(s.pageType))
              ? String(s.pageType)
              : "questions";

      const nativePage = object(object(rawState(start).native).page);
      const head = pageNodes[0]?.type === "page-title" ? pageNodes.shift() : undefined;
      const description = pageNodes[0]?.type === "page-description" ? pageNodes.shift() : undefined;

      if (["questions", "confirmation"].includes(type) && !head)
        throw new Error("Migrate the page headings before saving Markdown");

      const pageSettings = Object.fromEntries(
        Object.entries(s).filter(
          ([k]) =>
            ![
              "formSettings",
              "sourceUnknown",
              "pageType",
              "confirmation",
              "name",
              "sourceKey",
              "sourceExplicit",
              "logicVersion",
            ].includes(k),
        ),
      );

      const page: SourcePage = {
        type,
        title: nonempty(nativePage)
          ? inlineFrom(head?.children ?? [], aliases)
          : type === "check-answers"
            ? "Check your answers"
            : type === "declaration"
              ? "Declaration"
              : inlineFrom(head?.children ?? [], aliases),
        settings: pageSettings,
        startNode: meta(start, Object.keys(s)),
        titleNode: head ? meta(head) : undefined,
        descriptionNode: description ? meta(description) : undefined,
        blocks: parseBlocks(pageNodes, 0),
      };

      if (description) page.description = inlineFrom(description.children ?? [], aliases);

      if (blockKeys.has(start)) page.key = blockKeys.get(start);
      document.pages.push(page);
      pageNodes = [];
    };

    for (const node of flat.slice(1)) {
      if (node.type === "widget" && (node.widget ?? "page-break") === "page-break") {
        finish();
        start = node;
      } else pageNodes.push(node);
    }

    finish();

    // References are translated after all semantic subtargets have been assigned.
    const rewriteBlocks = (blocks: SourceBlock[]) =>
      blocks.forEach((block) => {
        if (block.type === "question") {
          block.settings = remapSettings(block.kind, block.settings, aliases, context);
          rewriteBlocks(block.hints);
          block.options?.forEach((option) => rewriteBlocks(option.blocks));
        } else {
          if (block.node?.settings)
            block.node.settings = remapSettings(
              block.kind,
              block.node.settings,
              aliases,
              context,
              "content",
            );

          if (block.blocks) rewriteBlocks(block.blocks);
        }
      });

    document.settings = remapKnownSettings(document.settings, aliases, context);
    document.pages.forEach((page) => rewriteBlocks(page.blocks));

    return document;
  }

  type Extension = {
    form?: Settings;
    pages?: Record<
      string,
      { settings?: Settings; start?: NodeState; title?: NodeState; description?: NodeState }
    >;
    questions?: Record<
      string,
      {
        settings?: Settings;
        removeSettings?: string[];
        explicit?: string[];
        identity?: string;
        label?: NodeState;
        answer?: NodeState;
      }
    >;
    nodes?: Record<string, NodeState>;
  };

  const cleanMeta = (meta?: NodeState): NodeState | undefined =>
    meta &&
    Object.values(meta).some(
      (v) => v !== undefined && (typeof v !== "object" || Object.keys(v).length),
    )
      ? meta
      : undefined;

  const jsonFence = (value: unknown) => `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;

  const quoteFront = (value: Setting) =>
    typeof value === "string" ? JSON.stringify(value) : JSON.stringify(value);

  const frontLines = (value: Settings, indent = ""): string[] =>
    Object.entries(value).flatMap(([key, val]) =>
      val &&
      typeof val === "object" &&
      !Array.isArray(val) &&
      Object.keys(val).every((key) => /^[A-Za-z][\w-]*$/.test(key))
        ? [`${indent}${key}:`, ...frontLines(val, `${indent}  `)]
        : [`${indent}${key}: ${quoteFront(val)}`],
    );

  const inlineAt = (text: string, indent: string) => text.replaceAll("\n", `\n${indent}`);

  /** Pure, deterministic serialization; IDs are assigned by the adapter/Apply, never here. */
  function writeMarkdown(document: FormDocument): string {
    const ext: Extension = { pages: {}, questions: {}, nodes: {} };

    const front: Settings = {
      format: "govbb-form",
      formatVersion: document.formatVersion,
      title: document.title,
    };

    for (const key of formKeys)
      if (document.settings[key] !== undefined) front[key] = document.settings[key]!;
    front.meta = { visibility: document.settings.visibility ?? "preview" };

    if (document.settings.closingDateTime !== undefined)
      front.meta.closingDateTime = document.settings.closingDateTime;
    Object.assign(front, document.unknown, {
      meta: { ...object(front.meta), ...object(document.unknown.meta) },
    });

    const rawForm = Object.fromEntries(
      Object.entries(document.settings).filter(
        ([key]) => !formKeys.has(key) && !["visibility", "closingDateTime"].includes(key),
      ),
    );

    if (nonempty(rawForm)) ext.form = rawForm;

    const emitContent = (blocks: SourceBlock[], path: string, indent = ""): string =>
      blocks
        .map((block, index) => {
          const at = `${path}/${index + 1}`;

          if (block.type === "question") {
            const ref = typeof block.settings.ref === "string" ? block.settings.ref.slice(11) : "";
            const profile = profiles[ref]?.kind === block.kind ? profiles[ref] : undefined;
            const explicit = new Set(block.explicit ?? []);

            const values = Object.fromEntries(
              Object.entries(block.settings).filter(
                ([key, value]) =>
                  !profile || !same(value, profile.settings[key]) || explicit.has(key),
              ),
            );

            const attrs: [string, Setting][] = profile ? [["preset", ref]] : [];
            const extra: Settings = {};

            for (const [key, value] of Object.entries(values)) {
              if (profile && key === "ref") continue;

              if (attributeType(block.kind, key) === typeof value) attrs.push([key, value]);
              else if (
                key === "fieldArray" &&
                value &&
                typeof value === "object" &&
                !Array.isArray(value) &&
                Object.keys(value).every((k) => ["min", "max"].includes(k)) &&
                Object.values(value).every((v) => typeof v === "number")
              ) {
                if (!Object.keys(value).length) attrs.push(["repeat", true]);

                if (value.min !== undefined) attrs.push(["repeatMin", value.min]);

                if (value.max !== undefined) attrs.push(["repeatMax", value.max]);
              } else if (key !== "errors") extra[key] = value;
            }

            const lines = [
              `${indent}::${block.kind}${block.label !== undefined ? `[${inlineAt(block.label, indent)}]` : ""}${attributes(attrs, block.key)}`,
            ];

            block.hints.forEach((hint, i) => {
              if (hint.type !== "content" || hint.blocks?.length)
                throw new Error("A hint must be an inline text block");
              lines.push(
                `${indent}::hint[${inlineAt(hint.text, indent)}]${contentHandler(hint.kind)?.syntax.type !== "paragraph" ? attributes([["kind", hint.kind]]) : ""}`,
              );

              if (cleanMeta(hint.node)) ext.nodes![`${block.key}:hint-${i + 1}`] = hint.node!;
            });
            const errors = values.errors;

            if (
              errors &&
              typeof errors === "object" &&
              !Array.isArray(errors) &&
              Object.values(errors).every((value) => typeof value === "string")
            ) {
              for (const [rule, message] of Object.entries(errors))
                lines.push(
                  `${indent}::error${attributes([
                    ["rule", rule],
                    ["message", message],
                  ])}`,
                );
            } else if (errors !== undefined) extra.errors = errors;

            if (block.options)
              for (let i = 0; i < block.options.length; i++) {
                const option = block.options[i]!,
                  optionSettings = option.node?.settings ?? {};

                const oa: [string, Setting][] = [];
                const extraSettings: Settings = {};

                for (const [key, value] of Object.entries(optionSettings)) {
                  if (
                    key === "sourceOptionValue" &&
                    profile?.options?.includes(
                      plain({ type: "option", children: inlineTo(option.text) }),
                    ) &&
                    value ===
                      profileOptionValue(
                        profile,
                        plain({ type: "option", children: inlineTo(option.text) }),
                      )
                  )
                    continue;

                  if (
                    ownOptionKeys.has(key) &&
                    typeof value ===
                      (["optionValue", "sourceOptionValue"].includes(key) ? "string" : "boolean")
                  )
                    oa.push([key, value]);
                  else extraSettings[key] = value;
                }

                const label =
                  option.key || oa.length
                    ? `:option[${option.text}]${attributes(oa, option.key)}`
                    : option.text;

                lines.push(`${indent}- ${inlineAt(label, `${indent}  `)}`);

                if (option.blocks.length)
                  lines.push(
                    "",
                    emitContent(option.blocks, `${block.key}:option-${i + 1}`, `${indent}  `),
                    "",
                  );

                const node = {
                  ...option.node,
                  settings: nonempty(extraSettings) ? extraSettings : undefined,
                };

                if (cleanMeta(node))
                  ext.nodes![option.key ?? `${block.key}:option-${i + 1}`] = node;
              }

            const removed = profile
              ? Object.keys(profile.settings).filter((key) => !Object.hasOwn(block.settings, key))
              : [];

            // The parser records preset overrides. Emit that bookkeeping on the first write too,
            // so a new copied preset's source does not gain metadata only after its first reload.
            const writtenExplicit = profile
              ? [
                  ...new Set([
                    ...(block.explicit ?? []),
                    ...attrs.flatMap(([name]) =>
                      ["preset", "repeat", "repeatMin", "repeatMax"].includes(name) ? [] : [name],
                    ),
                  ]),
                ]
              : block.explicit;

            const q: NonNullable<Extension["questions"]>[string] = {};

            if (nonempty(extra)) q.settings = extra;

            if (removed.length) q.removeSettings = removed;

            if (writtenExplicit?.length) q.explicit = writtenExplicit;

            if (block.identity) q.identity = block.identity;

            if (cleanMeta(block.labelNode)) q.label = block.labelNode;

            if (cleanMeta(block.answerNode)) q.answer = block.answerNode;

            if (nonempty(q)) ext.questions![block.key] = q;

            return lines.join("\n").replace(/\n+$/, "");
          }

          const lines: string[] = [];
          const syntax = contentHandler(block.kind)?.syntax;

          if (!syntax) throw new Error(`Unsupported block: ${block.kind}`);

          if (
            block.key &&
            syntax.type !== "json" &&
            !(syntax.type === "directive" && syntax.nested)
          )
            lines.push(`${indent}::block${attributes([], block.key)}`);
          const node = clone(block.node ?? {});

          if (syntax.type === "json") {
            lines.push(
              `${indent}:::${syntax.name}${attributes([], block.key)}`,
              ...jsonFence(node.settings ?? {})
                .split("\n")
                .map((line) => indent + line),
              `${indent}:::`,
            );
            delete node.settings;
          } else if (syntax.type === "directive" && syntax.nested) {
            lines.push(
              `${indent}:::${syntax.name}[${inlineAt(block.text, indent)}]${attributes([], block.key)}`,
              "",
              emitContent(block.blocks ?? [], at, indent),
              "",
              `${indent}:::`,
            );
          } else if (syntax.type === "directive")
            lines.push(`${indent}::${syntax.name}[${inlineAt(block.text, indent)}]`);
          else if (syntax.type === "heading")
            lines.push(
              syntax.level === 1 || block.text.includes("\n")
                ? `${indent}::heading[${inlineAt(block.text, indent)}]{level="${syntax.level}"}`
                : `${indent}${"#".repeat(syntax.level)} ${block.text}`,
            );
          else if (syntax.type === "list") {
            const marker = syntax.ordered ? "1. " : "- ";
            lines.push(
              `${indent}${marker}${inlineAt(block.text, indent + " ".repeat(marker.length))}`,
            );

            if (block.blocks?.length) lines.push("", emitContent(block.blocks, at, `${indent}  `));
          } else if (syntax.type === "paragraph")
            lines.push(
              !block.text
                ? `${indent}::empty`
                : /^\s/.test(block.text) || block.text.includes("\n")
                  ? `${indent}::paragraph[${inlineAt(block.text, indent)}]`
                  : `${indent}${block.text.replace(/^(---$|- |\d+\. |~~~|>)/gm, "\\$1")}`,
            );

          if (cleanMeta(node)) ext.nodes![block.key ?? at] = node;

          return lines.join("\n");
        })
        .join("\n\n");

    const pages = document.pages.map((page, index) => {
      const at = page.key ?? `page-${index + 1}`;
      const lines = [`#${page.title ? ` ${page.title}` : ""}`];
      const ps = { ...page.settings };
      const attrs: [string, Setting][] = page.type === "questions" ? [] : [["type", page.type]];

      for (const key of ["pageId", "button", "backButton", "hidden", "folded"])
        if (["string", "boolean"].includes(typeof ps[key])) {
          attrs.push([key, ps[key]!]);
          delete ps[key];
        }

      if (attrs.length || page.key) lines.push(`::page${attributes(attrs, page.key)}`);

      if (page.description !== undefined) lines.push(`::description[${page.description}]`);
      const repeat = ps.repeatable;

      if (
        repeat &&
        typeof repeat === "object" &&
        !Array.isArray(repeat) &&
        Object.entries(repeat).every(
          ([key, value]) =>
            ["min", "max", "instanceLabel"].includes(key) &&
            ["number", "string"].includes(typeof value),
        )
      ) {
        lines.push(`::repeat-page${attributes(Object.entries(repeat))}`);
        delete ps.repeatable;
      }

      const extra: NonNullable<Extension["pages"]>[string] = {};

      if (nonempty(ps)) extra.settings = ps;

      if (cleanMeta(page.startNode)) extra.start = page.startNode;

      if (cleanMeta(page.titleNode)) extra.title = page.titleNode;

      if (cleanMeta(page.descriptionNode)) extra.description = page.descriptionNode;

      if (nonempty(extra)) ext.pages![at] = extra;
      const body = emitContent(page.blocks, at);

      if (body) lines.push(body);

      return lines.join("\n\n");
    });

    for (const key of ["pages", "questions", "nodes"] as const)
      if (!Object.keys(ext[key]!).length) delete ext[key];

    return `---\n${frontLines(front).join("\n")}\n---\n\n${pages.join("\n\n---\n\n")}${nonempty(ext) ? `\n\n:::source-state\n${jsonFence(ext)}\n:::` : ""}\n`;
  }

  class SourceError extends Error {
    constructor(
      message: string,
      readonly line: number,
      readonly column = 1,
      readonly code = "syntax",
    ) {
      super(message);
    }
  }

  function safeJSON(text: string, line: number): Setting {
    let value: unknown;

    try {
      value = JSON.parse(text);
    } catch {
      throw new SourceError("Enter valid JSON", line, 1, "invalid-json");
    }

    const objects: (Set<string> | null)[] = [];

    for (let i = 0; i < text.length; i++) {
      if (text[i] === "{") objects.push(new Set());
      else if (text[i] === "[") objects.push(null);
      else if (text[i] === "}" || text[i] === "]") objects.pop();
      else if (text[i] === '"') {
        const start = i++;

        while (i < text.length && text[i] !== '"') {
          if (text[i] === "\\") i++;
          i++;
        }

        const after = text.slice(i + 1).match(/^\s*(.)/)?.[1];

        if (after === ":") {
          // SAFETY: the scanner starts at a quote and ends at its matching quote within already parsed JSON.
          const key = JSON.parse(text.slice(start, i + 1)) as string,
            keys = objects.at(-1);

          if (keys?.has(key))
            throw new SourceError(
              `Duplicate JSON key: ${key}`,
              line + text.slice(0, start).split("\n").length - 1,
              1,
              "duplicate-key",
            );
          keys?.add(key);
        }
      }
    }

    const check = (v: unknown, d: number) => {
      if (d > 40) throw new SourceError("JSON nesting exceeds 40 levels", line, 1, "size-limit");

      if (v && typeof v === "object")
        for (const [k, nested] of Object.entries(v)) {
          if (["__proto__", "prototype", "constructor"].includes(k))
            throw new SourceError(`Unsupported object key: ${k}`, line);
          check(nested, d + 1);
        }
    };

    check(value, 0);

    // SAFETY: JSON.parse supplied only JSON values; the checks above additionally reject excessive depth and unsafe object keys.
    return value as Setting;
  }

  function parseFront(lines: string[], start: number, end: number): Settings {
    const root: Settings = {},
      stack: { depth: number; value: Settings }[] = [{ depth: -2, value: root }];

    for (let i = start; i < end; i++) {
      const line = lines[i]!;

      if (!line.trim() || /^\s*#/.test(line)) continue;
      const match = line.match(/^( *)([A-Za-z][\w-]*):(?: +(.*))?$/);

      if (!match || match[1]!.length % 2)
        throw new SourceError(
          "Use key: value frontmatter with two-space map indentation",
          i + 1,
          1,
          "frontmatter",
        );

      const depth = match[1]!.length,
        key = match[2]!,
        raw = match[3];

      if (["constructor", "prototype", "__proto__"].includes(key))
        throw new SourceError("Unsupported frontmatter key", i + 1);

      while (stack.at(-1)!.depth >= depth) stack.pop();
      const parent = stack.at(-1)!;

      if (depth !== parent.depth + 2)
        throw new SourceError("Unexpected frontmatter indentation", i + 1);

      if (Object.hasOwn(parent.value, key))
        throw new SourceError(`Duplicate frontmatter key: ${key}`, i + 1, 1, "duplicate-key");

      if (raw === undefined || raw === "") {
        const child: Settings = {};
        parent.value[key] = child;
        stack.push({ depth, value: child });
      } else if (/^["[{]|^(true|false|null)$|^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(raw))
        parent.value[key] = safeJSON(raw, i + 1);
      else {
        if (/^[!&*|>'%]|\s#|[[\]{}]|^<<$/.test(raw))
          throw new SourceError(
            "Use a JSON-quoted string; YAML aliases, tags and multiline scalars are unsupported",
            i + 1,
            1,
            "frontmatter",
          );
        parent.value[key] = raw;
      }
    }

    return root;
  }

  type Directive = { fence: number; name: string; text?: string; attrs: Settings; key?: string };

  function bracketEnd(text: string, at: number, open: string, close: string): number {
    let depth = 0,
      quoted = false;

    for (let i = at; i < text.length; i++) {
      if (text[i] === "\\") {
        i++;
        continue;
      }

      if (open === "[" && text[i] === "`") {
        const fence = text.slice(i).match(/^`+/)![0],
          end = text.indexOf(fence, i + fence.length);

        if (end >= 0) {
          i = end + fence.length - 1;
          continue;
        }
      }

      if (open === "{" && text[i] === '"') quoted = !quoted;

      if (quoted) continue;

      if (text[i] === open) depth++;

      if (text[i] === close && --depth === 0) return i;
    }

    return -1;
  }

  function parseAttrs(text: string, line: number) {
    const attrs: Settings = {};

    let key: string | undefined,
      i = 0;

    while (i < text.length) {
      while (/\s/.test(text[i] ?? "") && i < text.length) i++;

      if (i >= text.length) break;
      const token = text.slice(i).match(/^(#[A-Za-z0-9][\w-]*|[A-Za-z][\w-]*)/);

      if (!token) throw new SourceError("Invalid directive attribute", line, i + 1);
      const name = token[1]!;
      i += name.length;

      if (name.startsWith("#")) {
        if (key) throw new SourceError("Only one source key is allowed", line);
        key = name.slice(1);
        continue;
      }

      if (Object.hasOwn(attrs, name))
        throw new SourceError(`Duplicate attribute: ${name}`, line, i + 1, "duplicate-key");
      let value: Setting = true;

      if (text[i] === "=") {
        i++;

        if (text[i] !== '"')
          throw new SourceError("Quote attribute values with double quotes", line, i + 1);
        let end = i + 1;

        for (; end < text.length; end++) {
          if (text[end] === "\\") end++;
          else if (text[end] === '"') break;
        }

        if (end >= text.length)
          throw new SourceError("Close the quoted attribute value", line, i + 1);
        value = safeJSON(text.slice(i, end + 1), line);
        i = end + 1;
      }

      attrs[name] = value;

      if (i < text.length && !/\s/.test(text[i]!))
        throw new SourceError("Separate directive attributes with spaces", line, i + 1);
    }

    return { attrs, key };
  }

  function directive(text: string, line: number, inline = false): Directive | undefined {
    const match = text.match(inline ? /^(:)([a-z][a-z0-9-]*)/ : /^(::{1,})([a-z][a-z0-9-]*)/);

    if (!match) return;

    let i = match[0].length,
      body: string | undefined;

    if (text[i] === "[") {
      const end = bracketEnd(text, i, "[", "]");

      if (end < 0) throw new SourceError("Close the directive's brackets", line);
      body = text.slice(i + 1, end);
      i = end + 1;
    }

    let attrs: Settings = {},
      key: string | undefined;

    if (text[i] === "{") {
      const end = bracketEnd(text, i, "{", "}");

      if (end < 0) throw new SourceError("Close the directive's attributes", line);
      ({ attrs, key } = parseAttrs(text.slice(i + 1, end), line));
      i = end + 1;
    }

    if (text.slice(i).trim())
      throw new SourceError("Unexpected text after a directive", line, i + 1);

    return { fence: match[1]!.length, name: match[2]!, text: body, attrs, key };
  }

  function inlineTo(source: string, line = 1, level = 0): RawNode[] {
    if (level > 30)
      throw new SourceError("Inline nesting exceeds 30 levels", line, 1, "size-limit");
    const nodes: RawNode[] = [];

    const text = (value: string, format = 0) => {
      const last = nodes.at(-1);

      if (last?.type === "text" && last.format === format && !last.style && last.mode === "normal")
        last.text = String(last.text) + value;
      else
        nodes.push({
          type: "text",
          version: 1,
          text: value,
          format,
          style: "",
          detail: 0,
          mode: "normal",
        });
    };

    let i = 0;

    while (i < source.length) {
      const rest = source.slice(i);

      if (rest.startsWith("\\")) {
        if (source[i + 1] === "\n") nodes.push({ type: "linebreak", version: 1 });
        else if (i + 1 < source.length) text(source[i + 1]!);
        else text("\\");
        i += 2;
        continue;
      }

      if (rest.startsWith("{{")) {
        const end = source.indexOf("}}", i + 2);

        if (end < 0) throw new SourceError("Close the mention token or escape its braces", line);
        const [field = "", ...fallback] = source.slice(i + 2, end).split("|");

        if (!field || /\s/.test(field)) throw new SourceError("A mention needs a source key", line);
        let defaultValue = "";

        try {
          defaultValue = decodeURIComponent(fallback.join("|"));
        } catch {
          throw new SourceError("Use a URI-encoded mention fallback", line);
        }

        nodes.push({
          type: "mention",
          version: 1,
          text: `@${field}`,
          field,
          defaultValue,
          format: 0,
          style: "",
          detail: 0,
          mode: "token",
        });
        i = end + 2;
        continue;
      }

      const extension = rest.match(/^:(span|link)\[/);

      if (extension) {
        const open = i + extension[0].length - 1,
          end = bracketEnd(source, open, "[", "]");

        if (end < 0 || source[end + 1] !== "{")
          throw new SourceError("Close the inline extension and add its attributes", line);
        const attrEnd = bracketEnd(source, end + 1, "{", "}");

        if (attrEnd < 0) throw new SourceError("Close the inline attributes", line);
        const { attrs } = parseAttrs(source.slice(end + 2, attrEnd), line);
        const children = inlineTo(source.slice(open + 1, end), line, level + 1);

        if (extension[1] === "link") {
          if (
            typeof attrs.url !== "string" ||
            Object.keys(attrs).some((key) => !["url", "props"].includes(key))
          )
            throw new SourceError("A link requires url and optional props", line);
          const rawProps = attrs.props === undefined ? {} : safeJSON(String(attrs.props), line);

          if (!rawProps || typeof rawProps !== "object" || Array.isArray(rawProps))
            throw new SourceError("Link props must be an object", line);
          const props = rawProps;

          if (/^(javascript|data|vbscript):/i.test(attrs.url.trim()))
            throw new SourceError("Use an http, https, mailto or relative link", line);

          if (
            Object.keys(props).some(
              (key) => !["target", "rel", "title", "format", "indent", "direction"].includes(key),
            )
          )
            throw new SourceError("Unsupported link property", line);
          nodes.push({
            type: "link",
            version: 1,
            children,
            url: attrs.url,
            target: null,
            rel: null,
            title: null,
            format: "",
            indent: 0,
            direction: null,
            ...props,
          });
        } else {
          if (
            (attrs.underline !== undefined &&
              attrs.underline !== true &&
              attrs.underline !== "true" &&
              attrs.underline !== "false") ||
            (attrs.underline !== undefined && attrs.data !== undefined)
          )
            throw new SourceError("Use the underline flag or a data object", line);

          const rawData =
            attrs.data === undefined
              ? { format: attrs.underline === true || attrs.underline === "true" ? 8 : 0 }
              : safeJSON(String(attrs.data), line);

          if (!rawData || typeof rawData !== "object" || Array.isArray(rawData))
            throw new SourceError("Span data must be an object", line);
          const data = rawData;

          if (
            Object.keys(attrs).some((key) => !["data", "underline"].includes(key)) ||
            Object.keys(data).some(
              (key) => !["format", "style", "detail", "mode", "state", "variants"].includes(key),
            )
          )
            throw new SourceError("Unsupported span property", line);

          if (
            (data.format !== undefined &&
              (typeof data.format !== "number" ||
                !Number.isInteger(data.format) ||
                data.format < 0)) ||
            (data.style !== undefined && typeof data.style !== "string") ||
            (data.detail !== undefined &&
              (typeof data.detail !== "number" || !Number.isInteger(data.detail))) ||
            (data.mode !== undefined &&
              !["normal", "token", "segmented"].includes(String(data.mode))) ||
            (data.state !== undefined &&
              (!data.state || typeof data.state !== "object" || Array.isArray(data.state)))
          )
            throw new SourceError("Invalid text formatting properties", line);

          for (const child of children) {
            if (!["text", "mention"].includes(child.type))
              throw new SourceError("A span may contain text and mentions only", line);
            child.format = Number(child.format ?? 0) | Number(data.format ?? 0);

            for (const key of ["style", "detail", "mode", "variants"])
              if (data[key] !== undefined) child[key] = data[key];

            if (data.state !== undefined) child.$ = data.state;
            nodes.push(child);
          }
        }

        i = attrEnd + 1;
        continue;
      }

      if (rest.startsWith("`")) {
        const fence = rest.match(/^`+/)![0];
        const end = source.indexOf(fence, i + fence.length);

        if (end < 0) throw new SourceError("Close the inline code fence", line);
        let value = source.slice(i + fence.length, end);

        if (value.startsWith(" ") && value.endsWith(" ") && value.trim())
          value = value.slice(1, -1);
        text(value, 16);
        i = end + fence.length;
        continue;
      }

      const mark = ["***", "**", "~~", "*"].find((m) => rest.startsWith(m));

      if (mark) {
        let end = i + mark.length;

        for (; end < source.length; end++) {
          if (source[end] === "\\") end++;
          else if (source.startsWith(mark, end)) break;
        }

        if (end >= source.length)
          throw new SourceError(`Close ${mark} formatting or escape it`, line);
        const children = inlineTo(source.slice(i + mark.length, end), line, level + 1);

        const apply = (child: RawNode) => {
          if (["text", "mention"].includes(child.type))
            child.format =
              Number(child.format ?? 0) |
              (mark === "***" ? 3 : mark === "**" ? 1 : mark === "~~" ? 4 : 2);
          child.children?.forEach(apply);
        };

        children.forEach(apply);
        nodes.push(...children);
        i = end + mark.length;
        continue;
      }

      if (rest.startsWith("[")) {
        const close = bracketEnd(source, i, "[", "]");

        if (close >= 0 && source[close + 1] === "(") {
          const end = source.indexOf(")", close + 2);

          if (end < 0) throw new SourceError("Close the link destination", line);
          let url: string;

          try {
            url = decodeURI(source.slice(close + 2, end));
          } catch {
            throw new SourceError("Invalid link URL", line);
          }

          if (/^(javascript|data|vbscript):/i.test(url.trim()))
            throw new SourceError("Use an http, https, mailto or relative link", line);
          nodes.push({
            type: "link",
            version: 1,
            children: inlineTo(source.slice(i + 1, close), line, level + 1),
            url,
            target: null,
            rel: null,
            title: null,
            format: "",
            indent: 0,
            direction: null,
          });
          i = end + 1;
          continue;
        }
      }

      if (source[i] === "<")
        throw new SourceError("HTML is not supported; escape literal angle brackets", line);
      text(source[i]!);
      i++;
    }

    return nodes;
  }

  class Reader {
    i: number;
    extension?: Extension;
    readonly used = new Set<string>();
    readonly diagnostics: Diagnostic[] = [];
    constructor(
      readonly lines: string[],
      start: number,
    ) {
      this.i = start;
    }
    fail(message: string, code = "syntax"): never {
      throw new SourceError(message, this.i + 1, 1, code);
    }
    key(value: string | undefined, label: string) {
      if (value) {
        if (this.used.has(value)) this.fail(`Duplicate source key: ${value}`, "duplicate-key");
        this.used.add(value);

        return value;
      }

      return unique(sourceSlug(label), this.used);
    }
    blank() {
      while (this.i < this.lines.length && !this.lines[this.i]!.trim()) this.i++;
    }
    indent() {
      return this.lines[this.i]?.match(/^ */)![0].length ?? 0;
    }
    line(base: number) {
      return (this.lines[this.i] ?? "").slice(base);
    }
    readDirective(base: number): Directive | undefined {
      const start = this.i;
      let line = this.line(base);

      if (!/^::[a-z:]/.test(line)) return;

      if (line.includes("["))
        while (
          bracketEnd(line, line.indexOf("["), "[", "]") < 0 &&
          this.i + 1 < this.lines.length
        ) {
          this.i++;
          line += `\n${this.line(base)}`;
        }

      return directive(line, start + 1);
    }
    payload(base: number, fence: number): Settings {
      this.i++;
      this.blank();

      if (this.line(base) !== "```json") this.fail("This directive requires a fenced JSON object");
      this.i++;

      const start = this.i,
        lines: string[] = [];

      while (this.i < this.lines.length && this.line(base) !== "```") {
        lines.push(this.line(base));
        this.i++;
      }

      if (this.i >= this.lines.length) this.fail("Close the JSON code fence");
      this.i++;
      this.blank();

      if (this.line(base) !== ":".repeat(fence)) this.fail("Close the JSON directive");
      this.i++;
      const value = safeJSON(lines.join("\n"), start + 1);

      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new SourceError("The payload must be a JSON object", start + 1);

      return value;
    }
    typed(name: string, value: Setting, fieldKind?: string): Setting {
      if (
        (fieldKind ? attributeType(fieldKind, name) === "boolean" : bools.has(name)) &&
        typeof value === "string" &&
        ["true", "false"].includes(value)
      )
        return value === "true";

      if (
        ((fieldKind ? attributeType(fieldKind, name) === "number" : numeric.has(name)) ||
          (!fieldKind && ["repeatMin", "repeatMax", "min", "max"].includes(name))) &&
        typeof value === "string" &&
        /^-?\d+(?:\.\d+)?$/.test(value)
      )
        return Number(value);

      return value;
    }
    blocks(base: number, closeFence?: number, nesting = 0): SourceBlock[] {
      if (nesting > 30) this.fail("Block nesting exceeds 30 levels", "size-limit");
      const blocks: SourceBlock[] = [];
      let anchor: string | undefined;

      while (this.i < this.lines.length) {
        this.blank();

        if (this.i >= this.lines.length) break;

        if (this.indent() < base) break;
        const line = this.line(base);

        if (this.indent() === base && closeFence && line === ":".repeat(closeFence)) {
          this.i++;

          return blocks;
        }

        if (this.indent() === base && /^:+$/.test(line))
          this.fail("Unexpected directive closing fence");

        if (
          base === 0 &&
          !closeFence &&
          (line === "---" || /^#(?: |$)/.test(line) || line.startsWith(":::source-state"))
        )
          break;

        if (this.indent() !== base) this.fail("Indent nested content by two spaces");
        const start = this.i;
        const d = this.readDirective(base);

        if (d) {
          if (d.name === "block" && d.fence === 2) {
            if (anchor || !d.key || d.text !== undefined || Object.keys(d.attrs).length)
              this.fail("A block marker needs one source key and must precede a block");
            anchor = this.key(d.key, "block");
            this.i++;
            continue;
          }

          if (questionKinds.has(d.name) && d.fence === 2) {
            if (anchor) this.fail("Put the source key on the question directive");
            const key = this.key(d.key, d.text?.replace(/\\(.)/g, "$1") || `${d.name}-question`);

            const preset =
              typeof d.attrs.preset === "string" ? profiles[d.attrs.preset] : undefined;

            if (d.attrs.preset !== undefined && (!preset || preset.kind !== d.name))
              this.fail("Unknown preset or preset used with a different field kind");

            const s: Settings = clone(preset?.settings ?? {}),
              explicit: string[] = [];

            let repeated = false;
            const repeat: Settings = {};

            for (const [name, value] of Object.entries(d.attrs)) {
              if (name === "preset") continue;

              if (["repeat", "repeatMin", "repeatMax"].includes(name)) {
                repeated = true;

                if (name !== "repeat")
                  repeat[name === "repeatMin" ? "min" : "max"] = this.typed(name, value);
                continue;
              }

              if (!attributeType(d.name, name))
                this.fail(`Unknown question attribute: ${name}; use source-state for raw settings`);
              s[name] = this.typed(name, value, d.name);
              explicit.push(name);
            }

            if (repeated) s.fieldArray = repeat;

            const q: SourceQuestion = {
              type: "question",
              key,
              kind: d.name,
              hints: [],
              settings: s,
            };

            if (d.text !== undefined) q.label = d.text;

            if (preset && explicit.length) q.explicit = explicit;

            if (q.label !== undefined) inlineTo(q.label, start + 1);
            this.i++;

            while (true) {
              this.blank();

              if (this.i >= this.lines.length || this.indent() !== base) break;
              const candidate = this.line(base);

              if (!/^::(?:hint|error)(?:\[|\{|$)/.test(candidate)) break;
              const hint = this.readDirective(base)!;

              if (hint.fence !== 2 || hint.key)
                this.fail("Hints and errors must be leaf directives without source keys");

              if (hint.name === "hint") {
                if (
                  hint.text === undefined ||
                  Object.keys(hint.attrs).some((k) => k !== "kind") ||
                  !hintHandler(hint.attrs.kind === undefined ? undefined : String(hint.attrs.kind))
                )
                  this.fail("A hint needs inline text and optional heading kind");
                inlineTo(hint.text, this.i + 1);
                q.hints.push({
                  type: "content",
                  kind: hintHandler(
                    hint.attrs.kind === undefined ? undefined : String(hint.attrs.kind),
                  )!.kind,
                  text: hint.text,
                });
              } else {
                if (
                  typeof hint.attrs.rule !== "string" ||
                  typeof hint.attrs.message !== "string" ||
                  hint.text !== undefined ||
                  Object.keys(hint.attrs).some((k) => !["rule", "message"].includes(k))
                )
                  this.fail("An error needs rule and message attributes");
                s.errors = { ...object(s.errors), [hint.attrs.rule]: hint.attrs.message };

                if (!hint.attrs.message.trim())
                  this.diagnostics.push({
                    code: "blank-error",
                    message: "This pinned validation message is blank",
                    severity: "warning",
                    line: this.i + 1,
                    column: 1,
                    sourceKey: key,
                  });
              }

              this.i++;
            }

            if (choices.has(d.name)) {
              q.options = [];

              while (this.i < this.lines.length) {
                this.blank();

                if (this.indent() !== base || !this.line(base).startsWith("- ")) break;
                const optionLine = this.i + 1;

                let text = this.line(base).slice(2),
                  optionKey: string | undefined,
                  node: NodeState | undefined;

                const configured = text.startsWith(":option");

                while (
                  configured
                    ? text.includes("[") && bracketEnd(text, text.indexOf("["), "[", "]") < 0
                    : (text.match(/\\+$/)?.[0].length ?? 0) % 2 === 1
                ) {
                  this.i++;

                  if (this.i >= this.lines.length || this.indent() < base + 2)
                    this.fail("Indent the option's continued line beneath its text");
                  text += `\n${this.line(base + 2)}`;
                }

                if (text.startsWith(":option")) {
                  const option = directive(text, optionLine, true)!;

                  if (
                    option.name !== "option" ||
                    option.text === undefined ||
                    Object.keys(option.attrs).some((name) => !ownOptionKeys.has(name))
                  )
                    this.fail("Invalid option directive");
                  text = option.text;

                  if (option.key) optionKey = this.key(option.key, text);

                  if (Object.keys(option.attrs).length)
                    node = {
                      settings: Object.fromEntries(
                        Object.entries(option.attrs).map(([k, v]) => [k, this.typed(k, v)]),
                      ),
                    };
                }

                inlineTo(text, optionLine);
                this.i++;
                const nested = this.blocks(base + 2, undefined, nesting + 1);
                const sourceOption: SourceOption = { text, blocks: nested };

                if (optionKey) sourceOption.key = optionKey;

                if (node) sourceOption.node = node;
                q.options.push(sourceOption);
              }

              if (!q.options.length && preset?.options)
                q.options = preset.options.map((text) => ({ text: esc(text), blocks: [] }));

              if (!q.options.length) this.fail("A choice question needs at least one option");

              if (preset?.options)
                for (const option of q.options) {
                  const label = plain({ type: "option", children: inlineTo(option.text) });

                  if (
                    preset.options.includes(label) &&
                    !Object.hasOwn(option.node?.settings ?? {}, "sourceOptionValue")
                  )
                    option.node = {
                      ...option.node,
                      settings: {
                        ...option.node?.settings,
                        sourceOptionValue: profileOptionValue(preset, label),
                      },
                    };
                }
            }

            blocks.push(q);
            continue;
          }

          if (["hint", "error"].includes(d.name))
            this.fail("Place hints and errors directly after their question", "attachment");

          const content = contents.find((content) => {
            const syntax = content.syntax;

            return (
              ((syntax.type === "directive" || syntax.type === "json") && syntax.name === d.name) ||
              (syntax.type === "paragraph" && ["paragraph", "empty"].includes(d.name)) ||
              (syntax.type === "heading" &&
                d.name === "heading" &&
                String(syntax.level) === String(d.attrs.level))
            );
          });

          const syntax = content?.syntax;

          if (content && syntax?.type === "directive" && syntax.nested && d.fence >= 3) {
            if (Object.keys(d.attrs).length || d.text === undefined)
              this.fail("A content container needs summary text and an optional source key");
            const key = d.key ? this.key(d.key, d.text) : anchor;
            anchor = undefined;
            inlineTo(d.text, this.i + 1);
            this.i++;

            const block: SourceContent = {
              type: "content",
              kind: content.kind,
              text: d.text,
              blocks: this.blocks(base, d.fence, nesting + 1),
            };

            if (key) block.key = key;
            blocks.push(block);
            continue;
          }

          if (content && syntax?.type === "json" && d.fence >= 3) {
            if (d.text !== undefined || Object.keys(d.attrs).length)
              this.fail("This content block uses a JSON payload");
            const key = this.key(d.key ?? anchor, d.name);
            anchor = undefined;
            blocks.push({
              type: "content",
              kind: content.kind,
              key,
              text: "",
              node: { settings: this.payload(base, d.fence) },
            });
            continue;
          }

          if (
            content &&
            syntax &&
            (syntax.type === "paragraph" ||
              syntax.type === "heading" ||
              (syntax.type === "directive" && !syntax.nested)) &&
            d.fence === 2
          ) {
            if (
              d.name === "empty" ? d.text !== undefined || nonempty(d.attrs) : d.text === undefined
            )
              this.fail("Invalid content directive");

            if (d.key) this.fail("Use a block marker before this content");

            if (Object.keys(d.attrs).some((key) => syntax.type !== "heading" || key !== "level"))
              this.fail("Unknown content attribute");
            const text = d.text ?? "";
            inlineTo(text, this.i + 1);
            const block: SourceContent = { type: "content", kind: content.kind, text };

            if (anchor) block.key = anchor;
            blocks.push(block);
            anchor = undefined;
            this.i++;
            continue;
          }

          this.fail(`Unsupported directive: ${d.name}`);
        }

        if (/^```|^~~~|^>|^\|/.test(line))
          this.fail("This block construct is not supported by form Markdown");
        const heading = line.match(/^(#{2,3}) (.*)$/);
        const list = line.match(/^(- |\d+\. )(.*)$/);

        if (heading || list) {
          const textLine = this.i + 1;
          let text = heading?.[2] ?? list![2]!;
          this.i++;

          if (list)
            while ((text.match(/\\+$/)?.[0].length ?? 0) % 2 === 1) {
              const continuation = base + list[1]!.length;

              if (this.i >= this.lines.length || this.indent() < continuation)
                this.fail("Indent the list item's continued line beneath its text");
              text += `\n${this.line(continuation)}`;
              this.i++;
            }

          inlineTo(text, textLine);

          const content = contents.find((content) =>
            heading
              ? content.syntax.type === "heading" && content.syntax.level === heading[1]!.length
              : content.syntax.type === "list" && content.syntax.ordered === (list![1] !== "- "),
          );

          if (!content) this.fail("This content syntax is not installed");

          const block: SourceContent = {
            type: "content",
            kind: content.kind,
            text,
          };

          if (anchor) block.key = anchor;
          anchor = undefined;

          if (list) {
            const nested = this.blocks(base + 2, undefined, nesting + 1);

            if (nested.length) block.blocks = nested;
          }

          blocks.push(block);
          continue;
        }

        const paragraph = [line];
        this.i++;

        while (
          this.i < this.lines.length &&
          this.lines[this.i]!.trim() &&
          this.indent() === base &&
          !/^(?:#{1,6}(?: |$)|::|---$|- |\d+\. |```|~~~|>)/.test(this.line(base))
        ) {
          paragraph.push(this.line(base));
          this.i++;
        }

        const text = paragraph.join("\n");
        inlineTo(text, start + 1);
        const content = contents.find((content) => content.syntax.type === "paragraph");

        if (!content) this.fail("Paragraph content is not installed");
        const block: SourceContent = { type: "content", kind: content.kind, text };

        if (anchor) block.key = anchor;
        blocks.push(block);
        anchor = undefined;
      }

      if (anchor) this.fail("A block marker must be followed by a block");

      if (closeFence) this.fail("Close the container directive", "unclosed-directive");

      return blocks;
    }
  }

  function applyExtension(document: FormDocument, extension: Extension, line: number) {
    if (
      Object.keys(extension).some((key) => !["form", "pages", "questions", "nodes"].includes(key))
    )
      throw new SourceError("Unknown source-state scope", line);

    const record = (value: unknown, scope: string) => {
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new SourceError(`${scope} must be an object`, line);
    };

    for (const [scope, value] of Object.entries(extension)) {
      record(value, scope);

      if (scope !== "form")
        for (const [key, entry] of Object.entries(value)) record(entry, `${scope}.${key}`);
    }

    const pages = new Map<string, SourcePage>(),
      questions = new Map<string, SourceQuestion>(),
      nodes = new Map<
        string,
        { get: () => NodeState | undefined; set: (value: NodeState) => void }
      >();

    const walk = (blocks: SourceBlock[], path: string) =>
      blocks.forEach((block, i) => {
        const at = `${path}/${i + 1}`;

        if (block.type === "question") {
          questions.set(block.key, block);
          block.hints.forEach((hint, n) => {
            if (hint.type === "content")
              nodes.set(`${block.key}:hint-${n + 1}`, {
                get: () => hint.node,
                set: (value) => {
                  hint.node = value;
                },
              });
          });
          block.options?.forEach((option, n) => {
            nodes.set(option.key ?? `${block.key}:option-${n + 1}`, {
              get: () => option.node,
              set: (value) => {
                option.node = value;
              },
            });
            walk(option.blocks, `${block.key}:option-${n + 1}`);
          });
        } else {
          nodes.set(block.key ?? at, {
            get: () => block.node,
            set: (value) => {
              block.node = value;
            },
          });

          if (block.blocks) walk(block.blocks, at);
        }
      });

    document.pages.forEach((page, i) => {
      const key = page.key ?? `page-${i + 1}`;

      if (pages.has(key)) throw new SourceError(`Ambiguous page key: ${key}`, line);
      pages.set(key, page);
      walk(page.blocks, key);
    });

    const checkedMeta = (value: unknown): NodeState => {
      const data = object(value);

      if (
        !value ||
        Array.isArray(value) ||
        typeof value !== "object" ||
        Object.keys(data).some(
          (key) => !["settings", "properties", "state", "identity"].includes(key),
        )
      )
        throw new SourceError("Invalid node state", line);

      for (const key of ["settings", "properties", "state"])
        if (
          data[key] !== undefined &&
          (!data[key] || typeof data[key] !== "object" || Array.isArray(data[key]))
        )
          throw new SourceError(`${key} must be an object`, line);

      if (data.identity !== undefined && (typeof data.identity !== "string" || !data.identity))
        throw new SourceError("A retained identity must be a nonempty string", line);

      // SAFETY: allowed keys, object-valued metadata, and the optional nonempty identity were all checked immediately above.
      return data as NodeState;
    };

    if (extension.form !== undefined) Object.assign(document.settings, extension.form);

    for (const [key, data] of Object.entries(extension.pages ?? {})) {
      const page = pages.get(key);

      if (!page) throw new SourceError(`Source-state page does not exist: ${key}`, line);

      if (
        Object.keys(data).some(
          (key) => !["settings", "start", "title", "description"].includes(key),
        )
      )
        throw new SourceError("Unknown page state property", line);

      if (data.settings !== undefined) {
        record(data.settings, "page settings");
        const invalid = validatePageSettings(data.settings);

        if (invalid) throw new SourceError(invalid, line);
        Object.assign(page.settings, data.settings);
      }

      if (data.start !== undefined) {
        const start = checkedMeta(data.start);
        const invalid = validatePageSettings(start.settings);

        if (invalid) throw new SourceError(invalid, line);
        page.startNode = start;
      }

      const settings = { ...page.startNode?.settings, ...page.settings };

      if (page.type === "questions" && settings.confirmation === true) page.type = "confirmation";

      if (data.title !== undefined) {
        if (
          !["questions", "confirmation", "result"].includes(page.type) &&
          !object(page.startNode?.state?.native).page
        )
          throw new SourceError("This page has no editable title node", line);
        page.titleNode = checkedMeta(data.title);
      }

      if (data.description !== undefined) {
        if (page.description === undefined)
          throw new SourceError("This page has no description node", line);
        page.descriptionNode = checkedMeta(data.description);
      }
    }

    for (const [key, data] of Object.entries(extension.questions ?? {})) {
      const q = questions.get(key);

      if (!q) throw new SourceError(`Source-state question does not exist: ${key}`, line);

      if (
        Object.keys(data).some(
          (key) =>
            !["settings", "removeSettings", "explicit", "identity", "label", "answer"].includes(
              key,
            ),
        )
      )
        throw new SourceError("Unknown question state property", line);

      if (data.removeSettings !== undefined) {
        if (
          !Array.isArray(data.removeSettings) ||
          data.removeSettings.some((k) => typeof k !== "string")
        )
          throw new SourceError("removeSettings must contain property names", line);

        for (const name of data.removeSettings) delete q.settings[name];
      }

      if (data.settings !== undefined) {
        record(data.settings, "question settings");

        if (Object.keys(data.settings).some((key) => internalKeys.has(key)))
          throw new SourceError(
            "Use the question's source key or identity metadata for its identity",
            line,
          );
        Object.assign(q.settings, data.settings);
      }

      if (data.identity !== undefined) {
        if (typeof data.identity !== "string" || !data.identity)
          throw new SourceError("Invalid retained question identity", line);
        q.identity = data.identity;
      }

      if (data.explicit !== undefined) {
        if (!Array.isArray(data.explicit) || data.explicit.some((k) => typeof k !== "string"))
          throw new SourceError("explicit must contain property names", line);
        q.explicit = data.explicit;
      }

      if (data.label !== undefined) {
        if (q.label === undefined) throw new SourceError("This question has no label node", line);
        q.labelNode = checkedMeta(data.label);
      }

      if (data.answer !== undefined) {
        if (q.options)
          throw new SourceError("Choice question state belongs to its individual options", line);
        q.answerNode = checkedMeta(data.answer);
      }
    }

    for (const [key, value] of Object.entries(extension.nodes ?? {})) {
      const target = nodes.get(key);

      if (!target) throw new SourceError(`Source-state node does not exist: ${key}`, line);

      const metadata = checkedMeta(value),
        before = target.get();

      const next = { ...before, ...metadata };

      if (before?.settings || metadata.settings)
        next.settings = { ...before?.settings, ...metadata.settings };
      target.set(next);
    }
  }

  function readMarkdown(source: string): {
    document?: FormDocument;
    diagnostics: Diagnostic[];
    original: string;
  } {
    try {
      if (source.length > 2_000_000)
        throw new SourceError("Source exceeds the 2 MB limit", 1, 1, "size-limit");
      const lines = source.replace(/\r\n/g, "\n").split("\n");

      if (lines[0] !== "---")
        throw new SourceError("Start the document with frontmatter", 1, 1, "frontmatter");
      const end = lines.indexOf("---", 1);

      if (end < 0) throw new SourceError("Close the frontmatter with ---", 1, 1, "frontmatter");
      const front = parseFront(lines, 1, end);

      if (front.format !== "govbb-form" || (front.formatVersion !== 1 && front.formatVersion !== 2))
        throw new SourceError(
          "This editor supports govbb-form formatVersion 1 and 2",
          2,
          1,
          "format-version",
        );

      if (typeof front.title !== "string")
        throw new SourceError("Frontmatter title must be a string", 2);
      inlineTo(front.title, 2);
      const meta = object(front.meta);

      if (
        front.meta !== undefined &&
        (!front.meta || typeof front.meta !== "object" || Array.isArray(front.meta))
      )
        throw new SourceError("meta must be an object", 2);
      const settings: Settings = { visibility: meta.visibility ?? "preview" };

      if (meta.closingDateTime !== undefined) settings.closingDateTime = meta.closingDateTime;

      for (const key of formKeys) if (front[key] !== undefined) settings[key] = front[key]!;

      const unknown = Object.fromEntries(
        Object.entries(front).filter(
          ([key]) =>
            !["format", "formatVersion", "title", "meta"].includes(key) && !formKeys.has(key),
        ),
      );

      const unknownMeta = Object.fromEntries(
        Object.entries(meta).filter(([key]) => !["visibility", "closingDateTime"].includes(key)),
      );

      if (nonempty(unknownMeta)) unknown.meta = unknownMeta;

      const document: FormDocument = {
        formatVersion: front.formatVersion,
        title: front.title,
        settings,
        unknown,
        pages: [],
      };

      const reader = new Reader(lines, end + 1);

      while (reader.i < lines.length) {
        reader.blank();

        if (reader.i >= lines.length) break;

        if (lines[reader.i]!.startsWith(":::source-state")) {
          const d = reader.readDirective(0)!;

          if (
            d.name !== "source-state" ||
            d.text !== undefined ||
            d.key ||
            nonempty(d.attrs) ||
            reader.extension
          )
            reader.fail("Invalid source-state directive");
          const extensionLine = reader.i + 1;
          // SAFETY: payload is bounded JSON; applyExtension immediately validates all scopes and metadata before hydration.
          reader.extension = reader.payload(0, d.fence) as Extension;
          reader.blank();

          if (reader.i < lines.length) reader.fail("source-state must be the last block");
          applyExtension(document, reader.extension, extensionLine);
          break;
        }

        if (document.pages.length) {
          if (lines[reader.i] !== "---") reader.fail("Separate pages with ---");
          reader.i++;
          reader.blank();
        }

        const heading = lines[reader.i]?.match(/^#(?: (.*))?$/);

        if (!heading) reader.fail("Each page starts with # and its title");

        const page: SourcePage = {
          type: "questions",
          title: heading![1] ?? "",
          settings: {},
          blocks: [],
        };

        reader.i++;
        const seen = new Set<string>();

        while (reader.i < lines.length) {
          reader.blank();

          if (
            reader.i >= lines.length ||
            !/^::(?:page|description|repeat-page)(?:\[|\{|$)/.test(lines[reader.i]!)
          )
            break;
          const d = reader.readDirective(0)!;

          if (d.fence !== 2 || seen.has(d.name)) reader.fail("Duplicate or invalid page metadata");
          seen.add(d.name);

          if (d.name === "description") {
            if (d.text === undefined || d.key || nonempty(d.attrs))
              reader.fail("A page description needs plain text");
            page.description = d.text;
          } else if (d.name === "page") {
            if (
              d.text !== undefined ||
              Object.keys(d.attrs).some(
                (key) =>
                  !["type", "pageId", "button", "backButton", "hidden", "folded"].includes(key),
              )
            )
              reader.fail("Invalid page metadata");
            page.type = String(d.attrs.type ?? "questions");

            if (
              !["questions", "check-answers", "declaration", "confirmation", "result"].includes(
                page.type,
              )
            )
              reader.fail("Unknown page type");

            if (d.key) page.key = reader.key(d.key, "page");

            for (const [key, value] of Object.entries(d.attrs))
              if (key !== "type") page.settings[key] = reader.typed(key, value);
          } else {
            if (
              d.text !== undefined ||
              d.key ||
              Object.keys(d.attrs).some((key) => !["min", "max", "instanceLabel"].includes(key))
            )
              reader.fail("Invalid repeat-page attributes");
            page.settings.repeatable = Object.fromEntries(
              Object.entries(d.attrs).map(([key, value]) => [key, reader.typed(key, value)]),
            );
          }

          reader.i++;
        }

        page.blocks = reader.blocks(0);
        document.pages.push(page);
      }

      for (const page of document.pages)
        if (!object(page.startNode?.state?.native).page) {
          if (inlineTo(page.title).some((n) => n.type !== "text" || n.format || n.style))
            throw new SourceError("Page titles are plain text", 1);

          if (
            page.description !== undefined &&
            inlineTo(page.description).some((n) => n.type !== "text" || n.format || n.style)
          )
            throw new SourceError("Page descriptions are plain text", 1);

          if (
            (page.type === "check-answers" && page.title !== "Check your answers") ||
            (page.type === "declaration" && page.title !== "Declaration")
          )
            throw new SourceError("This reserved page uses its fixed heading", 1);

          if (
            !["questions", "confirmation", "result"].includes(page.type) &&
            page.description !== undefined
          )
            throw new SourceError("This reserved page has no editable description", 1);
        }

      if (!document.pages.length) throw new SourceError("Add at least one page", end + 2);

      if (document.pages[0]!.type !== "questions")
        throw new SourceError("Page 1 must be a question page", end + 2);
      const warnings = reader.diagnostics;

      if (
        settings.closingDateTime !== undefined &&
        (typeof settings.closingDateTime !== "string" || !closingWorks(settings.closingDateTime))
      )
        warnings.push({
          code: "closing-date",
          message:
            "The closing date is not a real calendar date and time; the entered value is retained",
          severity: "warning",
          line: 2,
          column: 1,
        });
      toEditor(document); // Check hydration structure and identity ownership before offering Apply.
      const identities = new Set<string>();
      // SAFETY: toEditor produced this node tree from validated source blocks immediately above.
      const serialized = toEditor(document).root.children as RawNode[];

      for (const node of serialized) {
        if (identities.has(id(node)))
          throw new SourceError(
            `Duplicate identity owner: ${id(node)}`,
            1,
            1,
            "duplicate-identity",
          );
        identities.add(id(node));
      }

      const targets = new Set<string>(["id", "respondentId", "formName", "0"]);

      const visit = (blocks: SourceBlock[]) =>
        blocks.forEach((block) => {
          if (block.key) targets.add(block.key);

          if (block.type === "question") {
            targets.add(`${block.key}:label`);
            targets.add(`${block.key}:answer`);
            block.options?.forEach((o) => {
              if (o.key) targets.add(o.key);
              visit(o.blocks);
            });
          } else {
            if (
              block.kind === "calculated-fields" &&
              block.key &&
              Array.isArray(block.node?.settings?.calculatedFields)
            )
              for (const row of block.node.settings.calculatedFields)
                if (
                  row &&
                  typeof row === "object" &&
                  !Array.isArray(row) &&
                  typeof row.id === "string"
                )
                  targets.add(`${block.key}:${row.id}`);

            if (block.blocks) visit(block.blocks);
          }
        });

      document.pages.forEach((page, i) => {
        targets.add(page.key ?? `page-${i + 1}`);
        visit(page.blocks);
      });

      for (const match of source.matchAll(/(?<!\\)\{\{([^{}|]+)(?:\|[^{}]*)?\}\}/g))
        if (!targets.has(match[1]!))
          warnings.push({
            code: "missing-reference",
            message: `Reference ${match[1]} has no target; its source is retained`,
            severity: "warning",
            line: source.slice(0, match.index).split("\n").length,
            column: 1,
            sourceKey: match[1],
          });

      return { document, diagnostics: warnings, original: source };
    } catch (error) {
      const e =
        error instanceof SourceError
          ? error
          : new SourceError(error instanceof Error ? error.message : "Unable to read source", 1);

      return {
        diagnostics: [
          { code: e.code, message: e.message, severity: "fatal", line: e.line, column: e.column },
        ],
        original: source,
      };
    }
  }

  function rejectLegacyConditions(settings: Settings) {
    if (Object.hasOwn(settings, "conditionalLabel") || Object.hasOwn(settings, "conditionalTitle"))
      throw new Error(
        "Version 2 stores conditional wording in logic blocks. Import this document as version 1 to migrate its legacy wording; the original source is retained.",
      );
  }

  function toEditor(document: FormDocument): SerializedEditorState {
    const aliases = new Map<string, string>();

    const choiceFields = new Set<string>(),
      optionAliases = new Map<string, string>();

    const context: ReferenceContext = { choiceFields, optionAliases };
    const output: RawNode[] = [];
    const baseElement = { version: 1, children: [], format: "", indent: 0, direction: null };

    const register = (key: string, meta?: NodeState) => {
      const value = meta?.identity ?? key;

      if (aliases.has(key) && aliases.get(key) !== value)
        throw new Error(`Ambiguous source target: ${key}`);
      aliases.set(key, value);

      return value;
    };

    const scan = (blocks: SourceBlock[], path: string) =>
      blocks.forEach((block, i) => {
        const at = `${path}/${i + 1}`;

        if (block.type === "question") {
          register(block.key, block.identity ? { identity: block.identity } : undefined);

          if (
            choices.has(block.kind) ||
            fields.find((field) => field.kind === block.kind)?.referencesOptions
          )
            choiceFields.add(block.key);

          if (block.label !== undefined) register(`${block.key}:label`, block.labelNode);

          if (block.options)
            block.options.forEach((option, n) => {
              optionAliases.set(
                option.key ?? `${block.key}:option-${n + 1}`,
                register(option.key ?? `${block.key}:option-${n + 1}`, option.node),
              );
              scan(option.blocks, `${block.key}:option-${n + 1}`);
            });
          else register(`${block.key}:answer`, block.answerNode);
          block.hints.forEach((hint, n) => {
            if (hint.type === "content") register(`${block.key}:hint-${n + 1}`, hint.node);
          });
        } else {
          register(block.key ?? at, block.node);

          if (block.blocks) scan(block.blocks, at);
        }
      });

    document.pages.forEach((page, i) => {
      if (Object.hasOwn(page.settings, "logicVersion"))
        throw new Error(
          "The source formatVersion controls the logic version; remove the conflicting page setting",
        );
      const path = page.key ?? `page-${i + 1}`;
      register(path, page.startNode);
      register(`${path}:title`, page.titleNode);
      register(`${path}:description`, page.descriptionNode);
      scan(page.blocks, path);
    });

    const inlines = (source: string): RawNode[] =>
      inlineTo(source).map(function remap(node): RawNode {
        if (node.type === "mention")
          return { ...node, field: remapReference(String(node.field), aliases) };

        if (node.children) return { ...node, children: node.children.map(remap) };

        return node;
      });

    const node = (
      type: string,
      text: string,
      key: string,
      level: number,
      meta?: NodeState,
      data: Settings = {},
      s: Settings = {},
    ): RawNode => {
      if (
        (meta?.settings && Object.hasOwn(meta.settings, "logicVersion")) ||
        (type !== "form-title" && Object.hasOwn(s, "logicVersion"))
      )
        throw new Error(
          "The source formatVersion controls the logic version; remove the conflicting node setting",
        );

      if (document.formatVersion === 2) {
        rejectLegacyConditions(s);
        rejectLegacyConditions(meta?.settings ?? {});
      }

      if (
        meta?.properties &&
        Object.keys(meta.properties).some(
          (key) =>
            ![
              "format",
              "indent",
              "direction",
              "textFormat",
              "textStyle",
              ...(sourceFieldForNode(fields, { type, ...data })?.properties ?? []),
              ...(sourceContentForNode(contents, { type, ...data })?.properties ?? []),
            ].includes(key),
        )
      )
        throw new Error(
          "Unsupported saved element property; keep the original source for recovery",
        );

      if (
        meta?.state &&
        ["settings", "depth", "id", "sourceAnchor"].some((key) => Object.hasOwn(meta.state!, key))
      )
        throw new Error("Reserved node state key");
      const field = sourceFieldForNode(fields, { type, ...data });
      const handler = field ?? sourceContentForNode(contents, { type, ...data });

      const remap = (settings: Settings) =>
        remapSettings(handler?.kind ?? "", settings, aliases, context, field ? "field" : "content");

      const state = { ...meta?.state };
      let editorDepth = level;

      if (Object.hasOwn(state, "nativeSourceDepth")) {
        if (
          !nonempty(object(state.native)) ||
          typeof state.nativeSourceDepth !== "number" ||
          !Number.isInteger(state.nativeSourceDepth) ||
          state.nativeSourceDepth < 0
        )
          throw new Error("Invalid native layout depth");
        editorDepth = state.nativeSourceDepth;
        delete state.nativeSourceDepth;
      }

      const serialized: RawNode = {
        ...(type === "widget" ? { version: 1 } : baseElement),
        type,
      };

      if (type !== "widget") serialized.children = inlines(text);
      Object.assign(serialized, data, meta?.properties);
      const nodeState: Settings = { ...state, id: register(key, meta), depth: editorDepth };

      if (nonempty(s) || nonempty(meta?.settings ?? {}))
        nodeState.settings = { ...remap(s), ...remap(meta?.settings ?? {}) };
      serialized.$ = nodeState;

      return serialized;
    };

    const emit = (blocks: SourceBlock[], path: string, level: number) =>
      blocks.forEach((block, i) => {
        const at = `${path}/${i + 1}`;

        if (block.type === "question") {
          if (!sourceKeyOK(block.key)) throw new Error(`Invalid source key: ${block.key}`);

          if (block.label !== undefined)
            output.push(
              node("question", block.label, `${block.key}:label`, level, block.labelNode),
            );
          block.hints.forEach((hint, n) => {
            const handler = hintHandler(hint.kind);

            if (hint.type !== "content" || !handler)
              throw new Error(`Unavailable hint content: ${hint.kind}`);
            const { storage } = handler;

            const raw = node(
              storage.type,
              hint.text,
              `${block.key}:hint-${n + 1}`,
              level,
              hint.node,
              storage.property ? { [storage.property]: storage.value! } : {},
            );

            output.push(handler.toNode?.(hint, raw) ?? raw);
          });

          const shared: Settings = {
            ...block.settings,
            field: aliases.get(block.key) ?? block.key,
            sourceKey: block.key,
          };

          if (block.explicit?.length) shared.sourceExplicit = block.explicit;

          if (choices.has(block.kind)) {
            if (!block.options?.length)
              throw new Error(`Choice question ${block.key} needs options`);
            block.options.forEach((option, n) => {
              const raw = node(
                "option",
                option.text,
                option.key ?? `${block.key}:option-${n + 1}`,
                level,
                option.node,
                { kind: block.kind },
                shared,
              );

              if (option.key) raw.$ = { ...rawState(raw), sourceAnchor: option.key };
              output.push(raw);
              emit(option.blocks, `${block.key}:option-${n + 1}`, level + 1);
            });
          } else {
            if (!questionKinds.has(block.kind))
              throw new Error(`Unsupported question kind: ${block.kind}`);
            const storage = fields.find((field) => field.kind === block.kind)!.storage;

            const raw = node(
              storage.type,
              "",
              `${block.key}:answer`,
              level,
              block.answerNode,
              storage.property ? { [storage.property]: storage.value! } : {},
              shared,
            );

            output.push(
              fields.find((field) => field.kind === block.kind)?.toNode?.(block, raw) ?? raw,
            );
          }
        } else {
          if (!contentKinds.has(block.kind)) throw new Error(`Unsupported block: ${block.kind}`);
          const handler = contentHandler(block.kind)!;
          const storage = handler.storage;
          const data: Settings = storage.property ? { [storage.property]: storage.value! } : {};
          let raw = node(storage.type, block.text, block.key ?? at, level, block.node, data);
          raw = handler.toNode?.(block, raw) ?? raw;

          if (block.key) raw.$ = { ...rawState(raw), sourceAnchor: block.key };
          output.push(raw);

          if (block.blocks) emit(block.blocks, at, level + 1);
        }
      });

    document.pages.forEach((page, i) => {
      const path = page.key ?? `page-${i + 1}`;

      const s = {
        ...page.settings,
        ...(page.type === "confirmation"
          ? { confirmation: true }
          : page.type !== "questions"
            ? { pageType: page.type }
            : {}),
      };

      if (i === 0) {
        const formSettings: Settings = {
          ...s,
          logicVersion: document.formatVersion,
          formSettings: remapKnownSettings(document.settings, aliases, context),
        };

        if (nonempty(document.unknown)) formSettings.sourceUnknown = document.unknown;

        const raw = node("form-title", document.title, path, 0, page.startNode, {}, formSettings);

        if (page.key) raw.$ = { ...rawState(raw), sourceAnchor: page.key };
        output.push(raw);
      } else {
        const raw = node("widget", "", path, 0, page.startNode, { widget: "page-break" }, s);

        if (page.key) raw.$ = { ...rawState(raw), sourceAnchor: page.key };
        output.push(raw);
      }

      if (
        ["questions", "confirmation", "result"].includes(page.type) ||
        object(page.startNode?.state?.native).page
      )
        output.push(node("page-title", page.title, `${path}:title`, 0, page.titleNode));

      if (page.description !== undefined)
        output.push(
          node(
            "page-description",
            page.description,
            `${path}:description`,
            0,
            page.descriptionNode,
          ),
        );
      emit(page.blocks, path, 0);
    });

    return {
      root: {
        type: "root",
        version: 1,
        // SAFETY: every output node came from node(), which sets type/version, or an installed content handler with the same serialized contract.
        children: output as SerializedLexicalNode[],
        format: "",
        indent: 0,
        direction: null,
      },
    };
  }

  /** Compare authoring meaning after isolated hydration, including retained IDs and raw draft values. */
  function semanticFingerprint(document: FormDocument): string {
    // SAFETY: this clones our own hydrated tree; the wider RawNode view permits removal of derived serialization properties only.
    const state = clone(toEditor(document)) as { root: RawNode };

    const normalize = (node: RawNode) => {
      delete node.version;

      if (node.type === "mention") delete node.text; // Its display label is derived from its target.

      if (node.children) {
        node.children.forEach(normalize);
        const merged: RawNode[] = [];

        for (const child of node.children) {
          const previous = merged.at(-1);

          if (
            previous?.type === "text" &&
            child.type === "text" &&
            same({ ...previous, text: "" }, { ...child, text: "" })
          )
            previous.text = String(previous.text) + String(child.text);
          else merged.push(child);
        }

        node.children = merged;
      }

      const s = rawState(node);

      if (s.settings && typeof s.settings === "object" && !Array.isArray(s.settings)) {
        // This provenance controls the source spelling, not what the raw editor can retain.
        delete s.settings.sourceExplicit;

        if (node.type === "form-title") {
          const form = object(s.settings.formSettings);

          if (form.visibility === undefined) form.visibility = "preview";
          s.settings.formSettings = form;
        }
      }
    };

    normalize(state.root);

    const sorted = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(sorted)
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.entries(value)
                .filter(([, v]) => v !== undefined)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, v]) => [key, sorted(v)]),
            )
          : value;

    return JSON.stringify(sorted(state));
  }

  return { fromEditor, writeMarkdown, readMarkdown, toEditor, semanticFingerprint, questionKinds };
}

export type FormSourceDialect = ReturnType<typeof createFormSourceDialect>;
