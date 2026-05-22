import { evaluateCondition } from "./validation-methods";

describe("evaluateCondition", () => {
  describe("gt", () => {
    it("returns true when conditionValue > 0 and target is 0", () => {
      expect(evaluateCondition(5, 0, "gt")).toBe(true);
    });

    it("returns false when conditionValue is 0 and target is 0", () => {
      expect(evaluateCondition(0, 0, "gt")).toBe(false);
    });

    it("returns false for non-numeric strings", () => {
      expect(evaluateCondition("abc", 1, "gt")).toBe(false);
    });

    it("returns false when either operand is an empty string", () => {
      expect(evaluateCondition(1, "", "gt")).toBe(false);
      expect(evaluateCondition("", 1, "gt")).toBe(false);
    });

    it("returns false when either operand is null or undefined", () => {
      expect(evaluateCondition(null as never, 1, "gt")).toBe(false);
      expect(evaluateCondition(1, undefined, "gt")).toBe(false);
    });
  });

  describe("lt", () => {
    it("returns true when conditionValue is 0 and target is positive", () => {
      expect(evaluateCondition(0, 5, "lt")).toBe(true);
    });

    it("returns false when conditionValue is 0 and target is 0", () => {
      expect(evaluateCondition(0, 0, "lt")).toBe(false);
    });

    it("returns false for non-numeric strings", () => {
      expect(evaluateCondition("abc", 1, "lt")).toBe(false);
    });

    it("returns false when either operand is an empty string", () => {
      expect(evaluateCondition(1, "", "lt")).toBe(false);
      expect(evaluateCondition("", 1, "lt")).toBe(false);
    });

    it("returns false when either operand is null or undefined", () => {
      expect(evaluateCondition(null as never, 1, "lt")).toBe(false);
      expect(evaluateCondition(1, undefined, "lt")).toBe(false);
    });
  });
});
