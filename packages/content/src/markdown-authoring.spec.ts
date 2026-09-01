import { describe, expect, it } from "vitest";
import {
  analyzeMarkdownCompatibility,
  isSafeContentUrl,
  parseActionDirective,
  parseDetailsDirective,
  parseStartLinkMarker,
  serializeLandingComponent,
  serializeStartLinkMarker,
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

  it("uses a context-aware codec for Start link text and attributes", () => {
    const values = {
      label: '<script>alert("x")</script> & continue',
      href: '/apply?next="step"&ready=true',
    };
    const marker = serializeStartLinkMarker(values);

    expect(marker).toBe(
      '<a data-start-link href="/apply?next=&quot;step&quot;&amp;ready=true">&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; continue</a>',
    );
    expect(parseStartLinkMarker(marker)).toEqual(values);
    expect(
      parseStartLinkMarker(
        '<a data-start-link href="javascript&#58;alert(1)">Start</a>',
      ),
    ).toBeNull();
    expect(
      parseStartLinkMarker('<a data-start-link onclick="alert(1)">Start</a>'),
    ).toBeNull();
  });

  it("decodes each HTML entity layer exactly once", () => {
    const marker = "<a data-start-link>A &amp;quot; B</a>";
    expect(parseStartLinkMarker(marker)).toEqual({
      label: "A &quot; B",
      href: "",
    });
    expect(serializeStartLinkMarker(parseStartLinkMarker(marker)!)).toBe(
      marker,
    );
  });

  it("strictly parses component directives without unsafe attributes", () => {
    expect(
      parseActionDirective(
        '::action[Get help]{href="/help" variant="secondary"}',
      ),
    ).toEqual({ label: "Get help", href: "/help", variant: "secondary" });
    expect(
      parseActionDirective('::action[Run]{href="javascript:alert(1)"}'),
    ).toBeNull();
    expect(
      parseActionDirective('::action[Run]{href="/run" onclick="x"}'),
    ).toBeNull();
    expect(parseDetailsDirective(':::details{summary="More details"}')).toBe(
      "More details",
    );
    expect(
      parseDetailsDirective(':::details{summary="More" onclick="x"}'),
    ).toBeNull();
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
    expect(
      analyzeMarkdownCompatibility(
        '<br onmouseover="alert(1)">',
        "landing-page",
      ),
    ).toMatchObject({ mode: "source-only" });
  });

  it("handles adversarial HTML and directive input in linear time", () => {
    const padding = " ".repeat(50_000);
    const names = "a".repeat(50_000);
    const markdown = [
      `<a${padding}!`,
      `::action[]{{${padding}!`,
      `:::actions`,
      `::action[Start]{${names}}`,
      `:::`,
    ].join("\n");

    expect(
      analyzeMarkdownCompatibility(markdown, "landing-page"),
    ).toMatchObject({ mode: "source-only" });
  });
});
