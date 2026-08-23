import {
  deployBranchName,
  deployBranchPrefix,
  eraseBranchName,
  formIdFromDeployBranch,
} from "./deploy-branch";

describe("deploy branch names", () => {
  beforeEach(() => {
    // Freeze "now" so branch names are deterministic.
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
  });

  afterEach(() => vi.restoreAllMocks());

  describe("deployBranchName", () => {
    it("builds a versionless deploy branch (#1196)", () => {
      expect(deployBranchName("passport-renewal")).toBe(
        "form-builder/passport-renewal-1700000000000",
      );
    });

    it("never emits a '.' even if the formId contains one", () => {
      const branch = deployBranchName("weird.form.id");
      expect(branch).toBe("form-builder/weird-form-id-1700000000000");
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
      expect(deployBranchName("passport.renewal").startsWith(prefix)).toBe(
        true,
      );
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

  describe("formIdFromDeployBranch", () => {
    it("recovers the form id from a deploy branch head ref", () => {
      expect(
        formIdFromDeployBranch("form-builder/passport-renewal-1712345678901"),
      ).toBe("passport-renewal");
    });

    it("does not let a shorter sibling form id claim a longer form's branch (#2390 regression)", () => {
      // deployBranchPrefix("passport") is "form-builder/passport-", which is
      // ALSO a string-prefix of "passport-renewal"'s deploy branch. A naive
      // headRef.startsWith(prefix) check would let form "passport" match
      // this ref. It must resolve to "passport-renewal" and nothing shorter.
      const branch = "form-builder/passport-renewal-1712345678901";
      expect(branch.startsWith(deployBranchPrefix("passport"))).toBe(true);
      expect(formIdFromDeployBranch(branch)).toBe("passport-renewal");
      expect(formIdFromDeployBranch(branch)).not.toBe("passport");
    });

    it("round-trips through deployBranchName", () => {
      const branch = deployBranchName("birth-registration");
      expect(formIdFromDeployBranch(branch)).toBe("birth-registration");
    });

    it("returns null for a branch outside the form-builder/ namespace", () => {
      expect(formIdFromDeployBranch("start-page-foo-123")).toBeNull();
    });

    it("returns null for an Erase branch — Deploy and Erase must never be confused", () => {
      const erase = eraseBranchName("passport-renewal");
      expect(formIdFromDeployBranch(erase)).toBeNull();
    });

    it("returns null when there is no '-' at all after the namespace", () => {
      expect(formIdFromDeployBranch("form-builder/passportonly")).toBeNull();
    });

    it("returns null when there is no trailing timestamp", () => {
      expect(
        formIdFromDeployBranch("form-builder/passport-renewal"),
      ).toBeNull();
    });

    it("returns null when the trailing suffix is non-numeric", () => {
      expect(
        formIdFromDeployBranch("form-builder/passport-renewal-abc"),
      ).toBeNull();
    });

    it("returns null when the recovered id fails KEBAB_ID_PATTERN (spaces/casing)", () => {
      expect(formIdFromDeployBranch("form-builder/Foo Bar-123")).toBeNull();
    });

    it("returns null when the recovered id contains a nested ref segment", () => {
      expect(formIdFromDeployBranch("form-builder/a/b-123")).toBeNull();
    });
  });
});
