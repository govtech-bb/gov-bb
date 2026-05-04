import { DepartmentKeyResolver } from "./department-keys";

describe("DepartmentKeyResolver", () => {
  const r = new DepartmentKeyResolver({
    education: "edu-key",
    health: "health-key",
    default: "default-key",
  });

  it("returns the dept-specific key when present", () => {
    expect(r.get("education")).toBe("edu-key");
  });

  it("falls back to the default key", () => {
    expect(r.get("unknown")).toBe("default-key");
  });

  it("throws when neither dept nor default is set", () => {
    expect(() => new DepartmentKeyResolver({}).get("anything")).toThrow();
  });

  it("lists configured department names (excluding 'default')", () => {
    expect(r.departments()).toEqual(["education", "health"]);
  });

  describe("fromJson", () => {
    it("parses a valid JSON object of dept→key", () => {
      const r = DepartmentKeyResolver.fromJson(
        '{"education":"edu-key","default":"def-key"}',
      );
      expect(r.get("education")).toBe("edu-key");
      expect(r.get("unknown")).toBe("def-key");
    });

    it("throws on invalid JSON", () => {
      expect(() => DepartmentKeyResolver.fromJson("{not json")).toThrow(
        /not valid JSON/,
      );
    });

    it("throws when shape is not an object of strings", () => {
      expect(() => DepartmentKeyResolver.fromJson("[]")).toThrow(
        /shape invalid/,
      );
      expect(() => DepartmentKeyResolver.fromJson('{"a": 1}')).toThrow(
        /shape invalid/,
      );
      expect(() => DepartmentKeyResolver.fromJson("null")).toThrow(
        /shape invalid/,
      );
    });
  });
});
