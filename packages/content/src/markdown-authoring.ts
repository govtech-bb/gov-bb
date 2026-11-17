import {
  LANDING_COMPONENT_NAMES,
  parseActionDirective,
  parseDetailsDirective,
  parseStartLinkMarker,
  scanLegacyMarkdownLine,
  type LandingComponentName,
} from "@govtech-bb/govbbmarkd/legacy";

export {
  LANDING_COMPONENT_NAMES,
  escapeDirectiveAttribute,
  unescapeDirectiveAttribute,
  parseActionDirective,
  parseDetailsDirective,
  parseStartLinkMarker,
  serializeStartLinkMarker,
  serializeLandingComponent,
  type LandingComponentName,
  type LandingComponent,
  type LandingAction,
  type ActionVariant,
  type StartLinkMarker,
} from "@govtech-bb/govbbmarkd/legacy";
/** @deprecated Import the URL policy directly from @govtech-bb/govbbmarkd/content-url. */
export { isSafeContentUrl } from "@govtech-bb/govbbmarkd/content-url";

/** @deprecated Describes the old editor profiles, not the current Markdown grammar. */
export type MarkdownAuthoringProfile = "landing-page" | "form-content";

/** @deprecated Describes the old editor profiles, not the current Markdown grammar. */
export type MarkdownCompatibilityReasonCode =
  | "html-comment"
  | "specialist-component"
  | "unsupported-html"
  | "unsupported-directive"
  | "malformed-directive";

/** @deprecated Describes the old editor profiles, not the current Markdown grammar. */
export interface MarkdownCompatibilityReason {
  code: MarkdownCompatibilityReasonCode;
  message: string;
  token?: string;
}

/** @deprecated Describes the old editor profiles, not the current Markdown grammar. */
export type MarkdownCompatibility =
  | { mode: "visual"; reasons: [] }
  | { mode: "source-only"; reasons: MarkdownCompatibilityReason[] };

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

/** @deprecated Old editor capability heuristic; new editors combine parseContentMarkdown diagnostics with their own supported-node checks. */
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
    const scanned = scanLegacyMarkdownLine(rawLine);
    for (const tag of scanned.tags) {
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
      if (!isStartLink && !tag.isBreak) {
        addReason(reasons, {
          code: "unsupported-html",
          message: `The ${tag.raw} HTML tag can only be edited safely in Markdown mode.`,
          token: tag.name,
        });
      }
    }

    const name = scanned.directiveName;
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
