import { maskSearchQuery } from "./mask-search-query";

describe("maskSearchQuery", () => {
  it("leaves ordinary service words untouched (keeps analytics readable)", () => {
    expect(maskSearchQuery("passport renewal")).toBe("passport renewal");
    expect(maskSearchQuery("birth certificate")).toBe("birth certificate");
  });

  it("masks a long number (6+ digits), keeping first and last digit", () => {
    expect(maskSearchQuery("national insurance 1234567890")).toBe(
      "national insurance 1********0",
    );
    expect(maskSearchQuery("nis 123456")).toBe("nis 1****6");
  });

  it("masks a dashed national ID end to end (dash-joined groups count as one run)", () => {
    // The two groups are joined only by a dash, so they form one 10-digit run
    // (>= 6) and the whole thing is masked — including the trailing group.
    expect(maskSearchQuery("driver licence 850101-0001")).toBe(
      "driver licence 8*********1",
    );
  });

  it("masks a phone number typed with dashes or spaces (#2079 separator gap)", () => {
    // Each group is < 6 digits, but joined by dashes/spaces they total 6+, so
    // the whole run is masked instead of slipping through verbatim.
    expect(maskSearchQuery("246-123-4567")).toBe("2**********7");
    expect(maskSearchQuery("1 246 123 4567")).toBe("1************7");
    expect(maskSearchQuery("call 246 123 4567 now")).toBe(
      "call 2**********7 now",
    );
  });

  it("masks emails (first + last kept, middle asterisked, length preserved)", () => {
    const email = "myname@gmail.com";
    const masked = maskSearchQuery(email);
    expect(masked).toMatch(/^m\*+m$/);
    expect(masked).toHaveLength(email.length);

    const out = maskSearchQuery("contact jane.doe@gov.bb please");
    expect(out).toMatch(/^contact j\*+b please$/);
  });

  it("leaves a too-short token (1-2 chars) unchanged, e.g. a stray '@'", () => {
    expect(maskSearchQuery("@")).toBe("@");
    expect(maskSearchQuery("who @ gov")).toBe("who @ gov");
  });

  it("leaves numbers shorter than 6 digits alone (form-name numbers stay readable)", () => {
    expect(maskSearchQuery("covid 19")).toBe("covid 19");
    expect(maskSearchQuery("bssee form a pupil under 11 request")).toBe(
      "bssee form a pupil under 11 request",
    );
  });

  it("keeps a 4-digit year in a form name readable", () => {
    expect(maskSearchQuery("cape exam registration 2024")).toBe(
      "cape exam registration 2024",
    );
    expect(maskSearchQuery("cape-exam-registration-2024")).toBe(
      "cape-exam-registration-2024",
    );
  });

  it("trims and collapses whitespace", () => {
    expect(maskSearchQuery("  passport   renewal  ")).toBe("passport renewal");
  });

  it("caps length at 60 characters", () => {
    const long = "a".repeat(80);
    expect(maskSearchQuery(long)).toHaveLength(60);
  });

  it("returns empty string for blank input", () => {
    expect(maskSearchQuery("")).toBe("");
    expect(maskSearchQuery("   ")).toBe("");
  });
});
