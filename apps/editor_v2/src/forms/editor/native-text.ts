import type { RichText } from "../schema/types";
import type { NativeRawNode } from "./native-state";

const marks = { bold: 1, italic: 2, strikethrough: 4, underline: 8, code: 16 } as const;

export class NativeTextError extends Error {}

export const nativeTextNode = (text: string, format = 0): NativeRawNode => ({
  type: "text",
  version: 1,
  text,
  format,
  style: "",
  mode: "normal",
  detail: 0,
});

export const nativeElement = (
  type: string,
  children: NativeRawNode[] = [],
  properties: Record<string, unknown> = {},
): NativeRawNode => ({
  type,
  version: 1,
  children,
  format: "",
  indent: 0,
  direction: null,
  ...properties,
});

/** Reference formatting lives on the editable inline node, never on a form-level cache. */
export function nativeTextToNodes(value: RichText): NativeRawNode[] {
  const parts = typeof value === "string" ? [value] : value;

  return parts.flatMap((part): NativeRawNode[] => {
    if (typeof part === "string") return part ? [nativeTextNode(part)] : [];

    if ("text" in part)
      return [
        nativeTextNode(
          part.text,
          (part.marks ?? []).reduce((mask, mark) => mask | marks[mark], 0),
        ),
      ];

    if ("break" in part) return [{ type: "linebreak", version: 1 }];

    if ("link" in part)
      return [
        nativeElement("link", nativeTextToNodes(part.content), {
          url: part.link,
          rel: null,
          target: null,
          title: null,
        }),
      ];
    const field = "answer" in part ? part.answer : "value" in part ? part.value : part.context;

    return [
      {
        ...nativeTextNode(`@${field}`),
        type: "mention",
        mode: "token",
        field,
        defaultValue: part.fallback ?? "",
        $: { nativeReference: structuredClone(part) },
      },
    ];
  });
}

export function nodesToNativeText(nodes: readonly NativeRawNode[]): RichText {
  const parts: Exclude<RichText, string> = [];

  for (const node of nodes) {
    const allowed = new Set([
      "type",
      "version",
      "children",
      "text",
      "format",
      "style",
      "mode",
      "detail",
      "direction",
      "indent",
      "url",
      "rel",
      "target",
      "title",
      "field",
      "defaultValue",
      "$",
      "textFormat",
      "textStyle",
    ]);

    for (const key of Object.keys(node))
      if (!allowed.has(key))
        throw new NativeTextError(`This inline ${key} property has no native form representation`);

    for (const key of Object.keys(node.$ ?? {}))
      if (key !== "nativeReference")
        throw new NativeTextError(`This inline ${key} state has no native form representation`);

    if (
      node.style ||
      node.detail ||
      node.direction ||
      node.indent ||
      node.rel ||
      node.target ||
      node.title
    )
      throw new NativeTextError("This inline text property has no native form representation");

    if (node.type === "linebreak") {
      parts.push({ break: true });
      continue;
    }

    if (node.type === "link") {
      parts.push({ link: String(node.url ?? ""), content: nodesToNativeText(node.children ?? []) });
      continue;
    }

    if (node.type === "mention") {
      if (node.format || (node.mode && node.mode !== "token"))
        throw new NativeTextError("This mention style has no native form representation");
      const reference = node.$?.nativeReference;

      if (!reference || typeof reference !== "object" || Array.isArray(reference))
        throw new NativeTextError("This mention needs a native answer, value or context binding");
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Mention NodeState may contain incomplete reference data; retain it so validateFormDefinition reports the authored problem during export.
      parts.push(structuredClone(reference) as Exclude<RichText, string>[number]);
      continue;
    }

    if (node.type !== "text") throw new NativeTextError(`Unsupported rich text node: ${node.type}`);
    const format = Number(node.format ?? 0);

    if (node.mode && node.mode !== "normal")
      throw new NativeTextError("This text mode has no native form representation");

    if (format & ~31 || node.style)
      throw new NativeTextError("This text style has no native form representation");
    const text = String(node.text ?? "");

    // SAFETY: marks is the closed constant table above; Object.keys cannot introduce other mark names.
    const active = (Object.keys(marks) as (keyof typeof marks)[]).filter(
      (mark) => !!(format & marks[mark]),
    );

    if (active.length) parts.push({ text, marks: active });
    else if (typeof parts.at(-1) === "string")
      parts[parts.length - 1] = String(parts.at(-1)) + text;
    else if (text) parts.push(text);
  }

  return !parts.length ? "" : parts.length === 1 && typeof parts[0] === "string" ? parts[0] : parts;
}
