import { describe, it, expect } from "vitest";
import { interpolateConfirmationMarkdown } from "./confirmation-markdown";

describe("interpolateConfirmationMarkdown", () => {
  it("substitutes a resolved token value", () => {
    expect(
      interpolateConfirmationMarkdown("Visit {polyclinic} on Monday.", {
        polyclinic: "Warrens Polyclinic",
      }),
    ).toBe("Visit Warrens Polyclinic on Monday.");
  });

  it("replaces every occurrence of a token (replaceAll parity)", () => {
    expect(
      interpolateConfirmationMarkdown("{polyclinic} — see {polyclinic}.", {
        polyclinic: "Warrens Polyclinic",
      }),
    ).toBe("Warrens Polyclinic — see Warrens Polyclinic.");
  });

  it("falls back to the shared phrase when the value is undefined", () => {
    expect(
      interpolateConfirmationMarkdown("Visit {polyclinic}.", {
        polyclinic: undefined,
      }),
    ).toBe("Visit your local polyclinic.");
  });

  it("falls back to the shared phrase when the value is null", () => {
    expect(
      interpolateConfirmationMarkdown("Visit {polyclinic}.", {
        polyclinic: null,
      }),
    ).toBe("Visit your local polyclinic.");
  });

  it("leaves content unchanged when the token is absent", () => {
    expect(
      interpolateConfirmationMarkdown("No token in this copy.", {
        polyclinic: "Warrens Polyclinic",
      }),
    ).toBe("No token in this copy.");
  });

  it("returns undefined when there is no markdown content (passthrough parity)", () => {
    expect(
      interpolateConfirmationMarkdown(undefined, {
        polyclinic: "Warrens Polyclinic",
      }),
    ).toBeUndefined();
  });

  it("preserves an empty-string value (nullish-coalescing parity)", () => {
    // `value ?? fallback` treats "" as present, so the token resolves to "" —
    // matching the pre-extraction `polyclinic ?? "…"` both surfaces used.
    expect(
      interpolateConfirmationMarkdown("[{polyclinic}]", { polyclinic: "" }),
    ).toBe("[]");
  });
});
