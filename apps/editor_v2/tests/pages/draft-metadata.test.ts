import { readFileSync, readdirSync } from "node:fs";
import type { SerializedEditorState } from "lexical";
import { expect, test } from "vitest";
import { draftPageMetadata, readPageMetadata } from "../../src/pages";
import { govbbPageCodec } from "../../src/presets/govbb-page";

const page = [
  "---",
  'title: "Renew a passport"',
  "url: /travel/renew-a-passport",
  "visibility: preview",
  "categories:",
  "  - travel",
  "---",
  "",
  "Apply online or at the Immigration Department.",
  "",
].join("\n");

function visual(source: string) {
  const prepared = govbbPageCodec.prepare(source);

  if (prepared.mode === "source") throw new Error("Expected a page the visual editor opens");

  return prepared.state;
}

/** The state with its page-metadata node's YAML replaced, as a change to the page's settings would. */
function withYaml(state: SerializedEditorState, yaml: string) {
  const node = state.root.children.find((child) => child.type === "page-metadata");

  if (!node) throw new Error("Expected the page's metadata node");
  Object.assign(node, { yaml });

  return state;
}

test("a draft's metadata comes from its editor state, the same as reading its Markdown", () => {
  const state = withYaml(
    visual(page),
    'title: "Renew a passport online"\nurl: /travel/renew\nvisibility: public\n',
  );

  const committed = govbbPageCodec.encode(state);

  expect(draftPageMetadata({ state, committed })).toEqual(readPageMetadata(committed));
  expect(draftPageMetadata({ state, committed })).toMatchObject({
    title: "Renew a passport online",
    url: "/travel/renew",
    visibility: "public",
  });
});

test("the Markdown is read when there's no state, or the state can be ahead of it", () => {
  // A state that differs from its Markdown, to tell which was read
  const ahead = withYaml(visual(page), 'title: "Not saved"\n');

  expect(draftPageMetadata({ state: ahead, committed: page }).title).toBe("Not saved");
  // No state, as for a page that opens as source
  expect(draftPageMetadata({ committed: page }).title).toBe("Renew a passport");
  // A change the editor couldn't convert leaves the state ahead of the Markdown
  expect(
    draftPageMetadata({ state: ahead, committed: page, recovery: { kind: "canvas", original: "" } })
      .title,
  ).toBe("Renew a passport");
});

test("every landing page's metadata reads the same from its editor state as from its Markdown", () => {
  const directory = new URL("../../../landing/src/content/", import.meta.url);
  let compared = 0;

  for (const path of readdirSync(directory, { recursive: true, encoding: "utf8" })) {
    if (!path.endsWith(".md")) continue;
    const source = readFileSync(new URL(path, directory), "utf8");
    const prepared = govbbPageCodec.prepare(source);

    if (prepared.mode === "source") continue;
    const committed = govbbPageCodec.encode(prepared.state);

    expect(draftPageMetadata({ state: prepared.state, committed }), path).toEqual(
      readPageMetadata(committed),
    );
    compared++;
  }

  expect(compared).toBeGreaterThan(10);
});
