import { describe, expect, it } from "vitest";
import { openDb } from "./db.js";

describe("openDb", () => {
  it("creates the pages and forms tables", () => {
    const db = openDb(":memory:");

    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    const names = rows.map((row) => row.name);

    expect(names).toContain("pages");
    expect(names).toContain("forms");
  });
});
