import { parseDateValue } from "./parse-date-value";

describe("parseDateValue", () => {
  describe("object shape { day, month, year }", () => {
    it("parses a valid object (digit-string parts, as the date field stores)", () => {
      expect(parseDateValue({ day: "5", month: "3", year: "1990" })).toEqual({
        day: 5,
        month: 3,
        year: 1990,
      });
    });

    it("parses numeric parts too", () => {
      expect(parseDateValue({ day: 15, month: 1, year: 2020 })).toEqual({
        day: 15,
        month: 1,
        year: 2020,
      });
    });

    // #2072 Bug 1: this is the whole point — the object branch must reject an
    // impossible date the same way the DD/MM/YYYY branch always did.
    it("rejects an impossible object date instead of rolling it over", () => {
      expect(parseDateValue({ day: 31, month: 2, year: 2020 })).toBeNull();
      expect(parseDateValue({ day: 31, month: 4, year: 2020 })).toBeNull();
    });

    it("rejects empty / zero / non-numeric parts", () => {
      expect(parseDateValue({ day: "", month: "3", year: "1990" })).toBeNull();
      expect(parseDateValue({ day: 0, month: 3, year: 1990 })).toBeNull();
      expect(parseDateValue({ day: "x", month: "3", year: "1990" })).toBeNull();
    });
  });

  describe("Barbados DD/MM/YYYY string", () => {
    it("parses a valid DD/MM/YYYY", () => {
      expect(parseDateValue("05/03/1990")).toEqual({
        day: 5,
        month: 3,
        year: 1990,
      });
    });

    it("rejects an impossible DD/MM/YYYY", () => {
      expect(parseDateValue("31/02/2020")).toBeNull();
    });

    it("rejects non-canonical numerics and short years", () => {
      expect(parseDateValue("12.5/03/1990")).toBeNull();
      expect(parseDateValue("5/3/90")).toBeNull();
      expect(parseDateValue("1/2/3/4")).toBeNull();
    });
  });

  describe("ISO string", () => {
    it("parses a date-only ISO string", () => {
      expect(parseDateValue("2020-01-15")).toEqual({
        day: 15,
        month: 1,
        year: 2020,
      });
    });

    it("reduces a full ISO datetime to its calendar day", () => {
      expect(parseDateValue("2020-01-15T10:30:00")).toEqual({
        day: 15,
        month: 1,
        year: 2020,
      });
    });

    it("rejects a malformed ISO string", () => {
      expect(parseDateValue("not-a-date")).toBeNull();
      expect(parseDateValue("2020-13-40")).toBeNull();
    });
  });

  it("returns null for absent / wrong-typed input", () => {
    expect(parseDateValue(null)).toBeNull();
    expect(parseDateValue(undefined)).toBeNull();
    expect(parseDateValue("")).toBeNull();
    expect(parseDateValue(12345)).toBeNull();
    expect(parseDateValue({})).toBeNull();
  });
});
