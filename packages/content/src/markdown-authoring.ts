import { decodeHTMLAttribute, decodeHTMLStrict, encodeXML } from "entities";

export const LANDING_COMPONENT_NAMES = [
  "notice",
  "actions",
  "details",
] as const;

export type LandingComponentName = (typeof LANDING_COMPONENT_NAMES)[number];
export type ActionVariant = "primary" | "secondary";

export interface LandingAction {
  label: string;
  href: string;
  variant: ActionVariant;
}

export type LandingComponent =
  | { kind: "notice"; body: string }
  | { kind: "actions"; actions: LandingAction[] }
  | { kind: "details"; summary: string; body: string };

export type MarkdownAuthoringProfile = "landing-page" | "form-content";

export type MarkdownCompatibilityReasonCode =
  | "html-comment"
  | "specialist-component"
  | "unsupported-html"
  | "unsupported-directive"
  | "malformed-directive";

export interface MarkdownCompatibilityReason {
  code: MarkdownCompatibilityReasonCode;
  message: string;
  token?: string;
}

export type MarkdownCompatibility =
  | { mode: "visual"; reasons: [] }
  | { mode: "source-only"; reasons: MarkdownCompatibilityReason[] };

const SAFE_PROTOCOL = /^(https?|ircs?|mailto|tel|xmpp):/i;
const EXPLICIT_PROTOCOL = /^[a-z][a-z\d+.-]*:/i;
const SPECIALIST_COMPONENTS = new Set([
  "contact",
  "contacts",
  "highlight",
  "highlights",
  "muted",
]);
const LANDING_DIRECTIVES = new Set(["action", ...LANDING_COMPONENT_NAMES]);

function isLandingComponentName(value: string): value is LandingComponentName {
  return (LANDING_COMPONENT_NAMES as readonly string[]).includes(value);
}

function isAsciiLetter(character: string | undefined): boolean {
  if (!character) return false;
  const code = character.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isAsciiDigit(character: string | undefined): boolean {
  if (!character) return false;
  const code = character.charCodeAt(0);
  return code >= 48 && code <= 57;
}

function isWhitespace(character: string | undefined): boolean {
  return (
    character === " " ||
    character === "\t" ||
    character === "\n" ||
    character === "\r" ||
    character === "\f"
  );
}

function isNameCharacter(character: string | undefined): boolean {
  return (
    isAsciiLetter(character) ||
    isAsciiDigit(character) ||
    character === "_" ||
    character === "-"
  );
}

function skipWhitespace(source: string, start: number): number {
  let cursor = start;
  while (isWhitespace(source[cursor])) cursor += 1;
  return cursor;
}

function readEscapedUntil(
  source: string,
  start: number,
  terminator: string,
): { raw: string; end: number } | null {
  let cursor = start;
  while (cursor < source.length) {
    if (source[cursor] === "\\") {
      if (cursor + 1 >= source.length) return null;
      cursor += 2;
      continue;
    }
    if (source[cursor] === terminator) {
      return { raw: source.slice(start, cursor), end: cursor };
    }
    cursor += 1;
  }
  return null;
}

function parseDirectiveAttributes(source: string): Map<string, string> | null {
  const attributes = new Map<string, string>();
  let cursor = 0;

  while (cursor < source.length) {
    cursor = skipWhitespace(source, cursor);
    if (cursor >= source.length) break;
    if (!isAsciiLetter(source[cursor])) return null;

    const nameStart = cursor;
    cursor += 1;
    while (isNameCharacter(source[cursor])) cursor += 1;
    const name = source.slice(nameStart, cursor).toLowerCase();
    cursor = skipWhitespace(source, cursor);
    if (source[cursor] !== "=") return null;
    cursor = skipWhitespace(source, cursor + 1);
    if (source[cursor] !== '"') return null;

    const value = readEscapedUntil(source, cursor + 1, '"');
    if (!value || attributes.has(name)) return null;
    attributes.set(name, unescapeDirectiveAttribute(value.raw));
    cursor = value.end + 1;
    if (cursor < source.length && !isWhitespace(source[cursor])) return null;
  }

  return attributes;
}

function unescapeDirectiveLabel(value: string): string {
  let result = "";
  for (let cursor = 0; cursor < value.length; cursor += 1) {
    const character = value[cursor];
    const next = value[cursor + 1];
    if (character === "\\" && (next === "\\" || next === "]")) {
      result += next;
      cursor += 1;
    } else {
      result += character;
    }
  }
  return result;
}

export function parseActionDirective(line: string): LandingAction | null {
  const source = line.trim();
  const prefix = "::action[";
  if (source.slice(0, prefix.length).toLowerCase() !== prefix) return null;

  const labelSection = readEscapedUntil(source, prefix.length, "]");
  if (!labelSection || source[labelSection.end + 1] !== "{") return null;
  if (source.at(-1) !== "}") return null;

  const attributes = parseDirectiveAttributes(
    source.slice(labelSection.end + 2, -1),
  );
  if (!attributes) return null;
  if (
    [...attributes.keys()].some((name) => name !== "href" && name !== "variant")
  ) {
    return null;
  }

  const label = unescapeDirectiveLabel(labelSection.raw).trim();
  const href = attributes.get("href")?.trim() ?? "";
  const variant = attributes.get("variant") ?? "primary";
  if (
    !label ||
    !href ||
    !isSafeContentUrl(href) ||
    (variant !== "primary" && variant !== "secondary")
  ) {
    return null;
  }

  return { label, href, variant };
}

export function parseDetailsDirective(line: string): string | null {
  const source = line.trim();
  const prefix = ":::details{";
  if (source.slice(0, prefix.length).toLowerCase() !== prefix) return null;
  if (source.at(-1) !== "}") return null;

  const attributes = parseDirectiveAttributes(source.slice(prefix.length, -1));
  if (!attributes || attributes.size !== 1) return null;
  const summary = attributes.get("summary")?.trim() ?? "";
  return summary || null;
}

type HtmlAttributeValue = string | null;

function parseHtmlAttributes(
  source: string,
): Map<string, HtmlAttributeValue> | null {
  const attributes = new Map<string, HtmlAttributeValue>();
  let cursor = 0;

  while (cursor < source.length) {
    cursor = skipWhitespace(source, cursor);
    if (cursor >= source.length) break;
    if (!isAsciiLetter(source[cursor])) return null;

    const nameStart = cursor;
    cursor += 1;
    while (isNameCharacter(source[cursor]) || source[cursor] === ":") {
      cursor += 1;
    }
    const name = source.slice(nameStart, cursor).toLowerCase();
    if (attributes.has(name)) return null;
    const afterName = cursor;
    cursor = skipWhitespace(source, cursor);

    let value: HtmlAttributeValue = null;
    if (source[cursor] === "=") {
      cursor = skipWhitespace(source, cursor + 1);
      const quote = source[cursor];
      if (quote === '"' || quote === "'") {
        const valueStart = cursor + 1;
        const valueEnd = source.indexOf(quote, valueStart);
        if (valueEnd < 0) return null;
        value = source.slice(valueStart, valueEnd);
        cursor = valueEnd + 1;
      } else {
        const valueStart = cursor;
        while (cursor < source.length && !isWhitespace(source[cursor])) {
          const character = source[cursor];
          if (
            character === '"' ||
            character === "'" ||
            character === "<" ||
            character === "=" ||
            character === "`"
          ) {
            return null;
          }
          cursor += 1;
        }
        if (cursor === valueStart) return null;
        value = source.slice(valueStart, cursor);
      }
    } else {
      cursor = afterName;
    }

    attributes.set(name, value);
    if (cursor < source.length && !isWhitespace(source[cursor])) return null;
  }

  return attributes;
}

function findTagEnd(source: string, start: number): number {
  let quote: '"' | "'" | null = null;
  for (let cursor = start; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    if (quote) {
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return cursor;
    }
  }
  return -1;
}

export interface StartLinkMarker {
  label: string;
  href: string;
}

export function parseStartLinkMarker(line: string): StartLinkMarker | null {
  const source = line.trim();
  if (source.slice(0, 2).toLowerCase() !== "<a") return null;
  if (!isWhitespace(source[2])) return null;

  const openingEnd = findTagEnd(source, 2);
  if (openingEnd < 0 || source.slice(-4).toLowerCase() !== "</a>") return null;
  const labelSource = source.slice(openingEnd + 1, -4);
  if (labelSource.includes("<")) return null;

  const attributes = parseHtmlAttributes(source.slice(2, openingEnd));
  if (!attributes || !attributes.has("data-start-link")) return null;
  if (
    [...attributes.keys()].some(
      (name) => name !== "data-start-link" && name !== "href",
    )
  ) {
    return null;
  }
  const markerValue = attributes.get("data-start-link");
  if (markerValue !== null && markerValue !== "") return null;

  const label = decodeHTMLStrict(labelSource);
  const hrefSource = attributes.get("href");
  const href =
    hrefSource === null || hrefSource === undefined
      ? ""
      : decodeHTMLAttribute(hrefSource).trim();
  if (!label.trim() || (href && !isSafeContentUrl(href))) return null;
  return { label, href };
}

export function serializeStartLinkMarker({
  label,
  href,
}: StartLinkMarker): string {
  const hrefAttribute = href ? ` href="${encodeXML(href.trim())}"` : "";
  return `<a data-start-link${hrefAttribute}>${encodeXML(label)}</a>`;
}

function directiveName(line: string): string | null {
  const source = line.trimStart();
  let cursor = 0;
  while (cursor < 3 && source[cursor] === ":") cursor += 1;
  if (cursor === 0 || source[cursor] === ":") return null;
  if (!isAsciiLetter(source[cursor])) return null;

  const start = cursor;
  cursor += 1;
  while (isNameCharacter(source[cursor])) cursor += 1;
  return source.slice(start, cursor).toLowerCase();
}

interface ScannedHtmlTag {
  name: string;
  raw: string;
}

function htmlTags(line: string): ScannedHtmlTag[] {
  const tags: ScannedHtmlTag[] = [];
  let cursor = 0;
  while (cursor < line.length) {
    const start = line.indexOf("<", cursor);
    if (start < 0) break;
    let nameStart = start + 1;
    if (line[nameStart] === "/") nameStart += 1;
    if (!isAsciiLetter(line[nameStart])) {
      cursor = start + 1;
      continue;
    }

    let nameEnd = nameStart + 1;
    while (isNameCharacter(line[nameEnd])) nameEnd += 1;
    const boundary = line[nameEnd];
    if (boundary !== ">" && boundary !== "/" && !isWhitespace(boundary)) {
      cursor = start + 1;
      continue;
    }
    const tagEnd = findTagEnd(line, nameEnd);
    tags.push({
      name: line.slice(nameStart, nameEnd).toLowerCase(),
      raw: line.slice(start, tagEnd < 0 ? line.length : tagEnd + 1),
    });
    cursor = tagEnd < 0 ? line.length : tagEnd + 1;
  }
  return tags;
}

function isSafeBreakTag(rawTag: string): boolean {
  if (!rawTag.endsWith(">")) return false;
  const inner = rawTag.slice(1, -1).trim();
  if (inner.slice(0, 2).toLowerCase() !== "br") return false;
  const remainder = inner.slice(2).trim();
  return remainder === "" || remainder === "/";
}

export function isSafeContentUrl(value: string): boolean {
  const url = value.trim();
  const hasControlCharacter = [...url].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
  if (!url || hasControlCharacter) return false;
  return !EXPLICIT_PROTOCOL.test(url) || SAFE_PROTOCOL.test(url);
}

export function escapeDirectiveAttribute(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

export function unescapeDirectiveAttribute(value: string): string {
  let result = "";
  for (let cursor = 0; cursor < value.length; cursor += 1) {
    const character = value[cursor];
    const next = value[cursor + 1];
    if (character === "\\" && (next === "\\" || next === '"')) {
      result += next;
      cursor += 1;
    } else {
      result += character;
    }
  }
  return result;
}

export function serializeLandingComponent(component: LandingComponent): string {
  if (component.kind === "notice") {
    return `:::notice\n${component.body.trim()}\n:::`;
  }

  if (component.kind === "details") {
    const summary = escapeDirectiveAttribute(component.summary.trim());
    return `:::details{summary="${summary}"}\n${component.body.trim()}\n:::`;
  }

  const actions = component.actions
    .map(({ href, label, variant }) => {
      const attributes = [
        `href="${escapeDirectiveAttribute(href.trim())}"`,
        variant === "secondary" ? 'variant="secondary"' : "",
      ]
        .filter(Boolean)
        .join(" ");
      const safeLabel = label
        .trim()
        .replaceAll("\\", "\\\\")
        .replaceAll("]", "\\]");
      return `::action[${safeLabel}]{${attributes}}`;
    })
    .join("\n");
  return `:::actions\n${actions}\n:::`;
}

function addReason(
  reasons: MarkdownCompatibilityReason[],
  reason: MarkdownCompatibilityReason,
): void {
  if (
    !reasons.some(
      ({ code, token }) => code === reason.code && token === reason.token,
    )
  ) {
    reasons.push(reason);
  }
}

export function analyzeMarkdownCompatibility(
  markdown: string,
  profile: MarkdownAuthoringProfile,
): MarkdownCompatibility {
  const reasons: MarkdownCompatibilityReason[] = [];
  let inFence = false;
  const markdownLinesOutsideCode = markdown.split("\n").map((line) => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      return "";
    }
    return inFence ? "" : line;
  });
  const markdownOutsideCode = markdownLinesOutsideCode.join("\n");

  if (markdownOutsideCode.includes("<!--")) {
    addReason(reasons, {
      code: "html-comment",
      message: "HTML comments can only be edited safely in Markdown mode.",
    });
  }

  let openDirective: LandingComponentName | null = null;
  let actionCount = 0;
  for (const rawLine of markdownLinesOutsideCode) {
    const line = rawLine.trim();
    const startLink = parseStartLinkMarker(rawLine);
    for (const tag of htmlTags(rawLine)) {
      if (profile === "form-content") {
        addReason(reasons, {
          code: "unsupported-html",
          message: `The <${tag.name}> HTML tag is not supported by form content.`,
          token: tag.name,
        });
        continue;
      }

      if (SPECIALIST_COMPONENTS.has(tag.name)) {
        addReason(reasons, {
          code: "specialist-component",
          message: `The <${tag.name}> component is currently edited in Markdown mode.`,
          token: tag.name,
        });
        continue;
      }

      const isStartLink = tag.name === "a" && startLink !== null;
      if (!isStartLink && !(tag.name === "br" && isSafeBreakTag(tag.raw))) {
        addReason(reasons, {
          code: "unsupported-html",
          message: `The <${tag.name}> HTML tag can only be edited safely in Markdown mode.`,
          token: tag.name,
        });
      }
    }

    const name = directiveName(line);
    if (name && (profile !== "landing-page" || !LANDING_DIRECTIVES.has(name))) {
      addReason(reasons, {
        code: "unsupported-directive",
        message: `The ::${name} directive is not available in this editor.`,
        token: name,
      });
    }

    if (!line.startsWith("::")) {
      if (openDirective === "actions" && line) {
        addReason(reasons, {
          code: "malformed-directive",
          message: "Action groups can only contain ::action components.",
          token: "actions",
        });
      }
      continue;
    }

    if (line === ":::") {
      if (openDirective === null) {
        addReason(reasons, {
          code: "malformed-directive",
          message: "A component block has an unexpected closing ::: marker.",
        });
      }
      if (openDirective === "actions" && actionCount === 0) {
        addReason(reasons, {
          code: "malformed-directive",
          message: "An action group needs at least one ::action component.",
          token: "actions",
        });
      }
      openDirective = null;
      actionCount = 0;
      continue;
    }

    if (line.startsWith(":::")) {
      if (!name || !LANDING_DIRECTIVES.has(name)) continue;
      if (openDirective !== null) {
        addReason(reasons, {
          code: "malformed-directive",
          message: "Component blocks cannot be nested.",
          token: name,
        });
        continue;
      }
      if (!isLandingComponentName(name)) {
        addReason(reasons, {
          code: "malformed-directive",
          message: "::action must be inside an :::actions component.",
          token: "action",
        });
        continue;
      }
      const validStart =
        line.toLowerCase() === ":::notice" ||
        line.toLowerCase() === ":::actions" ||
        parseDetailsDirective(line) !== null;
      if (!validStart) {
        addReason(reasons, {
          code: "malformed-directive",
          message: `The :::${name} component has invalid attributes.`,
          token: name,
        });
      }
      openDirective = name;
      actionCount = 0;
      continue;
    }

    if (line.slice(0, 8).toLowerCase() === "::action") {
      const action = parseActionDirective(line);
      if (openDirective !== "actions" || !action) {
        addReason(reasons, {
          code: "malformed-directive",
          message:
            "Action components need a safe href and must be inside an action group.",
          token: "action",
        });
      } else {
        actionCount += 1;
      }
    }
  }

  if (openDirective !== null) {
    addReason(reasons, {
      code: "malformed-directive",
      message: "A component block is missing its closing ::: marker.",
    });
  }

  return reasons.length > 0
    ? { mode: "source-only", reasons }
    : { mode: "visual", reasons: [] };
}
