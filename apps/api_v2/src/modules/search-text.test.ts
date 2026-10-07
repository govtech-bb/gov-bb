import { describe, expect, it } from "vitest";
import { ESTATE } from "../seed-data";
import { chunkMarkdown, stripMarkdown } from "./search-text";

/** How a search client rebuilds one page's text from its chunks. */
const rejoin = (chunks: ReturnType<typeof chunkMarkdown>) =>
  chunks
    .flatMap((chunk) => [chunk.heading ?? "", chunk.body])
    .filter(Boolean)
    .join(" ");

describe("chunkMarkdown", () => {
  it("splits at headings, keeping the text before the first one", () => {
    expect(
      chunkMarkdown(
        "Intro with a [link](https://x).\n\n## Fees\n\nIt costs **$10**.\n\n### Paying\n\nBy card.",
      ),
    ).toEqual([
      { heading: null, body: "Intro with a link." },
      // Emphasis markers become spaces, exactly as landing strips them.
      { heading: "Fees", body: "It costs $10 ." },
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

  // Search ranking must not move when its text comes from chunks rather than
  // from the page: for every page in the estate, the chunks rejoined are
  // exactly the body landing indexes today.
  it.each(ESTATE.pages.map((page) => [page.url, page.body_markdown]))(
    "rejoins %s to the text landing indexes",
    (_url, body) => {
      expect(rejoin(chunkMarkdown(body))).toBe(stripMarkdown(body));
    },
  );
});
