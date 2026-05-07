import { z } from "zod";
import { dynamic } from "./dynamic";

describe("dynamic", () => {
  const amount = dynamic(z.number().nonnegative());

  it("accepts a literal of the inner type", () => {
    expect(amount.safeParse(50).success).toBe(true);
  });

  it("accepts a JSONLogic rule (any plain object)", () => {
    expect(amount.safeParse({ if: [{ ">=": [1, 2] }, 0, 25] }).success).toBe(
      true,
    );
  });

  it("rejects values that are neither", () => {
    expect(amount.safeParse("not-a-number").success).toBe(false);
    expect(amount.safeParse([1, 2]).success).toBe(false);
    expect(amount.safeParse(null).success).toBe(false);
  });

  it("rejects literals that violate the inner constraint", () => {
    expect(amount.safeParse(-1).success).toBe(false);
  });

  it("string dynamic accepts a literal email", () => {
    const to = dynamic(z.string().email());
    expect(to.safeParse("a@b.co").success).toBe(true);
    expect(to.safeParse({ var: "values.email" }).success).toBe(true);
    expect(to.safeParse(42).success).toBe(false);
  });
});
