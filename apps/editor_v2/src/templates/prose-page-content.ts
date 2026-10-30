import {
  bakeStartLinkFormId,
  compileContentMarkdown,
  hideStartLinks,
  type CompiledContentMarkdown,
} from "@govtech-bb/govbbmarkd";
import { format } from "date-fns";

/** Display-only page input; the editor owns the source, history and publication. */
export type ProsePageDocument = {
  // eslint-disable-next-line anti-slop/no-unsafe-dictionary-type -- YAML is validated before the template reads display fields.
  frontmatter: Record<string, unknown>;
  body: string;
  path: string;
  breadcrumbs: Array<{ label: string; href: string }>;
  formStatus?: "available" | "unavailable" | "maintenance" | "closed";
  startSubPageVisible?: boolean;
};

type ProseNode = CompiledContentMarkdown["hast"]["children"][number];

// Legacy HTML executes beside editor credentials; parsing it is not sanitization.
function assertProseMarkup(nodes: ProseNode[]) {
  for (const node of nodes) {
    if (node.type !== "element") continue;
    if (
      [
        "script",
        "style",
        "iframe",
        "object",
        "embed",
        "link",
        "meta",
        "base",
        "form",
        "input",
        "button",
        "textarea",
        "select",
        "svg",
        "math",
      ].includes(node.tagName) ||
      Object.keys(node.properties).some(
        (key) => /^on/i.test(key) || ["style", "srcDoc", "srcSet"].includes(key),
      )
    )
      throw new Error("Site preview cannot display executable or embedded HTML.");
    assertProseMarkup(node.children);
  }
}

/** Compile the shared dialect and validate display metadata without changing the working copy. */
export function prepareProsePage(document: ProsePageDocument) {
  const text = (key: string) => {
    const value = document.frontmatter[key];
    // eslint-disable-next-line anti-slop/no-runtime-typeof -- Authored YAML is an untrusted display boundary.
    if (value !== undefined && typeof value !== "string")
      throw new Error(`Site preview metadata must be text: ${key}.`);
    return value;
  };
  const title = text("title") || "Untitled page";
  const lede = text("lede");
  const sourceUrl = text("source_url");
  const formId = text("form_id");
  if (sourceUrl && !/^https?:\/\//i.test(sourceUrl))
    throw new Error("Site preview source URL must use HTTP or HTTPS.");

  const published = document.frontmatter.publish_date;
  let publishDate: string | undefined;
  if (published !== undefined) {
    const date = new Date(String(published));
    if (Number.isNaN(date.getTime())) throw new Error("Site preview publication date is invalid.");
    publishDate = format(
      new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
      "PPP",
    );
  }

  const compiled = compileContentMarkdown(document.body, { html: "legacy", frontmatter: false });
  if (!compiled.ok) throw compiled.errors[0];
  const { hast } = compiled.value;
  assertProseMarkup(hast.children);
  bakeStartLinkFormId(hast, formId);
  hideStartLinks({
    hideStartLink:
      document.startSubPageVisible === false ||
      (formId !== undefined && document.formStatus !== "available"),
    linkedFormId: formId ?? null,
  })(hast);

  return {
    title,
    lede,
    sourceUrl,
    publishDate,
    formId,
    hast,
    breadcrumbs: document.breadcrumbs,
    formStatus: document.formStatus,
  };
}

/** Prepared prose page data contains no persistence or editor state. */
export type PreparedProsePage = ReturnType<typeof prepareProsePage>;
