import { readFile } from "node:fs/promises";
import { serializedNodes, jsonSettings } from "../helpers/serialized-test-data";
import { createEditor } from "../helpers/default-form";
import { expect, test } from "vitest";
import { LinkNode, $createLinkNode } from "@lexical/link";
import { HeadingNode } from "@lexical/rich-text";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  type SerializedEditorState,
} from "lexical";
import {
  fromEditor,
  readMarkdown,
  writeMarkdown,
  toEditor,
  remapKnownSettings,
} from "../helpers/default-form";
import { $legacyDemo as $demo } from "../helpers/legacy-demo";
import { MentionNode } from "../../src/forms/features/mentions/node";
import {
  $ensureBlockIds,
  $ensureQuestionFields,
  $normalizePages,
  $shareQuestionSettings,
} from "../../src/forms/editor/nodes";
import { formNodes } from "../helpers/default-form";
import { type Settings } from "../../src/editor/core/settings";
import { $normalizePageHeads } from "../../src/forms/features/pages/headings";
import { $normalizeDepths } from "../../src/forms/editor/nesting";
import { compileForm, preflight } from "../helpers/default-form";
import { closingWorks } from "../../src/forms/core/closing";

const editor = () =>
  createEditor({
    nodes: [...formNodes, HeadingNode, LinkNode, MentionNode],
    onError: (error) => {
      throw error;
    },
  });

const demo = () => {
  const e = editor();
  e.update(
    () => {
      $demo();
      const root = $getRoot();
      $normalizePageHeads(root);
      $normalizeDepths(root);
      $shareQuestionSettings(root);
      $ensureBlockIds(root);
      $ensureQuestionFields(root);
      $normalizePages(root);
    },
    { discrete: true },
  );

  return e;
};

const source = (body: string, front = "") =>
  `---\nformat: govbb-form\nformatVersion: 2\ntitle: "Test form"\n${front}---\n\n# About you\n\n${body}\n`;

const read = (text: string) => {
  const result = readMarkdown(text);
  expect(result.diagnostics.filter((d) => d.severity === "fatal")).toEqual([]);

  return result.document!;
};

const hydrate = (text: string) => {
  const e = editor();
  e.setEditorState(e.parseEditorState(toEditor(read(text))));

  return e;
};

const editableText = (state: SerializedEditorState) =>
  serializedNodes(state).map((raw) => {
    return {
      type: raw.type,
      kind: raw.kind,
      tag: raw.tag,
      id: raw.$?.id,
      depth: raw.$?.depth,
      children: raw.children,
    };
  });

test("the historical demo Markdown survives actual editor hydration", async () => {
  const reviewed = read(
    await readFile(new URL("../fixtures/forms/demo.canonical.md", import.meta.url), "utf8"),
  );

  expect(reviewed.pages).toHaveLength(6);
  const e = demo();
  const document = fromEditor(e.getEditorState().toJSON());
  const markdown = writeMarkdown(document);
  expect(document.formatVersion).toBe(2);
  expect(markdown).toContain(":::logic");
  const reopened = hydrate(markdown);
  expect(preflight(compileForm(reopened.getEditorState()))).toEqual([]);
  expect(writeMarkdown(fromEditor(reopened.getEditorState().toJSON()))).toBe(markdown);
  const compiled = compileForm(reopened.getEditorState());
  expect(compiled.pages.flatMap((p) => p.blocks).filter((b) => b.type === "question")).toHaveLength(
    13,
  );
});

test("the reader rejects malformed or lossy source without losing original bytes", () => {
  for (const input of [
    "",
    source(":::show-hide[Open]\nMissing close"),
    source("::text[A]{#same}\n\n::text[B]{#same}"),
    source("<script>bad</script>"),
    source("text", "title: duplicate\n"),
    source("text").replace("formatVersion: 2", "formatVersion: 3"),
    source("::unknown[A]"),
    source("# Unexpected page"),
  ]) {
    const result = readMarkdown(input);
    expect(result.document).toBeUndefined();
    expect(result.original).toBe(input);
    expect(result.diagnostics[0]?.severity).toBe("fatal");
    expect(result.diagnostics[0]?.line).toBeGreaterThan(0);
  }
});

test("choice followups and nested show/hide retain structure around blank lines and page fences", () => {
  const document = read(
    source(
      "::multiple-choice[Continue?]{#continue required}\n- Yes\n\n  :::show-hide[Details]\n\n  A literal \\--- line.\n\n  ::text[Why?]{#why}\n\n  :::\n\n- No\n\n---\n\n# Next page",
    ),
  );

  expect(document.pages).toHaveLength(2);
  const q = document.pages[0]!.blocks[0]!;
  expect(q.type === "question" && q.options?.[0]?.blocks[0]).toMatchObject({ kind: "show-hide" });
  expect(read(writeMarkdown(document))).toEqual(document);
});

test("draft raw values, errors, preset removals and unknown frontmatter remain exact", () => {
  const document = read(
    source(
      '::text[ID]{#id preset="national-id-number" required="false"}\n::error{rule="required" message=""}',
      'formId: ""\nfuture: {"zero":0,"no":false,"nothing":null}\n',
    ),
  );

  const q = document.pages[0]!.blocks[0]!;

  if (q.type !== "question") throw Error();
  delete q.settings.mask;
  q.settings.future = { no: false, zero: 0, empty: "", null: null };
  const roundtrip = read(writeMarkdown(document));
  expect(roundtrip.settings.formId).toBe("");
  expect(roundtrip.unknown).toEqual(document.unknown);
  expect(roundtrip.pages[0]!.blocks[0]).toEqual(q);
});

test("logic keeps unfinished rows and exact invalid expressions; remapping is schema-aware", () => {
  const payload = {
    calculatedFields: [
      { id: "unfinished", name: "" },
      { id: "zero", name: "Zero", type: "NUMBER", value: 0 },
    ],
  };

  const logic: Settings = {
    logicalOperator: "AND",
    conditionals: [{ id: "c", type: "SINGLE" }],
    actions: [
      { id: "a" },
      {
        id: "b",
        type: "CALCULATE",
        calculate: { field: "totals:zero", expression: "{{count}} + (", operator: "FORMULA" },
      },
    ],
    untouched: "count",
  };

  const document = read(
    source(
      `::number[Count]{#count}\n\n:::calculated-fields{#totals}\n\`\`\`json\n${JSON.stringify(payload)}\n\`\`\`\n:::\n\n:::logic{#rule}\n\`\`\`json\n${JSON.stringify(logic)}\n\`\`\`\n:::`,
    ),
  );

  const second = read(writeMarkdown(document));
  expect(second).toEqual(document);

  const mapped = remapKnownSettings(
    logic,
    new Map([
      ["count", "new-count"],
      ["totals", "new-totals"],
    ]),
  );

  expect(mapped.untouched).toBe("count");
  expect(JSON.stringify(mapped)).toContain("{{new-count}} + (");
  expect(JSON.stringify(mapped)).toContain("new-totals:zero");
});

test("wording actions remap targets while literal choice values and replacement text stay exact", () => {
  const settings: Settings = {
    conditionals: [
      { id: "option", type: "SINGLE", field: "choice", comparison: "IS", value: "old-option" },
      {
        id: "literal",
        type: "SINGLE",
        field: "choice",
        comparison: "IS",
        value: "old-option",
        valueIsLiteral: true,
      },
      {
        id: "literal-list",
        type: "SINGLE",
        field: "choice",
        comparison: "IS_ANY_OF",
        value: ["old-option"],
        valueIsLiteral: true,
      },
    ],
    actions: [
      {
        id: "label",
        type: "CHANGE_LABEL",
        changeLabel: { target: "old-question", text: "old-question" },
      },
      {
        id: "title",
        type: "CHANGE_PAGE_TITLE",
        changePageTitle: { target: "old-page", text: "old-page" },
      },
    ],
  };

  const mapped = remapKnownSettings(
    settings,
    new Map([
      ["choice", "new-choice"],
      ["old-question", "new-question"],
      ["old-page", "new-page"],
    ]),
    { choiceFields: new Set(["choice"]), optionAliases: new Map([["old-option", "new-option"]]) },
  );

  expect(mapped.conditionals).toEqual([
    { id: "option", type: "SINGLE", field: "new-choice", comparison: "IS", value: "new-option" },
    {
      id: "literal",
      type: "SINGLE",
      field: "new-choice",
      comparison: "IS",
      value: "old-option",
      valueIsLiteral: true,
    },
    {
      id: "literal-list",
      type: "SINGLE",
      field: "new-choice",
      comparison: "IS_ANY_OF",
      value: ["old-option"],
      valueIsLiteral: true,
    },
  ]);
  expect(mapped.actions).toEqual([
    {
      id: "label",
      type: "CHANGE_LABEL",
      changeLabel: { target: "new-question", text: "old-question" },
    },
    {
      id: "title",
      type: "CHANGE_PAGE_TITLE",
      changePageTitle: { target: "new-page", text: "old-page" },
    },
  ]);
});

test("version 2 rejects inactive legacy wording and conflicting internal version settings", () => {
  const values = [
    { questions: { name: { settings: { conditionalLabel: [] } } } },
    {
      pages: {
        "page-1": {
          title: { settings: { conditionalTitle: [{ field: "missing", text: "Retain me" }] } },
        },
      },
    },
    { nodes: { "page-1/2": { settings: { conditionalLabel: { future: true } } } } },
    { pages: { "page-1": { settings: { logicVersion: 1 } } } },
    { pages: { "page-1": { start: { settings: { logicVersion: 1 } } } } },
  ];

  for (const value of values) {
    const text = source(
      `::text[Name]{#name}\n\nA note.\n\n:::source-state\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\`\n:::`,
    );

    const parsed = readMarkdown(text);
    expect(parsed.document).toBeUndefined();
    expect(parsed.original).toBe(text);
    expect(parsed.diagnostics[0]?.severity).toBe("fatal");
  }
});

test("inline marks, links, hard breaks, code ticks, mentions and style survive hydration", () => {
  const e = demo();
  e.update(
    () =>
      $getRoot().append(
        $createParagraphNode().append(
          $createTextNode(" both ").setFormat(3),
          $createTextNode(" ticks`here ").setFormat(16),
          $createTextNode("underlined").setFormat(8).setStyle("color: red"),
          $createLinkNode("https://example.test/a(b)", {
            target: "_blank",
            rel: "noopener",
          }).append($createTextNode("Link")),
        ),
      ),
    { discrete: true },
  );
  const markdown = writeMarkdown(fromEditor(e.getEditorState().toJSON()));
  const reopened = hydrate(markdown);
  expect(writeMarkdown(fromEditor(reopened.getEditorState().toJSON()))).toBe(markdown);
});

test("closing dates reject impossible calendar dates and times without normalization", () => {
  for (const value of [
    "2024-02-29T12:30:00-04:00",
    "2000-02-29T23:59Z",
    "2026-10-04T12:00:01.250+02:30",
  ])
    expect(closingWorks(value)).toBe(true);

  for (const value of [
    "2025-02-29T12:30Z",
    "2026-02-30T12:00Z",
    "1900-02-29T12:00Z",
    "2026-10-04T24:00Z",
    "2026-10-04T12:61Z",
    "2026-10-04T12:00+24:00",
    "2026-10-04T12:00+00:60",
  ])
    expect(closingWorks(value)).toBe(false);
});

test("stable source keys survive label edits, option deletion, reordering and copying", async () => {
  const { $ensureSourceKeys } = await import("../../src/forms/editor/source-keys");

  const { $settings, $questionKey, $blockGroup, $isInput, $isOptionNode } =
    await import("../../src/forms/editor/nodes");

  const { $duplicateQuestion } = await import("../../src/forms/editor/structure");

  const e = hydrate(
    source(
      "::multiple-choice[Original label]{#keep-me required}\n- One\n- Two\n\n::text[Other]{#external}",
    ),
  );

  e.update(
    () => {
      const question = $getRoot()
        .getChildren()
        .find((n) => n.getType() === "question")!;

      const options = $blockGroup(question).filter($isOptionNode);
      options[0]!.remove();
      $ensureSourceKeys();
      expect($settings(options[1]!).sourceKey).toBe("keep-me");
      expect($questionKey(options[1]!)).toBe("keep-me");
      $duplicateQuestion(question);
      $ensureSourceKeys();
      const all = $getRoot().getChildren().filter($isInput);
      const keys = all.map((n) => $settings(n).sourceKey);
      expect(new Set(keys).size).toBe(keys.length);
    },
    { discrete: true },
  );
});

test("raw settings preserve false/zero/null and every opaque identity through hydration", () => {
  const document = read(source('::text[Untitled]{#answer required="false"}\n\nA note.'));
  const q = document.pages[0]!.blocks[0]!;

  if (q.type !== "question") throw Error();
  q.settings.future = { flag: false, count: 0, blank: "", nothing: null, dependsOn: "page-1/2" };

  const markdown = writeMarkdown(document),
    reopened = hydrate(markdown);

  const after = fromEditor(reopened.getEditorState().toJSON());
  const next = read(writeMarkdown(after));
  expect(next.pages[0]!.blocks[0]).toMatchObject({ settings: q.settings });
  expect(writeMarkdown(fromEditor(hydrate(writeMarkdown(next)).getEditorState().toJSON()))).toBe(
    writeMarkdown(after),
  );
});

test("semantic fingerprint detects discarded values but permits derived mention labels and text runs", async () => {
  const { semanticFingerprint } = await import("../helpers/default-form");
  const document = read(source("::text[Name]{#name}\n\n**Hello** {{name|none}}."));
  const reopened = fromEditor(hydrate(writeMarkdown(document)).getEditorState().toJSON());
  expect(semanticFingerprint(reopened)).toBe(semanticFingerprint(document));
  const q = reopened.pages[0]!.blocks[0]!;

  if (q.type !== "question") throw Error();
  q.settings.futureDraft = false;
  expect(semanticFingerprint(reopened)).not.toBe(semanticFingerprint(document));
});

test("literal list/page syntax and empty paragraphs stay authored paragraphs", async () => {
  const { semanticFingerprint } = await import("../helpers/default-form");
  const e = demo();
  e.update(
    () =>
      $getRoot().append(
        ...["---", "- literal", "1. literal", "::text[literal]", ""].map((value) =>
          $createParagraphNode().append($createTextNode(value)),
        ),
      ),
    { discrete: true },
  );
  const document = fromEditor(e.getEditorState().toJSON());
  const reopened = fromEditor(hydrate(writeMarkdown(document)).getEditorState().toJSON());
  expect(semanticFingerprint(reopened)).toBe(semanticFingerprint(document));
});

test("malformed source-state and inline metadata are rejected instead of coerced away", () => {
  const invalid = [
    { form: false },
    { form: [] },
    { questions: { name: { settings: false } } },
    { pages: { "page-1": { title: false } } },
    { questions: { name: { removeSettings: false } } },
    { nodes: false },
  ];

  for (const value of invalid) {
    const text = source(
      `::text[Name]{#name}\n\n:::source-state\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\`\n:::`,
    );

    const result = readMarkdown(text);
    expect(result.document).toBeUndefined();
    expect(result.original).toBe(text);
  }

  for (const body of [
    ':span[Hello]{data="false"}',
    ':span[Hello]{data="[]"}',
    ':link[Hello]{url="https://example.test" props="false"}',
    ':span[Hello]{underline="yes"}',
  ])
    expect(readMarkdown(source(body)).document).toBeUndefined();
  expect(readMarkdown(source("Text", 'future: {"same":1,"same":2}\n')).diagnostics[0]?.code).toBe(
    "duplicate-key",
  );
});

test("code-formatted mentions keep their references", async () => {
  const { semanticFingerprint } = await import("../helpers/default-form");
  const document = read(source('::text[Name]{#name}\n\n:span[{{name}}]{data="{\\"format\\":16}"}'));
  const reopened = fromEditor(hydrate(writeMarkdown(document)).getEditorState().toJSON());
  expect(semanticFingerprint(reopened)).toBe(semanticFingerprint(document));
  expect(writeMarkdown(reopened)).toContain("{{name}}");
});

test("choice conditions distinguish question keys from the first option's overlapping legacy ID", async () => {
  const { $createWidgetNode, $setSettings, $blockId, $questionKey, $isOptionNode } =
    await import("../../src/forms/editor/nodes");

  const { semanticFingerprint } = await import("../helpers/default-form");

  const e = hydrate(
    source("::multiple-choice[Continue?]{#continue}\n- Yes\n- No\n\n::text[Note]{#note}"),
  );

  e.update(
    () => {
      const option = $getRoot().getChildren().find($isOptionNode)!;
      $getRoot().append(
        $setSettings($createWidgetNode("conditional-logic"), {
          logicalOperator: "AND",
          conditionals: [
            {
              id: "condition",
              type: "SINGLE",
              field: $questionKey(option),
              comparison: "IS",
              value: $blockId(option),
            },
          ],
          actions: [{ id: "unfinished" }],
        }),
      );
      $ensureBlockIds($getRoot());
    },
    { discrete: true },
  );

  const document = fromEditor(e.getEditorState().toJSON()),
    markdown = writeMarkdown(document);

  const reopened = fromEditor(hydrate(markdown).getEditorState().toJSON());
  expect(semanticFingerprint(reopened)).toBe(semanticFingerprint(document));
  expect(markdown).toContain(":option[Yes]{#yes}");
  expect(markdown).toContain('"value": "yes"');
  expect(markdown).toContain('"field": "continue"');
});

test("code with emphasis and Markdown punctuation remains literal text", () => {
  const e = demo();
  e.update(
    () =>
      $getRoot().append(
        $createParagraphNode().append(
          $createTextNode("x**y").setFormat(17),
          $createTextNode("x*y").setFormat(18),
          $createTextNode("x***y").setFormat(19),
        ),
      ),
    { discrete: true },
  );
  const markdown = writeMarkdown(fromEditor(e.getEditorState().toJSON()));
  expect(writeMarkdown(fromEditor(hydrate(markdown).getEditorState().toJSON()))).toBe(markdown);
});

test("whitespace and multiline paragraphs, and code brackets inside directives, remain exact", async () => {
  const { semanticFingerprint } = await import("../helpers/default-form");
  const e = demo();
  e.update(
    () =>
      $getRoot().append(
        ...["  ", "  leading spaces", "A\n- literal list", "A\n\nB"].map((text) =>
          $createParagraphNode().append($createTextNode(text)),
        ),
      ),
    { discrete: true },
  );
  const document = fromEditor(e.getEditorState().toJSON());
  const after = fromEditor(hydrate(writeMarkdown(document)).getEditorState().toJSON());
  expect(semanticFingerprint(after)).toBe(semanticFingerprint(document));
  expect(readMarkdown(source("::text[Bracket `[` in label]{#code-label}")).diagnostics).toEqual([]);
});

test("multiline follow-up labels, hints, headings and paragraphs survive autosave and isolated Apply", async () => {
  const { $createLineBreakNode, $isElementNode } = await import("lexical");
  const { draftCodec, prepareSource } = await import("../helpers/default-form");

  const e = hydrate(
    source(
      "::multiple-choice[Continue?]{#continue}\n- Yes\n\n  ::text[Nested question]{#nested}\n  ::hint[Nested hint]\n\n  ## Nested heading\n\n  Nested paragraph\n\n- No",
    ),
  );

  e.update(
    () => {
      for (const value of [
        "Nested question",
        "Nested hint",
        "Nested heading",
        "Nested paragraph",
      ]) {
        const node = $getRoot()
          .getChildren()
          .find((node) => node.getTextContent() === value)!;

        if (!$isElementNode(node)) throw Error("Expected an editable text block");
        node.append($createLineBreakNode(), $createTextNode("Second line"));
      }
    },
    { discrete: true },
  );
  const markdown = draftCodec.encode(e.getEditorState().toJSON());
  const prepared = prepareSource(markdown);
  expect(editableText(prepared.state)).toEqual(editableText(e.getEditorState().toJSON()));
  expect(prepareSource(prepared.source).source).toBe(prepared.source);
});

test("blank newly inserted choice options remain saveable with and without a label", async () => {
  const { draftCodec, prepareSource } = await import("../helpers/default-form");

  for (const body of ["::dropdown{#blank}\n- ", "::checkboxes[]{#blank}\n- "]) {
    const e = hydrate(source(body));
    const saved = draftCodec.encode(e.getEditorState().toJSON());
    expect(() => prepareSource(saved)).not.toThrow();
    expect(saved).toContain("\n- \n");
  }
});

test("new blank logic and calculated-field catalog blocks can autosave and reload", async () => {
  const { draftCodec, prepareSource } = await import("../helpers/default-form");
  const { conditionalLogicEntry } = await import("../../src/forms/features/logic/insertion");
  const { calculatedFieldsEntry } = await import("../../src/forms/features/calculations/insertion");

  for (const name of ["CONDITIONAL_LOGIC", "CALCULATED_FIELDS"]) {
    const entry = [conditionalLogicEntry, calculatedFieldsEntry].find(
      (entry) => entry.id === name,
    )!;

    expect(entry).toBeDefined();
    const e = demo();
    e.update(
      () => {
        const before = $getRoot()
          .getChildren()
          .find((node) => node.getType() === "widget")!;

        for (const block of entry.create()) before.insertBefore(block);
        $ensureBlockIds($getRoot());
      },
      { discrete: true },
    );
    const saved = draftCodec.encode(e.getEditorState().toJSON());
    expect(() => prepareSource(saved)).not.toThrow();
    expect(draftCodec.encode(prepareSource(saved).state)).toBe(saved);
  }
});

test("opaque form and node state retain the identities their unknown values may reference", async () => {
  const { draftCodec, prepareSource } = await import("../helpers/default-form");
  const document = read(source("A referenced note"));

  for (const location of ["form", "contact", "node", "inline"] as const) {
    const raw = toEditor(document);
    const nodes = serializedNodes(raw);

    const title = nodes[0]!,
      note = nodes[2]!;

    title.$ ??= {};
    note.$ ??= {};
    note.$.id = "legacy-note-id";
    const value = { target: "legacy-note-id" };

    const formSettings = jsonSettings(title.$.settings!.formSettings);
    title.$.settings!.formSettings = formSettings;

    if (location === "form") formSettings.futureDraft = value;
    else if (location === "contact") formSettings.contactDetails = { futureDraft: value };
    else if (location === "node") title.$.futureDraft = value;
    else note.children![0]!.$ = { futureDraft: value };
    const saved = draftCodec.encode(raw);
    const prepared = prepareSource(saved);
    const after = serializedNodes(prepared.state);
    const retained = after.find((node) => node.$?.id === "legacy-note-id");
    expect(retained).toBeDefined();
    const titleAfter = after[0]!;
    const formAfter = jsonSettings(titleAfter.$?.settings?.formSettings);

    const retainedReference =
      location === "form"
        ? formAfter.futureDraft
        : location === "contact"
          ? jsonSettings(formAfter.contactDetails).futureDraft
          : location === "node"
            ? titleAfter.$?.futureDraft
            : retained!.children![0]!.$?.futureDraft;

    expect(retainedReference).toEqual(value);
    expect(draftCodec.encode(prepared.state)).toBe(saved);
  }
});

test("hard breaks in bullet and numbered items survive storage with nested option content", async () => {
  const { $createLineBreakNode, $isElementNode } = await import("lexical");
  const { draftCodec, prepareSource } = await import("../helpers/default-form");
  const { semanticFingerprint } = await import("../helpers/default-form");

  const e = hydrate(
    source(
      "::multiple-choice[Continue?]{#continue}\n- Yes\n\n  - Bullet item\n\n  1. Numbered item\n\n- No\n\n- Top-level item",
    ),
  );

  e.update(
    () => {
      for (const node of $getRoot()
        .getChildren()
        .filter((node) => ["bullet", "number"].includes(node.getType()))) {
        if (!$isElementNode(node)) throw Error("Expected a rich list item");
        node.append(
          $createLineBreakNode(),
          $createTextNode("Second line").setFormat(1),
          $createLineBreakNode(),
          $createTextNode("  Third line"),
        );
      }
    },
    { discrete: true },
  );
  const before = fromEditor(e.getEditorState().toJSON());
  const saved = draftCodec.encode(e.getEditorState().toJSON());
  const after = prepareSource(saved);
  expect(semanticFingerprint(fromEditor(after.state))).toBe(semanticFingerprint(before));
  expect(draftCodec.encode(after.state)).toBe(saved);
});

test("safe JSON frontmatter keys remain parseable through startup and canonical saving", async () => {
  const { draftCodec, prepareSource, initialDraft, DraftStore, MARKDOWN_KEY } =
    await import("../helpers/default-form");

  const original = source("A note", 'future: {"with space":{"dot.key":2,"1":3,"鍵":4,"":5}}\n');
  const prepared = prepareSource(original);
  expect(read(prepared.source).unknown).toEqual(read(original).unknown);
  expect(draftCodec.encode(prepared.state)).toBe(prepared.source);
  const records = new Map([[MARKDOWN_KEY, original]]);

  const storage = {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => {
      records.set(key, value);
    },
    removeItem: (key: string) => {
      records.delete(key);
    },
  };

  const initial = initialDraft(storage, () => {
    throw Error("Saved source must take precedence");
  });

  expect(initial.snapshot.valid).toBe(true);
  expect(() => new DraftStore(storage, initial)).not.toThrow();
  expect(records.get(MARKDOWN_KEY)).toBe(original);
});

test("multiline choice labels preserve configured options and nested followups through storage", async () => {
  const { $createLineBreakNode } = await import("lexical");
  const { $isOptionNode } = await import("../../src/forms/editor/nodes");

  const { draftCodec, prepareSource, initialDraft, LEGACY_KEY } =
    await import("../helpers/default-form");

  const legacy = await readFile(
    new URL("../../scripts/browser/fixtures/legacy-step9.json", import.meta.url),
    "utf8",
  );

  const migrated = initialDraft(
    {
      getItem: (key) => (key === LEGACY_KEY ? legacy : null),
      setItem: () => {},
      removeItem: () => {},
    },
    () => {
      throw Error("Use the legacy draft");
    },
  );

  const legacyEditor = editor();
  legacyEditor.setEditorState(legacyEditor.parseEditorState(migrated.state!));

  const nestedEditor = hydrate(
    source(
      '::multiple-choice[Continue?]{#continue}\n- Plain choice\n\n  ::checkboxes[Choose details]{#details}\n  - :option[Configured choice]{#configured optionValue="configured-value"}\n\n    ::text[Explain]{#explain}\n\n  - Nested plain choice\n\n- :option[Configured outer choice]{#outer optionValue="outer-value"}',
    ),
  );

  for (const e of [legacyEditor, nestedEditor]) {
    e.update(
      () => {
        for (const option of $getRoot().getChildren().filter($isOptionNode))
          option.append(
            $createLineBreakNode(),
            $createTextNode("Second option line"),
            $createLineBreakNode(),
            $createTextNode("  Third option line"),
          );
      },
      { discrete: true },
    );
    const saved = draftCodec.encode(e.getEditorState().toJSON());
    const reopened = prepareSource(saved);
    expect(editableText(reopened.state)).toEqual(editableText(e.getEditorState().toJSON()));
    expect(draftCodec.encode(reopened.state)).toBe(reopened.source);
    expect(prepareSource(reopened.source).source).toBe(reopened.source);
  }
});

test("confirmation pages preserve identities and authored text through canonical Markdown", () => {
  const current = source(`::text[Reference]{#reference}

---

# Application submitted

::page{#complete type="confirmation" pageId="complete"}

::description[Keep your application reference.]

Your application reference is {{reference}}.

:::source-state
\`\`\`json
{"pages":{"complete":{"start":{"identity":"saved-page"},"title":{"identity":"saved-heading"},"description":{"identity":"saved-description"}}},"questions":{"reference":{"settings":{"future":{"obsoletePurpose":true,"type":"unsupported-page"}}}}}
\`\`\`
:::`);

  const document = read(current);
  expect(document.pages[1]).toMatchObject({
    key: "complete",
    type: "confirmation",
    title: "Application submitted",
    description: "Keep your application reference.",
    settings: { pageId: "complete" },
    startNode: { identity: "saved-page" },
  });
  const before = toEditor(document);
  const canonical = writeMarkdown(document);
  expect(canonical).toContain('type="confirmation"');
  expect(canonical).toContain("#complete");
  expect(canonical).toContain('pageId="complete"');
  expect(canonical).toContain("Application submitted");
  expect(canonical).toContain("Your application reference is {{reference}}.");
  const reopened = read(canonical);
  const after = toEditor(reopened);
  expect(editableText(after)).toEqual(editableText(before));
  expect(reopened.pages[0]!.blocks[0]).toMatchObject({
    settings: { future: { obsoletePurpose: true, type: "unsupported-page" } },
  });
  expect(writeMarkdown(reopened)).toBe(canonical);
});

test("unsupported page types retain the original source without producing an editable document", () => {
  const original = source(`---

# Application submitted

::page{#complete type="unsupported-page"}

Keep your application reference.`);

  const parsed = readMarkdown(original);
  expect(parsed.document).toBeUndefined();
  expect(parsed.original).toBe(original);
  expect(parsed.diagnostics).toMatchObject([{ severity: "fatal", message: "Unknown page type" }]);
});

test("unknown page settings are rejected at both source-state scopes without changing the source", () => {
  for (const settings of [
    { obsoletePurpose: true },
    { obsoletePurpose: true, confirmation: false },
  ])
    for (const location of ["settings", "start"]) {
      const page = location === "settings" ? { settings } : { start: { settings } };

      const original = source(`---

# Application submitted

::page{#complete}

:::source-state
\`\`\`json
${JSON.stringify({ pages: { complete: page } })}
\`\`\`
:::`);

      const parsed = readMarkdown(original);
      expect(parsed.document).toBeUndefined();
      expect(parsed.original).toBe(original);
      expect(parsed.diagnostics[0]).toMatchObject({ severity: "fatal" });
      expect(parsed.diagnostics[0]!.message).toContain("obsoletePurpose");
    }
});

test("unsupported serialized page settings fail source conversion without mutating the editor state", () => {
  for (const invalid of [{ pageType: "unsupported-page" }, { obsoletePurpose: true }]) {
    const state = toEditor(
      read(source('---\n\n# Application submitted\n\n::page{#complete type="confirmation"}')),
    );

    const page = serializedNodes(state).find((node) => node.type === "widget");

    if (!page?.$?.settings) throw new Error("Confirmation page metadata is missing");
    Object.assign(page.$.settings, invalid);
    const before = structuredClone(state);
    expect(() => fromEditor(state)).toThrow();
    expect(state).toEqual(before);
  }
});
