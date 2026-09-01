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
const HTML_TAG = /<\/?([a-z][\w-]*)(?:\s[^<>]*?)?\s*\/?>/gi;
const DIRECTIVE_START = /^\s*:{1,3}([a-z][\w-]*)\b/gim;
const SPECIALIST_COMPONENTS = new Set([
  "contact",
  "contacts",
  "highlight",
  "highlights",
  "muted",
]);
const LANDING_DIRECTIVES = new Set(["action", ...LANDING_COMPONENT_NAMES]);
const DETAILS_DIRECTIVE = /^:::details\{\s*summary="(?:\\.|[^"\\])*"\s*\}\s*$/i;
const ACTION_DIRECTIVE = /^::action\[(?:\\.|[^\]\\])*\]\{\s*([^}]*)\}\s*$/i;
const DIRECTIVE_ATTRIBUTE = /([a-z][\w-]*)="((?:\\.|[^"\\])*)"/gi;
const START_LINK_LINE =
  /^\s*<a\s+(?=[^>]*\bdata-start-link\b)[^>]*>[^<]*<\/a>\s*$/gim;

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
  return value.replace(/\\([\\"])/g, "$1");
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
      return `::action[${label.trim().replaceAll("]", "\\]")}]{${attributes}}`;
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
  const markdownOutsideCode = markdown
    .split("\n")
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return "";
      }
      return inFence ? "" : line;
    })
    .join("\n");
  const startLinkRanges = [
    ...markdownOutsideCode.matchAll(START_LINK_LINE),
  ].map((match) => [match.index, match.index + match[0].length] as const);

  if (markdownOutsideCode.includes("<!--")) {
    addReason(reasons, {
      code: "html-comment",
      message: "HTML comments can only be edited safely in Markdown mode.",
    });
  }

  for (const match of markdownOutsideCode.matchAll(HTML_TAG)) {
    const tag = match[1].toLowerCase();

    if (profile === "form-content") {
      addReason(reasons, {
        code: "unsupported-html",
        message: `The <${tag}> HTML tag is not supported by form content.`,
        token: tag,
      });
      continue;
    }

    if (SPECIALIST_COMPONENTS.has(tag)) {
      addReason(reasons, {
        code: "specialist-component",
        message: `The <${tag}> component is currently edited in Markdown mode.`,
        token: tag,
      });
      continue;
    }

    const isStartLink =
      tag === "a" &&
      startLinkRanges.some(
        ([start, end]) => match.index >= start && match.index < end,
      );
    if (!isStartLink && tag !== "br") {
      addReason(reasons, {
        code: "unsupported-html",
        message: `The <${tag}> HTML tag can only be edited safely in Markdown mode.`,
        token: tag,
      });
    }
  }

  for (const match of markdownOutsideCode.matchAll(DIRECTIVE_START)) {
    const name = match[1].toLowerCase();
    if (profile !== "landing-page" || !LANDING_DIRECTIVES.has(name)) {
      addReason(reasons, {
        code: "unsupported-directive",
        message: `The ::${name} directive is not available in this editor.`,
        token: name,
      });
    }
  }

  let openDirective: LandingComponentName | null = null;
  let actionCount = 0;
  for (const rawLine of markdownOutsideCode.split("\n")) {
    const line = rawLine.trim();
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
      const name = line.match(/^:::([a-z][\w-]*)/i)?.[1]?.toLowerCase();
      if (!name || !LANDING_DIRECTIVES.has(name)) continue;
      if (openDirective !== null) {
        addReason(reasons, {
          code: "malformed-directive",
          message: "Component blocks cannot be nested.",
          token: name,
        });
        continue;
      }
      const validStart =
        line === ":::notice" ||
        line === ":::actions" ||
        DETAILS_DIRECTIVE.test(line);
      if (!validStart) {
        addReason(reasons, {
          code: "malformed-directive",
          message: `The :::${name} component has invalid attributes.`,
          token: name,
        });
      }
      openDirective = name as LandingComponentName;
      actionCount = 0;
      continue;
    }

    if (line.startsWith("::action")) {
      const actionMatch = line.match(ACTION_DIRECTIVE);
      const attributes = actionMatch
        ? [...actionMatch[1].matchAll(DIRECTIVE_ATTRIBUTE)]
        : [];
      const attributeRemainder = actionMatch
        ? actionMatch[1].replace(DIRECTIVE_ATTRIBUTE, "").trim()
        : "";
      const attributeNames = attributes.map(([, name]) => name.toLowerCase());
      const href = attributes.find(
        ([, name]) => name.toLowerCase() === "href",
      )?.[2];
      const variant = attributes.find(
        ([, name]) => name.toLowerCase() === "variant",
      )?.[2];
      const hasInvalidAttributes =
        Boolean(attributeRemainder) ||
        attributeNames.some((name) => name !== "href" && name !== "variant") ||
        new Set(attributeNames).size !== attributeNames.length;
      if (
        openDirective !== "actions" ||
        !actionMatch ||
        hasInvalidAttributes ||
        !href ||
        !isSafeContentUrl(unescapeDirectiveAttribute(href)) ||
        (variant !== undefined &&
          variant !== "primary" &&
          variant !== "secondary")
      ) {
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
