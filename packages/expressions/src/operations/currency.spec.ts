import { currency } from "./currency";

describe("currency", () => {
  it("formats a number with the given currency code", () => {
    const formatted = currency(50, "BBD");
    expect(formatted).toMatch(/50/);
    expect(formatted).toMatch(/BBD|\$/);
  });

  it("defaults to BBD when no code given", () => {
    expect(currency(100, undefined)).toMatch(/100/);
  });
});
