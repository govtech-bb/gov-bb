import {
  deployBranchName,
  deployBranchPrefix,
  eraseBranchName,
} from "./deploy-branch";

describe("deploy branch names", () => {
  beforeEach(() => {
    // Freeze "now" so branch names are deterministic.
    jest.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
  });

  afterEach(() => jest.restoreAllMocks());

  describe("deployBranchName", () => {
    it("replaces the version's dots with dashes (#805)", () => {
      expect(deployBranchName("passport-renewal", "1.2.0")).toBe(
        "form-builder/passport-renewal-1-2-0-1700000000000",
      );
    });

    it("never emits a '.' even if the formId contains one", () => {
      const branch = deployBranchName("weird.form.id", "2.0.0");
      expect(branch).toBe("form-builder/weird-form-id-2-0-0-1700000000000");
      expect(branch).not.toContain(".");
    });
  });

  describe("deployBranchPrefix", () => {
    it("sanitizes dots and ends with a trailing dash", () => {
      expect(deployBranchPrefix("passport.renewal")).toBe(
        "form-builder/passport-renewal-",
      );
    });

    it("is the prefix of the full deploy branch name (produce/parse contract)", () => {
      // listOpenDeployClaims relies on deployBranchName starting with the
      // prefix so it can recognise open deploy PRs for a form (#873).
      const prefix = deployBranchPrefix("passport.renewal");
      expect(
        deployBranchName("passport.renewal", "1.2.0").startsWith(prefix),
      ).toBe(true);
    });
  });

  describe("eraseBranchName", () => {
    it("builds the erase branch and never emits a '.'", () => {
      expect(eraseBranchName("passport-renewal")).toBe(
        "form-builder/erase-passport-renewal-1700000000000",
      );
      expect(eraseBranchName("weird.form.id")).toBe(
        "form-builder/erase-weird-form-id-1700000000000",
      );
    });
  });
});
