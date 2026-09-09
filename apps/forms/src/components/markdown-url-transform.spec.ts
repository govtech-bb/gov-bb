import { markdownUrlTransform } from "./markdown-url-transform";

describe("markdownUrlTransform", () => {
  it("keeps tel: hrefs so a phone number dials instead of rendering blank", () => {
    expect(markdownUrlTransform("tel:+12465363800")).toBe("tel:+12465363800");
  });

  it("keeps the protocols react-markdown already allows", () => {
    expect(markdownUrlTransform("https://gov.bb")).toBe("https://gov.bb");
    expect(markdownUrlTransform("mailto:a@b.com")).toBe("mailto:a@b.com");
    expect(markdownUrlTransform("/services")).toBe("/services");
  });

  it("still blanks unsafe protocols", () => {
    expect(markdownUrlTransform("javascript:alert(1)")).toBe("");
  });
});
