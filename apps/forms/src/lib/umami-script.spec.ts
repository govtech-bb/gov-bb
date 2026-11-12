import { loadUmamiScript } from "./umami-script";

const umamiScripts = () =>
  document.head.querySelectorAll<HTMLScriptElement>("script[data-website-id]");

describe("loadUmamiScript", () => {
  afterEach(() => {
    umamiScripts().forEach((s) => s.remove());
  });

  it("adds the Umami script with the shared settings", () => {
    loadUmamiScript("site-id", "https://example.test/umami.js");

    expect(umamiScripts()).toHaveLength(1);
    const script = umamiScripts()[0];
    expect(script.src).toBe("https://example.test/umami.js");
    expect(script.defer).toBe(true);
    expect(script.getAttribute("data-website-id")).toBe("site-id");
    expect(script.getAttribute("data-auto-track")).toBe("false");
  });

  // #3503: forms keeps ?draft= and ?preview= tokens in the URL on every step,
  // so Umami must record the path only.
  it("keeps query strings out of the URLs Umami records", () => {
    loadUmamiScript("site-id", undefined);

    expect(umamiScripts()[0].getAttribute("data-exclude-search")).toBe("true");
  });

  it("falls back to Umami Cloud's script when no src is set", () => {
    loadUmamiScript("site-id", undefined);

    expect(umamiScripts()[0].src).toBe("https://cloud.umami.is/script.js");
  });

  it("adds nothing without a website id", () => {
    loadUmamiScript(undefined, "https://example.test/umami.js");
    loadUmamiScript("", "https://example.test/umami.js");

    expect(umamiScripts()).toHaveLength(0);
  });
});
