import {
  AMPLIFY_BRANCH_LABEL_MAX,
  deployBranchLabel,
  deployBranchName,
  deployBranchPrefix,
  eraseBranchName,
  fitBranchSegment,
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

/** Amplify's preview host is the branch with every "/" turned into "-". */
function previewLabel(branch: string): string {
  return branch.replace(/\//g, "-");
}

// 84 chars — a real recipe id on main; its deploy branch would be 111.
const LONG_ID =
  "apply-for-national-summer-camp-programme-tropical-trails-and-tales-science-camp-2026";
// Same first 36 chars as LONG_ID, different tail.
const LONG_SIBLING =
  "apply-for-national-summer-camp-programme-tropical-trails-and-tales-science-camp-2027";

describe("over-length branch names (#2488)", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
  });

  afterEach(() => vi.restoreAllMocks());

  describe("fitBranchSegment", () => {
    it("returns the segment untouched when the label fits exactly", () => {
      // "form-builder/" (13) + 36 + "-1700000000000" (14) = 63.
      const segment = "a".repeat(36);
      expect(fitBranchSegment("form-builder/", segment)).toBe(segment);
    });

    it("truncates and appends a 6-char hash when one char over", () => {
      const fitted = fitBranchSegment("form-builder/", "a".repeat(37));
      expect(fitted).toMatch(/^a{29}-[a-z0-9]{6}$/);
      expect(fitted).toHaveLength(36);
    });

    it("never leaves a dangling or doubled hyphen where the cut lands on one", () => {
      // Budget for prefix "x/" is 63 - 2 - 14 = 47 → 40 chars kept before
      // "-<hash>"; index 39 of this segment is a hyphen, so the raw slice
      // would end with "-".
      const segment = `${"a".repeat(39)}-${"b".repeat(20)}`;
      const fitted = fitBranchSegment("x/", segment);
      expect(fitted).toMatch(/^a{39}-[a-z0-9]{6}$/);
      expect(fitted).not.toMatch(/--/);
    });

    it("is deterministic — the same input always fits the same way", () => {
      expect(fitBranchSegment("form-builder/", LONG_ID)).toBe(
        fitBranchSegment("form-builder/", LONG_ID),
      );
    });

    it("gives two ids with the same truncated head different hashes", () => {
      const a = fitBranchSegment("form-builder/", LONG_ID);
      const b = fitBranchSegment("form-builder/", LONG_SIBLING);
      expect(a.slice(0, -7)).toBe(b.slice(0, -7));
      expect(a).not.toBe(b);
    });
  });

  describe("generators stay within the DNS label cap", () => {
    it("deployBranchName", () => {
      const branch = deployBranchName(LONG_ID);
      expect(previewLabel(branch).length).toBeLessThanOrEqual(
        AMPLIFY_BRANCH_LABEL_MAX,
      );
      expect(branch).toMatch(/^form-builder\/[a-z0-9-]+-1700000000000$/);
      expect(branch).not.toContain(".");
    });

    it("eraseBranchName", () => {
      const branch = eraseBranchName(LONG_ID);
      expect(previewLabel(branch).length).toBeLessThanOrEqual(
        AMPLIFY_BRANCH_LABEL_MAX,
      );
      expect(branch).toMatch(/^form-builder\/erase-[a-z0-9-]+-1700000000000$/);
    });

    it("deployBranchPrefix still prefixes deployBranchName for a long id", () => {
      expect(
        deployBranchName(LONG_ID).startsWith(deployBranchPrefix(LONG_ID)),
      ).toBe(true);
    });

    it("leaves short ids exactly as before", () => {
      expect(deployBranchName("passport-renewal")).toBe(
        "form-builder/passport-renewal-1700000000000",
      );
    });
  });

  // The artifact↔PR join (ADR 0070): the candidate-free parser recovers the
  // branch's label, and the caller compares it to deployBranchLabel(formId).
  describe("deployBranchLabel ↔ formIdFromDeployBranch", () => {
    it("is the id itself when it fits", () => {
      expect(deployBranchLabel("passport-renewal")).toBe("passport-renewal");
    });

    it("is the fitted segment for an over-length id", () => {
      expect(deployBranchLabel(LONG_ID)).toBe(
        fitBranchSegment("form-builder/", LONG_ID),
      );
      expect(deployBranchLabel(LONG_ID)).not.toBe(LONG_ID);
    });

    it("round-trips: the parser recovers exactly the label from a form's own branch, short or long", () => {
      for (const id of ["passport-renewal", LONG_ID]) {
        expect(formIdFromDeployBranch(deployBranchName(id))).toBe(
          deployBranchLabel(id),
        );
      }
    });

    it("does not let a shorter sibling claim a longer form's branch (#2390)", () => {
      expect(
        formIdFromDeployBranch("form-builder/passport-renewal-1712345678901"),
      ).not.toBe(deployBranchLabel("passport"));
    });

    it("keeps two long ids that share a truncated head apart", () => {
      expect(formIdFromDeployBranch(deployBranchName(LONG_ID))).not.toBe(
        deployBranchLabel(LONG_SIBLING),
      );
    });

    it("never joins an Erase branch to a form whose id begins with 'erase-'", () => {
      // eraseBranchName("passport") and deployBranchName("erase-passport") are
      // the same string; only the parser's namespace check tells them apart,
      // which is why the join must go through the parser and not a prefix
      // test that takes the candidate id.
      expect(eraseBranchName("passport")).toBe(
        deployBranchName("erase-passport"),
      );
      expect(formIdFromDeployBranch(eraseBranchName("passport"))).toBeNull();
    });
  });
});
