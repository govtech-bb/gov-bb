import type { ServiceEntity } from "@govtech-bb/content";

interface CodePage {
  slug: string;
  url: string;
  title: string;
  description: string;
}

// Code-driven landing pages: their content is data-bound (computed from
// datasets) and/or interactive, so they stay `.tsx` rather than becoming
// markdown. But their rendered prose still needs to be answerable by chat, so
// we ingest the text of each page's rendered <main> (render-output ingest,
// #1519). Add a page here when a .tsx route carries answerable content.
const CODE_PAGES: CodePage[] = [
  {
    slug: "find-an-emergency-shelter",
    url: "health-and-emergency-services/find-an-emergency-shelter",
    title: "Find an emergency shelter",
    description:
      "Search emergency shelters in Barbados to use during a hurricane or tropical storm.",
  },
  {
    slug: "find-an-emergency-shelter/guidance",
    url: "health-and-emergency-services/find-an-emergency-shelter/guidance",
    title: "Before you go to a shelter",
    description:
      "What to bring, shelter rules, accessibility, the entry protocol, hurricane terms and emergency phone numbers.",
  },
];

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#x27;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&mdash;": "—",
  "&ndash;": "–",
  "&ldquo;": "“",
  "&rdquo;": "”",
  "&hellip;": "…",
};

/**
 * Reduce a page's rendered HTML to its `<main>` text. Headings are kept as ATX
 * markers (`## …`) and block elements become line breaks, so the existing
 * heading-split chunker carves the page into per-section chunks rather than one
 * monolith.
 */
export function htmlToText(html: string): string {
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? html;
  return main
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(
      /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi,
      (_m, lvl, txt) =>
        `\n${"#".repeat(Number(lvl))} ${txt
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()}\n`,
    )
    .replace(/<\/(p|li|div|section|tr|dt|dd)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n\s*\n+ */g, "\n\n")
    .replace(/\n +/g, "\n")
    .trim();
}

/**
 * Fetch each code-driven page's rendered HTML from a running/deployed landing
 * site and return its `<main>` text as a service entity, so the ingest embeds
 * it exactly like a markdown page. The page itself stays `.tsx`.
 */
export async function loadCodePages(baseUrl: string): Promise<ServiceEntity[]> {
  const base = baseUrl.replace(/\/+$/, "");
  const out: ServiceEntity[] = [];
  for (const p of CODE_PAGES) {
    const url = `${base}/${p.url}`;
    let res: Response;
    try {
      res = await fetch(url);
    } catch (err) {
      console.warn(
        `[code-pages] ${url}: fetch failed (${String(err)}), skipping`,
      );
      continue;
    }
    if (!res.ok) {
      console.warn(`[code-pages] ${url}: HTTP ${res.status}, skipping`);
      continue;
    }
    const body = htmlToText(await res.text());
    if (!body) {
      console.warn(`[code-pages] ${url}: empty rendered body, skipping`);
      continue;
    }
    out.push({
      slug: p.slug,
      title: p.title,
      description: p.description,
      body,
      filePath: url,
      visibility: "public",
      forms: [],
    });
  }
  return out;
}
