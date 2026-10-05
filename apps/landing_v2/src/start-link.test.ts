import { describe, expect, it } from "vitest";
import { startLinkHref } from "./start-link";

describe("startLinkHref", () => {
  it("resolves a form start link to ${FORMS_URL}/forms/<id>", () => {
    expect(
      startLinkHref("https://forms.example", undefined, "apply-for-a-permit"),
    ).toBe("https://forms.example/forms/apply-for-a-permit");
  });

  it("uses an authored href as it is, over the form", () => {
    expect(
      startLinkHref("https://forms.example", "/a/page/start", "a-form"),
    ).toBe("/a/page/start");
  });

  it("gives nothing for a link with neither", () => {
    expect(
      startLinkHref("https://forms.example", undefined, undefined),
    ).toBeUndefined();
  });
});
