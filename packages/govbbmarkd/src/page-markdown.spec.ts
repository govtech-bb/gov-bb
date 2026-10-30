import { describe, expect, expectTypeOf, it } from "vitest";
import type { Root } from "mdast";
import fc from "fast-check";
import {
  isPageDirective,
  parseContentMarkdown,
  parsePageComponent,
  stringifyContentMarkdown,
  type PageMarkdownComponent,
  type PageMarkdownError,
  type MarkdownParseOptions,
  type PageActionTarget,
} from "@govtech-bb/govbbmarkd";

function component(source: string) {
  const parsed = parseContentMarkdown(source);
  expect(parsed.errors).toEqual([]);
  const node = parsed.root.children[0];
  if (!node || !isPageDirective(node)) throw new Error("Expected a component");
  const result = parsePageComponent(node);
  if (!result.ok) throw result.error;
  return result.value;
}

describe("GovBB Markdown", () => {
  it("exposes typed compiler results and keeps form identifiers distinct from URLs", () => {
    expectTypeOf(parseContentMarkdown).toEqualTypeOf<
      (
        source: string,
        options?: MarkdownParseOptions,
      ) => {
        readonly root: Root;
        readonly errors: readonly PageMarkdownError[];
      }
    >();
    expectTypeOf(parsePageComponent).returns.toEqualTypeOf<
      | { readonly ok: true; readonly value: PageMarkdownComponent }
      | { readonly ok: false; readonly error: PageMarkdownError }
    >();
    expectTypeOf<
      Extract<PageActionTarget, { kind: "url" }>["href"]
    >().not.toEqualTypeOf<
      Extract<PageActionTarget, { kind: "form" }>["formId"]
    >();
  });
  it("parses fenced actions and keeps form targets distinct from URLs", () => {
    expect(
      component(':::action{href="/apply"}\nApply **now**\n:::'),
    ).toMatchObject({
      kind: "action",
      target: { kind: "url", href: "/apply" },
      variant: "primary",
      label: [{ type: "text", value: "Apply " }, { type: "strong" }],
    });
    expect(
      component(':::action{form="birth-certificate"}\nStart now\n:::'),
    ).toMatchObject({
      kind: "action",
      target: { kind: "form", formId: "birth-certificate" },
    });
    expect(component(':::action{target="form"}\nStart now\n:::')).toMatchObject(
      {
        kind: "action",
        target: { kind: "linked-form" },
      },
    );
  });

  it("keeps bare colons literal inside component labels", () => {
    expect(
      component(':::action{href="/apply"}\nApply by 8:30am\n:::'),
    ).toMatchObject({
      kind: "action",
    });
    expect(component(":::details[Reference:code]\nHelp\n:::")).toMatchObject({
      kind: "details",
      summary: "Reference:code",
    });
  });

  it("accepts existing leaf actions, details attributes and notices", () => {
    expect(component('::action[Continue]{href="/next"}')).toMatchObject({
      kind: "action",
    });
    expect(
      component(':::details{summary="Before you apply"}\nHelp.\n:::'),
    ).toMatchObject({
      kind: "details",
      summary: "Before you apply",
    });
    expect(component(":::notice\nA note.\n:::")).toMatchObject({
      kind: "notice",
    });
  });

  it("parses labelled details, table structure and summary rows", () => {
    expect(
      component(":::details[Accepted identification]\nBring a passport.\n:::"),
    ).toMatchObject({
      kind: "details",
      summary: "Accepted identification",
      body: [
        {
          type: "paragraph",
          children: [{ type: "text", value: "Bring a passport." }],
        },
      ],
    });
    expect(
      component(
        ':::table[Fees]{row-headers="first" numeric-columns="2"}\n| Service | Fee |\n| --- | ---: |\n| Example | 50 |\n:::',
      ),
    ).toMatchObject({
      kind: "table",
      caption: "Fees",
      rowHeaders: "first",
      numericColumns: [1],
    });
    expect(
      component("::::summary-list\n:::summary-item[Fee]\nBBD 50\n:::\n::::"),
    ).toMatchObject({
      kind: "summary-list",
      rows: [{ key: "Fee", value: [{ type: "paragraph" }] }],
    });
  });

  it.each([
    [':::action{href="javascript:alert(1)"}\nRun\n:::', "unsafe-url"],
    [':::action{href="/apply" form="birth"}\nStart\n:::', "invalid-attributes"],
    [
      ':::action{href="/apply" onclick="run()"}\nStart\n:::',
      "invalid-attributes",
    ],
    [':::action{form="../private"}\nStart\n:::', "invalid-attributes"],
    [":::action\nStart\n:::", "invalid-attributes"],
    [':::action[Start]{href="/apply"}\n:::', "invalid-content"],
    [
      ':::action{href="/apply"}\n[Another link](/other)\n:::',
      "invalid-content",
    ],
    [':::action{href="/apply"}\n- A list\n:::', "invalid-content"],
    [":::details\nHelp\n:::", "invalid-content"],
    [':::details[One]{summary="Two"}\nHelp\n:::', "invalid-attributes"],
    [":::details[Help]\nBody", "missing-fence"],
    [
      ':::table[Fees]{numeric-columns="3"}\n| A | B |\n| - | - |\n| 1 | 2 |\n:::',
      "invalid-attributes",
    ],
    [":::table\n| A | B |\n| - | - |\n| 1 | 2 |\n:::", "invalid-content"],
    [":::summary-item[Fee]\n50\n:::", "invalid-nesting"],
    [":::summary-list\nNot a row\n:::", "invalid-content"],
    [":::actions\nNot an action\n:::", "invalid-content"],
    [":::service-list\n:::", "unsupported-component"],
    [":::start\nStart\n:::", "unsupported-component"],
    [":::accordion\n:::", "unsupported-component"],
  ])("reports a located diagnostic for %s", (source, code) => {
    const parsed = parseContentMarkdown(`Intro\n\n${source}`);
    expect(parsed.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code, line: 3, column: 1 }),
      ]),
    );
  });

  it("validates complete action groups and rejects nested disclosures", () => {
    const group =
      '::::actions\n:::action{href="/a"}\nA\n:::\n:::action{href="/b" variant="secondary"}\nB\n:::\n::::';
    expect(parseContentMarkdown(group).errors).toEqual([]);
    expect(
      parseContentMarkdown(group.replace(' variant="secondary"', "")).errors[0]
        ?.code,
    ).toBe("invalid-content");
    expect(
      parseContentMarkdown(
        "::::details[Outer]\n:::details[Inner]\nHelp\n:::\n::::",
      ).errors[0]?.code,
    ).toBe("invalid-nesting");
  });

  it("preserves legacy HTML, frontmatter, literal colons and fenced examples", () => {
    const source =
      "---\ntitle: Example\n---\n\nOpen 8:30am. Note:reference.\n\n<a data-start-link>Start</a>\n\n```md\n:::unknown\n```";
    const parsed = parseContentMarkdown(source);
    expect(parsed.errors).toEqual([]);
    expect(parsed.root.children.map((node) => node.type)).toEqual([
      "yaml",
      "paragraph",
      "paragraph",
      "code",
    ]);
    expect(stringifyContentMarkdown(parsed.root)).toContain("8:30am");
  });

  it("recognizes closed components in quotes and keeps empty inline directives intact", () => {
    expect(
      parseContentMarkdown("> :::details[Help]\n> Body\n> :::").errors,
    ).toEqual([]);
    expect(
      parseContentMarkdown(":::details[Help]\nBody\n    :::").errors[0]?.code,
    ).toBe("missing-fence");
    expect(parseContentMarkdown(":unknown[]").errors[0]?.code).toBe(
      "unsupported-component",
    );
    expect(parseContentMarkdown(":unknown{}").errors[0]?.code).toBe(
      "unsupported-component",
    );
  });

  it.each([
    "0@A.A",
    "help@example.gov.bb",
    "www.example.gov.bb",
    "https://example.gov.bb",
  ])("keeps an autolink-shaped action label as literal text: %s", (label) => {
    const source = stringifyContentMarkdown({
      type: "root",
      children: [
        {
          type: "containerDirective",
          name: "action",
          attributes: { href: "/apply" },
          children: [
            { type: "paragraph", children: [{ type: "text", value: label }] },
          ],
        },
      ],
    });
    const action = component(source);
    expect(action).toMatchObject({
      kind: "action",
      label: [{ type: "text", value: label }],
    });
  });

  it.each(["\n", "\r\n", "\r"])(
    "accepts closed fences with %j line endings",
    (ending) => {
      expect(
        parseContentMarkdown([":::details[Help]", "Body", ":::"].join(ending))
          .errors,
      ).toEqual([]);
    },
  );

  it("round-trips plain component labels, including literal emails and URLs", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constantFrom(
            "help@example.gov.bb",
            "https://example.gov.bb",
            "www.example.gov.bb",
            "*!* ",
            "&amp;",
          ),
          fc
            .string({ minLength: 1, maxLength: 80 })
            .filter((value) => value.trim().length > 0),
        ),
        (label) => {
          for (const name of ["details", "table", "summary-item"] as const) {
            const node: Root["children"][number] = {
              type: "containerDirective",
              name,
              children: [
                {
                  type: "paragraph",
                  data: { directiveLabel: true },
                  children: [{ type: "text", value: label }],
                },
                ...(name === "table"
                  ? [
                      {
                        type: "table" as const,
                        children: [
                          {
                            type: "tableRow" as const,
                            children: [
                              {
                                type: "tableCell" as const,
                                children: [
                                  { type: "text" as const, value: "Value" },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ]
                  : []),
              ],
            };
            const source = stringifyContentMarkdown({
              type: "root",
              children:
                name === "summary-item"
                  ? [
                      {
                        type: "containerDirective",
                        name: "summary-list",
                        children: [node],
                      },
                    ]
                  : [node],
            });
            const parsed = component(source);
            const actual =
              parsed.kind === "details"
                ? parsed.summary
                : parsed.kind === "table"
                  ? parsed.caption
                  : parsed.kind === "summary-list"
                    ? parsed.rows[0]?.key
                    : undefined;
            expect(actual).toBe(label.trim());
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it.each(["details", "table", "summary-item"])(
    "does not turn authored links into plain %s labels",
    (name) => {
      const body = name === "table" ? "\n| Value |\n| --- |" : "";
      const source = `:::${name}[[Guide](/guide)]${body}\n:::`;
      expect(
        parseContentMarkdown(source).errors.some(
          (error) => error.code === "invalid-content",
        ),
      ).toBe(true);
    },
  );

  it("round-trips generated action labels without creating components or losing text", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 80 })
          .filter((value) => value.trim().length > 0),
        (label) => {
          const source = stringifyContentMarkdown({
            type: "root",
            children: [
              {
                type: "containerDirective",
                name: "action",
                attributes: { href: "/apply" },
                children: [
                  {
                    type: "paragraph",
                    children: [{ type: "text", value: label }],
                  },
                ],
              },
            ],
          });
          const action = component(source);
          expect(action.kind).toBe("action");
          if (action.kind === "action")
            expect(
              action.label
                .map((node) => (node.type === "text" ? node.value : ""))
                .join(""),
            ).toBe(label);
        },
      ),
      { numRuns: 1000 },
    );
  });
});
