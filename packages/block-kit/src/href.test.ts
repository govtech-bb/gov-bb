import { describe, expect, it } from "vitest";
import { safeHref } from "./href";

describe("hrefs a document may produce", () => {
  it("allows root-relative paths and fragments", () => {
    expect(safeHref("/business-trade/crop-over-permits")).toBe(
      "/business-trade/crop-over-permits",
    );
    expect(safeHref("/a/b?x=1#frag")).toBe("/a/b?x=1#frag");
    expect(safeHref("#what-you-will-need")).toBe("#what-you-will-need");
  });

  it("allows the schemes government content actually uses", () => {
    expect(safeHref("https://oag.gov.bb/regs.pdf")).toBe(
      "https://oag.gov.bb/regs.pdf",
    );
    expect(safeHref("http://gov.bb")).toBe("http://gov.bb");
    expect(safeHref("mailto:EHD.BTPC@health.gov.bb")).toBe(
      "mailto:EHD.BTPC@health.gov.bb",
    );
    expect(safeHref("tel:+12465363700")).toBe("tel:+12465363700");
  });

  it("trims surrounding whitespace rather than refusing", () => {
    expect(safeHref("  https://gov.bb  ")).toBe("https://gov.bb");
  });
});

describe("hrefs it must refuse", () => {
  it("refuses javascript:", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("JavaScript:alert(1)")).toBeNull();
  });

  it("refuses a scheme hidden behind control characters or whitespace", () => {
    // HTML parsers strip these from inside a scheme, so all of these run if
    // the check is a naive startsWith.
    expect(safeHref("java\tscript:alert(1)")).toBeNull();
    expect(safeHref("java\nscript:alert(1)")).toBeNull();
    expect(safeHref("  javascript:alert(1)")).toBeNull();
    expect(safeHref(String.fromCharCode(0) + "javascript:alert(1)")).toBeNull();
  });

  it("refuses data:, vbscript:, blob: and file:", () => {
    expect(safeHref("data:text/html;base64,PHNjcmlwdD4=")).toBeNull();
    expect(safeHref("vbscript:msgbox(1)")).toBeNull();
    expect(safeHref("blob:https://gov.bb/abc")).toBeNull();
    expect(safeHref("file:///etc/passwd")).toBeNull();
  });

  it("refuses a protocol-relative url, which looks like a path", () => {
    expect(safeHref("//evil.example/steal")).toBeNull();
  });

  it("refuses a bare word, which is an authoring mistake not a link", () => {
    expect(safeHref("form")).toBeNull();
  });

  it("refuses nothing at all", () => {
    expect(safeHref("")).toBeNull();
    expect(safeHref("   ")).toBeNull();
    expect(safeHref(null)).toBeNull();
    expect(safeHref(undefined)).toBeNull();
  });
});

describe("the layers behind the renderer", () => {
  it("the body schema refuses an unsafe external ref", async () => {
    const { bodySchema } = await import("./schema");
    const body = {
      version: 1,
      blocks: [],
      refs: { r1: { kind: "external", href: "javascript:alert(1)" } },
    };
    expect(bodySchema.safeParse(body).success).toBe(false);

    const ok = {
      version: 1,
      blocks: [],
      refs: { r1: { kind: "external", href: "https://gov.bb" } },
    };
    expect(bodySchema.safeParse(ok).success).toBe(true);
  });

  it("the body schema refuses a start_link to an unsafe target", async () => {
    const { bodySchema } = await import("./schema");
    const withTarget = (target: string, kind = "external") => ({
      version: 1,
      blocks: [
        {
          id: "b1",
          type: "start_link",
          label: "Start now",
          target_kind: kind,
          target,
        },
      ],
      refs: {},
    });

    expect(
      bodySchema.safeParse(withTarget("javascript:alert(1)")).success,
    ).toBe(false);
    expect(bodySchema.safeParse(withTarget("/a/b", "page")).success).toBe(true);
    // A form target is an id the host resolves, not an href.
    expect(
      bodySchema.safeParse(withTarget("apply-for-a-thing", "form")).success,
    ).toBe(true);
  });
});
