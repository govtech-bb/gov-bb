import { describe, expect, it } from "vitest";
import {
  analyzeMarkdownCompatibility,
  isSafeContentUrl,
  serializeLandingComponent,
} from "./markdown-authoring";

describe("markdown authoring contract", () => {
  it("allows the same relative and explicit protocols as landing", () => {
    expect(isSafeContentUrl("/services/start")).toBe(true);
    expect(isSafeContentUrl("#apply")).toBe(true);
    expect(isSafeContentUrl("https://gov.bb")).toBe(true);
    expect(isSafeContentUrl("tel:+12465351000")).toBe(true);
    expect(isSafeContentUrl("javascript:alert(1)")).toBe(false);
  });

  it("serializes the curated components as readable directives", () => {
    expect(
      serializeLandingComponent({
        kind: "details",
        summary: 'What "you" need',
        body: "Bring **ID**.",
      }),
    ).toBe(':::details{summary="What \\"you\\" need"}\nBring **ID**.\n:::');

    expect(
      serializeLandingComponent({
        kind: "actions",
        actions: [
          { label: "Continue", href: "/next", variant: "primary" },
          { label: "Help", href: "/help", variant: "secondary" },
        ],
      }),
    ).toBe(
      ':::actions\n::action[Continue]{href="/next"}\n::action[Help]{href="/help" variant="secondary"}\n:::',
    );
  });

  it("keeps unsupported source out of visual mode", () => {
    expect(
      analyzeMarkdownCompatibility("Text\n\n<!-- note -->", "landing-page"),
    ).toMatchObject({ mode: "source-only" });
    expect(
      analyzeMarkdownCompatibility("<muted>Note</muted>", "landing-page"),
    ).toMatchObject({ mode: "source-only" });
    expect(
      analyzeMarkdownCompatibility(
        "<a data-start-link>Start</a>",
        "landing-page",
      ),
    ).toEqual({ mode: "visual", reasons: [] });
    expect(
      analyzeMarkdownCompatibility(
        "<a data-start-link>Start</a>",
        "form-content",
      ),
    ).toMatchObject({ mode: "source-only" });
  });

  it("only enables visual mode for source the editor can round-trip", () => {
    expect(
      analyzeMarkdownCompatibility(
        'Apply here: <a data-start-link href="/apply">Start</a>',
        "landing-page",
      ),
    ).toMatchObject({ mode: "source-only" });
    expect(
      analyzeMarkdownCompatibility(
        '<details class="govbb-show-hide"><summary>More</summary></details>',
        "landing-page",
      ),
    ).toMatchObject({ mode: "source-only" });
    expect(
      analyzeMarkdownCompatibility(
        ':::actions\n::action[Start]{href="/start" tracking="x"}\n:::',
        "landing-page",
      ),
    ).toMatchObject({ mode: "source-only" });
    expect(
      analyzeMarkdownCompatibility(
        ':::actions\n::action[Start]{href="/start" variant="primary"}\n:::',
        "landing-page",
      ),
    ).toEqual({ mode: "visual", reasons: [] });
  });
});
