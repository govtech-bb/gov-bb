// scripts/recipe-version-guard.spec.ts
import { findGuardViolations, type ChangedFile } from "./recipe-version-guard";

const RECIPE = (formId: string, v: string) =>
  `apps/api/src/forms/form-definitions/recipes/${formId}/${v}.json`;

const added = (filename: string): ChangedFile => ({
  filename,
  status: "added",
});
const modified = (filename: string): ChangedFile => ({
  filename,
  status: "modified",
});
const removed = (filename: string): ChangedFile => ({
  filename,
  status: "removed",
});

describe("findGuardViolations", () => {
  it("passes a PR that adds a brand-new recipe version", () => {
    expect(
      findGuardViolations({
        prNumber: 900,
        changedFiles: [added(RECIPE("passport-renewal", "1.3.0"))],
        openPrs: [],
        hasOverrideLabel: false,
      }),
    ).toEqual([]);
  });

  it("fails a PR that modifies an existing recipe version (immutability)", () => {
    const violations = findGuardViolations({
      prNumber: 900,
      changedFiles: [modified(RECIPE("passport-renewal", "1.2.0"))],
      openPrs: [],
      hasOverrideLabel: false,
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/immutable/i);
    expect(violations[0]).toContain("passport-renewal/1.2.0.json");
  });

  it("treats a rename touching a recipe path as a modification", () => {
    const violations = findGuardViolations({
      prNumber: 900,
      changedFiles: [
        {
          filename: RECIPE("passport-renewal", "1.3.0"),
          status: "renamed",
          previous_filename: RECIPE("passport-renewal", "1.2.0"),
        },
      ],
      openPrs: [],
      hasOverrideLabel: false,
    });
    expect(violations).toHaveLength(1);
  });

  it("skips the immutability failure when the override label is present", () => {
    expect(
      findGuardViolations({
        prNumber: 900,
        changedFiles: [modified(RECIPE("passport-renewal", "1.2.0"))],
        openPrs: [],
        hasOverrideLabel: true,
      }),
    ).toEqual([]);
  });

  it("always allows deletions (erase/revert flows)", () => {
    expect(
      findGuardViolations({
        prNumber: 900,
        changedFiles: [removed(RECIPE("passport-renewal", "1.2.0"))],
        openPrs: [],
        hasOverrideLabel: false,
      }),
    ).toEqual([]);
  });

  it("fails when an OLDER open PR already adds the same version (older wins)", () => {
    const violations = findGuardViolations({
      prNumber: 900,
      changedFiles: [added(RECIPE("passport-renewal", "1.3.0"))],
      openPrs: [
        { number: 880, files: [added(RECIPE("passport-renewal", "1.3.0"))] },
      ],
      hasOverrideLabel: false,
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("#880");
  });

  it("passes when the colliding open PR is NEWER (that PR fails instead)", () => {
    expect(
      findGuardViolations({
        prNumber: 880,
        changedFiles: [added(RECIPE("passport-renewal", "1.3.0"))],
        openPrs: [
          { number: 900, files: [added(RECIPE("passport-renewal", "1.3.0"))] },
        ],
        hasOverrideLabel: false,
      }),
    ).toEqual([]);
  });

  it("the override label does NOT bypass a version collision", () => {
    const violations = findGuardViolations({
      prNumber: 900,
      changedFiles: [added(RECIPE("passport-renewal", "1.3.0"))],
      openPrs: [
        { number: 880, files: [added(RECIPE("passport-renewal", "1.3.0"))] },
      ],
      hasOverrideLabel: true,
    });
    expect(violations).toHaveLength(1);
  });

  it("ignores non-recipe files entirely", () => {
    expect(
      findGuardViolations({
        prNumber: 900,
        changedFiles: [
          modified("apps/api/src/main.ts"),
          added("docs/adr/0031.md"),
        ],
        openPrs: [],
        hasOverrideLabel: false,
      }),
    ).toEqual([]);
  });

  it("treats a copied recipe file as an add (Rule 1 exempt)", () => {
    expect(
      findGuardViolations({
        prNumber: 900,
        changedFiles: [
          {
            filename: RECIPE("passport-renewal", "1.3.0"),
            status: "copied",
            previous_filename: RECIPE("passport-renewal", "1.2.0"),
          },
        ],
        openPrs: [],
        hasOverrideLabel: false,
      }),
    ).toEqual([]);
  });

  it("treats an unchanged recipe file as a no-op (Rule 1 exempt)", () => {
    expect(
      findGuardViolations({
        prNumber: 900,
        changedFiles: [
          {
            filename: RECIPE("passport-renewal", "1.2.0"),
            status: "unchanged",
          },
        ],
        openPrs: [],
        hasOverrideLabel: false,
      }),
    ).toEqual([]);
  });

  it("counts a copied recipe file as a version claim (collides with older PR)", () => {
    const violations = findGuardViolations({
      prNumber: 900,
      changedFiles: [
        {
          filename: RECIPE("x", "1.3.0"),
          status: "copied",
          previous_filename: RECIPE("x", "1.2.0"),
        },
      ],
      openPrs: [{ number: 880, files: [added(RECIPE("x", "1.3.0"))] }],
      hasOverrideLabel: false,
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("#880");
  });

  it("names the recipe path when a version is renamed OUT of the recipes tree", () => {
    const violations = findGuardViolations({
      prNumber: 900,
      changedFiles: [
        {
          filename: "apps/api/src/forms/old/1.2.0.json",
          status: "renamed",
          previous_filename: RECIPE("passport-renewal", "1.2.0"),
        },
      ],
      openPrs: [],
      hasOverrideLabel: false,
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("passport-renewal/1.2.0.json");
  });
});
