import { describe, it, expect } from "vitest";
import {
  readPreviewCookie,
  hasPreviewCookieBypass,
  PREVIEW_COOKIE_BYPASS_VALUES,
} from "./preview-cookie";

describe("readPreviewCookie", () => {
  it("returns undefined when the header is absent", () => {
    expect(readPreviewCookie(undefined)).toBeUndefined();
    expect(readPreviewCookie("")).toBeUndefined();
  });

  it("returns undefined when no preview cookie is present", () => {
    expect(readPreviewCookie("session=abc; theme=dark")).toBeUndefined();
  });

  it("reads the preview value from a single-cookie header", () => {
    expect(readPreviewCookie("preview=preview")).toBe("preview");
  });

  it("parses the preview cookie out of a multi-cookie header", () => {
    expect(readPreviewCookie("session=abc; preview=draft; theme=dark")).toBe(
      "draft",
    );
  });

  it("trims surrounding whitespace around the name and value", () => {
    expect(readPreviewCookie("session=abc;  preview = 1 ")).toBe("1");
  });
});

describe("hasPreviewCookieBypass", () => {
  it("is true for each bypass value", () => {
    for (const value of PREVIEW_COOKIE_BYPASS_VALUES) {
      expect(hasPreviewCookieBypass(`preview=${value}`)).toBe(true);
    }
  });

  it("is false for an absent or non-bypass cookie", () => {
    expect(hasPreviewCookieBypass(undefined)).toBe(false);
    expect(hasPreviewCookieBypass("session=abc")).toBe(false);
    expect(hasPreviewCookieBypass("preview=nope")).toBe(false);
    expect(hasPreviewCookieBypass("preview=")).toBe(false);
  });
});
