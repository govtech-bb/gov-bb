import { beforeEach, describe, expect, it } from "vitest";
import { getSelector, locateQuote, resolveSelector } from "./anchor";

describe("getSelector / resolveSelector", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <main id="main">
        <section><p>first</p><p>second</p></section>
        <article class="card">hello</article>
      </main>`;
  });

  it("uses an id when present", () => {
    const el = document.getElementById("main")!;
    expect(getSelector(el)).toBe("#main");
  });

  it("builds an nth-of-type path that round-trips back to the element", () => {
    const second = document.querySelectorAll("p")[1]!;
    const selector = getSelector(second);
    expect(selector).toContain("nth-of-type(2)");
    expect(resolveSelector(selector)).toBe(second);
  });

  it("round-trips an element without sibling ambiguity", () => {
    const article = document.querySelector("article")!;
    expect(resolveSelector(getSelector(article))).toBe(article);
  });

  it("returns null for nullish input and unmatched selectors", () => {
    expect(getSelector(null)).toBeNull();
    expect(resolveSelector(null)).toBeNull();
    expect(resolveSelector("#does-not-exist")).toBeNull();
  });
});

describe("locateQuote", () => {
  const root = () => {
    const el = document.createElement("div");
    el.textContent = "The quick brown fox jumps over the lazy dog";
    return el;
  };

  it("finds a bare quote", () => {
    expect(
      locateQuote({ quote: "brown fox", prefix: "", suffix: "" }, root()),
    ).toEqual({ start: 10, end: 19 });
  });

  it("uses prefix/suffix to disambiguate a repeated phrase", () => {
    const el = document.createElement("div");
    el.textContent = "go left then go right";
    // "go" appears twice; suffix " right" pins the second one.
    const loc = locateQuote(
      { quote: "go", prefix: "then ", suffix: " right" },
      el,
    );
    expect(loc).toEqual({ start: 13, end: 15 });
  });

  it("returns null when the quote is absent or empty", () => {
    expect(
      locateQuote({ quote: "missing", prefix: "", suffix: "" }, root()),
    ).toBeNull();
    expect(
      locateQuote({ quote: "", prefix: "", suffix: "" }, root()),
    ).toBeNull();
  });
});
