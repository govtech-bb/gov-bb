import {
  latestVersionPerFormSql,
  normalizeTitle,
  findTitleCollision,
  type FormTitleRow,
} from "./form-uniqueness";

describe("latestVersionPerFormSql", () => {
  it("selects the requested columns with the semver-aware DISTINCT ON ordering", () => {
    const sql = latestVersionPerFormSql("form_id, schema->>'title' AS title");
    expect(sql).toContain("DISTINCT ON (form_id)");
    expect(sql).toContain("form_id, schema->>'title' AS title");
    expect(sql).toContain("FROM form_definitions");
    expect(sql).toContain(
      "ORDER BY form_id, string_to_array(version, '.')::int[] DESC",
    );
  });
});

describe("normalizeTitle", () => {
  it("trims surrounding whitespace and lowercases", () => {
    expect(normalizeTitle("  Birth Registration ")).toBe("birth registration");
  });

  it("treats case- and whitespace-only differences as equal", () => {
    expect(normalizeTitle("Birth Registration")).toBe(
      normalizeTitle("  birth registration "),
    );
  });
});

describe("findTitleCollision", () => {
  const rows: FormTitleRow[] = [
    { form_id: "birth-registration", title: "Birth Registration" },
    { form_id: "death-certificate", title: "Death Certificate" },
    { form_id: "no-title", title: null },
  ];

  it("returns the colliding row for a case/whitespace-insensitive match", () => {
    expect(
      findTitleCollision(rows, "  birth registration ", "new-form"),
    ).toEqual({ form_id: "birth-registration", title: "Birth Registration" });
  });

  it("returns null when no other form shares the title", () => {
    expect(findTitleCollision(rows, "Marriage License", "new-form")).toBeNull();
  });

  it("ignores the form identified by excludeFormId (rename-to-self)", () => {
    expect(
      findTitleCollision(rows, "Birth Registration", "birth-registration"),
    ).toBeNull();
  });

  it("never collides on an empty / whitespace-only incoming title", () => {
    expect(findTitleCollision(rows, "   ", "new-form")).toBeNull();
  });

  it("skips rows with a null title", () => {
    expect(findTitleCollision(rows, "", "x")).toBeNull();
  });
});
