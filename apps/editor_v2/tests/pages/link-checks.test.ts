import type { SerializedLexicalNode } from "lexical";
import { expect, test } from "vitest";
import { collectInternalPageLinks } from "../../src/pages/link-checks";
import { govbbPageCodec } from "../../src/presets/govbb-page";

const pageUrl = "/family/birth-certificate/fees";

function pageState(source: string) {
  const prepared = govbbPageCodec.prepare(source);

  if (!prepared.state) throw new Error("Link check fixture must be a visual page");

  return prepared.state;
}

test.each([
  ["paragraph", "Read [the **fees**](/missing).", "the fees"],
  ["bulleted list", "- Read [the fees](/missing)", "the fees"],
  ["numbered list", "1. Read [the fees](/missing)", "the fees"],
  ["nested list", "- First\n  - Read [the fees](/missing)", "the fees"],
  ["table", "| Cost | Link |\n| --- | --- |\n| Copy | [the fees](/missing) |", "the fees"],
  ["Notice", ":::notice\nRead [the fees](/missing).\n:::", "the fees"],
  ["Details", ':::details{summary="More"}\nRead [the fees](/missing).\n:::', "the fees"],
  ["Start button", '<a data-start-link href="/missing">Start now</a>', "Start now"],
  [
    "Start button in numbered list",
    '1. Apply online\n\n   <a data-start-link href="/missing"><strong>Start</strong> now</a>\n\n2. In person',
    "Start now",
  ],
  ["action", ':::actions\n::action[Continue]{href="/missing"}\n:::', "Continue"],
])("collects a link in a %s with its text and exact node path", (_kind, source, text) => {
  const state = pageState(source);
  const links = collectInternalPageLinks(state, pageUrl);
  expect(links).toHaveLength(1);
  expect(links[0]).toMatchObject({ text, url: "/missing", target: "/missing" });

  let node: SerializedLexicalNode & { children?: SerializedLexicalNode[] } = state.root;

  for (const index of links[0]!.path) node = node.children![index]!;
  expect(node.type).toMatch(/^(link|page-component)$/);
});

test("keeps repeated destinations separate and in document order", () => {
  const links = collectInternalPageLinks(
    pageState("[First](/missing) and [Second](/missing)\n\n- [Third](/missing)"),
    pageUrl,
  );

  expect(links.map((link) => link.text)).toEqual(["First", "Second", "Third"]);
  expect(new Set(links.map((link) => link.path.join("."))).size).toBe(3);
});

test.each([
  ["/family/birth-certificate/start?from=fees#apply", "/family/birth-certificate/start"],
  ["./start", "/family/birth-certificate/start"],
  ["../help", "/family/help"],
  ["start", "/family/birth-certificate/start"],
  ["/family/birth-certificate/", "/family/birth-certificate"],
  ["https://www.gov.bb/family/birth-certificate/start", "/family/birth-certificate/start"],
  ["https://gov.bb/family/birth-certificate/start", "/family/birth-certificate/start"],
  ["http://www.gov.bb/family/birth-certificate/start", "/family/birth-certificate/start"],
  ["/", "/"],
  ["/caf%C3%A9", "/caf%C3%A9"],
])("resolves %s as a site pathname", (url, target) => {
  expect(collectInternalPageLinks(pageState(`[Go](${url})`), pageUrl)).toMatchObject([
    { url, target },
  ]);
});

test.each([
  "#section",
  "?view=print",
  "https://example.com/missing",
  "https://forms.gov.bb/apply",
  "https://www.gov.bb.example.com/missing",
  "https://www.gov.bb:8443/missing",
  "mailto:help@gov.bb",
  "tel:+12465351000",
  "irc:help",
])("does not check %s against internal pages", (url) => {
  expect(collectInternalPageLinks(pageState(`[Go](${url})`), pageUrl)).toEqual([]);
});

test("a Start button without an address opens its associated form, not a missing page", () => {
  expect(collectInternalPageLinks(pageState("<a data-start-link>Start</a>"), pageUrl)).toEqual([]);
});

test("relative links respect a page address ending in a slash", () => {
  expect(collectInternalPageLinks(pageState("[Go](start)"), `${pageUrl}/`)).toMatchObject([
    { target: `${pageUrl}/start` },
  ]);
});

test("empty link text still has an actionable label", () => {
  expect(collectInternalPageLinks(pageState("[](/missing)"), pageUrl)).toMatchObject([
    { text: "/missing" },
  ]);
});
