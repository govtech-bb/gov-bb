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
});
