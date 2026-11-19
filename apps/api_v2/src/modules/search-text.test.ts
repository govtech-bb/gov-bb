import { describe, expect, it } from "vitest";
import { ESTATE } from "../seed-data";
import { analyzeContentMarkdown } from "@govtech-bb/govbbmarkd";
import { chunkMarkdown } from "./search-text";

/** How a search client rebuilds one page's text from its chunks. */
const rejoin = (chunks: ReturnType<typeof chunkMarkdown>) =>
  chunks
    .flatMap((chunk) => [chunk.heading ?? "", chunk.body])
    .filter(Boolean)
    .join(" ");

describe("chunkMarkdown", () => {
  it("keeps instructions between leading rules in stored bodies", () => {
    expect(
      chunkMarkdown("---\n\nSubmit before Friday.\n\n---\n\nApply below."),
    ).toEqual([{ heading: null, body: "Submit before Friday. Apply below." }]);
  });

  it("splits at headings, keeping the text before the first one", () => {
    expect(
      chunkMarkdown(
        "Intro with a [link](https://x).\n\n## Fees\n\nIt costs **$10**.\n\n### Paying\n\nBy card.",
      ),
    ).toEqual([
      { heading: null, body: "Intro with a link." },
      { heading: "Fees", body: "It costs $10." },
      { heading: "Paying", body: "By card." },
    ]);
  });

  it("does not split at a heading inside a code fence", () => {
    expect(chunkMarkdown("## A\n\n```\n## not a heading\n```\n\ntext")).toEqual(
      [{ heading: "A", body: "text" }],
    );
  });

  it("returns nothing for an empty body", () => {
    expect(chunkMarkdown("  \n")).toEqual([]);
  });

  it("indexes component copy, not form ids or directive syntax", () => {
    expect(
      chunkMarkdown(':::action{form="birth-certificate"}\nApply now\n:::'),
    ).toEqual([{ heading: null, body: "Apply now" }]);
  });

  it.each(ESTATE.pages.map((page) => [page.url, page.body_markdown]))(
    "rejoins %s to the text landing indexes",
    (_url, body) => {
      expect(rejoin(chunkMarkdown(body))).toBe(
        analyzeContentMarkdown(body, { frontmatter: false }).text,
      );
    },
  );
});
