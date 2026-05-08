import { today } from "./today";

describe("today", () => {
  it("returns ISO date YYYY-MM-DD", () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
