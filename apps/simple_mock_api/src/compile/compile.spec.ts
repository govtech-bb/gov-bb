import { readFileSync } from "node:fs";
import matter from "gray-matter";
import type { Element, Root } from "hast";
import { compilePage } from "./index.js";

type TreeNode = { type: string; position?: unknown; children?: TreeNode[] };

const SEED_PAGES = [
  "get-birth-certificate/index",
  "get-birth-certificate/start",
  "get-death-certificate/index",
  "get-death-certificate/start",
];

function readSeed(slug: string) {
  const path = new URL(`../../seed/${slug}.md`, import.meta.url);
  return matter(readFileSync(path, "utf8"));
}

function readGolden(slug: string): TreeNode {
  const name = `${slug.replace("/", "-")}.v1.json`;
  const path = new URL(`./__fixtures__/${name}`, import.meta.url);
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Deep copy without `position` data. */
function withoutPosition(node: TreeNode): TreeNode {
  const { position: _position, children, ...rest } = node;
  return children
    ? { ...rest, children: children.map(withoutPosition) }
    : { ...rest };
}

/** Deep copy without comment nodes: v1 kept authored HTML comments, the
 *  sanitizer drops them by design. */
function withoutComments(node: TreeNode): TreeNode {
  if (!node.children) return node;
  return {
    ...node,
    children: node.children
      .filter((child) => child.type !== "comment")
      .map(withoutComments),
  };
}

function nodes(node: TreeNode): TreeNode[] {
  return [node, ...(node.children ?? []).flatMap(nodes)];
}

function elements(tree: Root, tagName: string): Element[] {
  return nodes(tree as TreeNode).filter(
    (node): node is Element & TreeNode =>
      node.type === "element" && (node as Element).tagName === tagName,
  );
}

describe("compilePage parity with v1", () => {
  it.each(SEED_PAGES)("%s equals its v1 golden", async (slug) => {
    const { content, data } = readSeed(slug);
    const tree = await compilePage(content, data.form_id);
    expect(withoutPosition(tree as TreeNode)).toEqual(
      withoutPosition(withoutComments(readGolden(slug))),
    );
  });
});

describe("compilePage sanitizer", () => {
  it("strips <script> and its content", async () => {
    const tree = await compilePage(
      "Before\n\n<script>alert(1)</script>\n\nAfter",
    );
    expect(elements(tree, "script")).toHaveLength(0);
    expect(JSON.stringify(tree)).not.toContain("alert(1)");
  });

  it("drops a javascript: href", async () => {
    const tree = await compilePage('<a href="javascript:alert(1)">Click</a>');
    const [link] = elements(tree, "a");
    expect(link.properties.href).toBeUndefined();
  });

  it("keeps a tel: href", async () => {
    const tree = await compilePage("[(246) 536-3800](tel:+12465363800)");
    const [link] = elements(tree, "a");
    expect(link.properties.href).toBe("tel:+12465363800");
  });

  it("keeps data-start-link and href on a start link", async () => {
    const tree = await compilePage('<a data-start-link href="/x">Start</a>');
    const [link] = elements(tree, "a");
    expect(link.properties).toEqual({ dataStartLink: "", href: "/x" });
  });

  it("drops HTML comments", async () => {
    const tree = await compilePage("<!-- c -->\n\nText");
    expect(nodes(tree as TreeNode).some((n) => n.type === "comment")).toBe(
      false,
    );
  });

  it("keeps content elements and their allowed properties", async () => {
    const tree = await compilePage(
      '<notice>Heads up</notice>\n\n<contact label="Emergency" tel="tel:211"></contact>',
    );
    expect(elements(tree, "notice")).toHaveLength(1);
    const [contact] = elements(tree, "contact");
    expect(contact.properties).toEqual({ label: "Emergency", tel: "tel:211" });
  });

  it("removes <iframe srcdoc> and inline style", async () => {
    const tree = await compilePage(
      '<iframe srcdoc="<p>x</p>"></iframe>\n\n<p style="color: red">Red</p>',
    );
    expect(elements(tree, "iframe")).toHaveLength(0);
    const all = nodes(tree as TreeNode) as Array<TreeNode & Partial<Element>>;
    expect(all.some((n) => n.properties && "srcDoc" in n.properties)).toBe(
      false,
    );
    expect(all.some((n) => n.properties && "style" in n.properties)).toBe(
      false,
    );
  });

  it("leaves no position data on any node", async () => {
    const tree = await compilePage(
      "## Heading\n\nText with [a link](/x).\n\n| A | B |\n| - | - |\n| 1 | 2 |",
    );
    expect(nodes(tree as TreeNode).some((n) => "position" in n)).toBe(false);
  });
});

describe("compilePage start-link bake", () => {
  it("adds dataFormId to a bare start link", async () => {
    const tree = await compilePage("<a data-start-link>Start</a>", "my-form");
    const [link] = elements(tree, "a");
    expect(link.properties.dataFormId).toBe("my-form");
  });

  it("leaves a start link with an authored href alone", async () => {
    const tree = await compilePage(
      '<a data-start-link href="/x">Start</a>',
      "my-form",
    );
    const [link] = elements(tree, "a");
    expect(link.properties.dataFormId).toBeUndefined();
  });
});
