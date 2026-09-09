/**
 * @vitest-environment jsdom
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { useFormsList } from "./-use-forms-list";
import { listForms } from "../../server/forms";
import { listOpenDeployPRs, type OpenDeployPR } from "../../server/publish";
import type { BuilderFormSummary } from "../../types/index";

vi.mock("../../server/forms", () => ({
  listForms: vi.fn(),
}));
// listOpenDeployPRs (#2390) is fetched alongside listForms; mock it so the
// existing tests below don't hit a real createServerFn RPC.
vi.mock("../../server/publish", () => ({
  listOpenDeployPRs: vi.fn(),
}));

const mockListForms = vi.mocked(listForms);
const mockListOpenDeployPRs = vi.mocked(listOpenDeployPRs);

const FORMS: BuilderFormSummary[] = [
  { id: "passport", formId: "passport", title: "Passport", version: "1.0.0", isPublished: true },
];

const OPEN_PR: OpenDeployPR = {
  formId: "passport",
  prNumber: 7,
  prUrl: "https://github.com/govtech-bb/gov-bb/pull/7",
  branch: "deploy/passport",
};

describe("useFormsList", () => {
  beforeEach(() => {
    mockListForms.mockReset();
    mockListOpenDeployPRs.mockReset();
    // Most tests below don't care about PRs; default to none so Promise.all
    // settles instead of hanging on an un-mocked pending call.
    mockListOpenDeployPRs.mockResolvedValue([]);
  });

  it("starts loading: forms is null and there is no error", () => {
    // A promise that never settles keeps the hook in its initial state.
    mockListForms.mockReturnValue(new Promise<BuilderFormSummary[]>(() => {}));
    const { result } = renderHook(() => useFormsList());
    expect(result.current.forms).toBeNull();
    expect(result.current.loadError).toBeNull();
  });

  it("populates forms once listForms resolves", async () => {
    mockListForms.mockResolvedValue(FORMS);
    const { result } = renderHook(() => useFormsList());
    await waitFor(() => expect(result.current.forms).toEqual(FORMS));
    expect(result.current.loadError).toBeNull();
  });

  it("sets loadError (and leaves forms null) when listForms rejects", async () => {
    mockListForms.mockRejectedValue(new Error("network boom"));
    const { result } = renderHook(() => useFormsList());
    await waitFor(() => expect(result.current.loadError).toBe("network boom"));
    expect(result.current.forms).toBeNull();
  });

  it("does not apply a late resolution after unmount", async () => {
    let resolve!: (v: BuilderFormSummary[]) => void;
    mockListForms.mockReturnValue(
      new Promise<BuilderFormSummary[]>((r) => {
        resolve = r;
      }),
    );
    const { result, unmount } = renderHook(() => useFormsList());
    unmount();
    resolve(FORMS);
    await Promise.resolve();
    // The unmount guard must prevent a post-unmount state write; the last
    // rendered value stays at the loading state.
    expect(result.current.forms).toBeNull();
  });

  it("calls listForms exactly once on mount", () => {
    mockListForms.mockReturnValue(new Promise<BuilderFormSummary[]>(() => {}));
    renderHook(() => useFormsList());
    expect(mockListForms).toHaveBeenCalledTimes(1);
  });

  describe("openPRs (#2390)", () => {
    it("assembles openPRs keyed by formId once both calls resolve", async () => {
      mockListForms.mockResolvedValue(FORMS);
      mockListOpenDeployPRs.mockResolvedValue([OPEN_PR]);
      const { result } = renderHook(() => useFormsList());
      await waitFor(() => expect(result.current.forms).toEqual(FORMS));
      expect(result.current.openPRs).toEqual(
        new Map([[OPEN_PR.formId, OPEN_PR]]),
      );
    });

    it("keeps the highest-numbered PR when one form has two open Deploy PRs", async () => {
      // findOpenPRByHeadRef breaks this tie by highest PR number, so the badge
      // must link to the SAME PR the next Deploy would push onto (#2390) —
      // otherwise the picker points at one PR while Deploy writes to another.
      mockListForms.mockResolvedValue(FORMS);
      mockListOpenDeployPRs.mockResolvedValue([
        { ...OPEN_PR, prNumber: 9, prUrl: "https://example.test/9" },
        { ...OPEN_PR, prNumber: 4, prUrl: "https://example.test/4" },
      ]);
      const { result } = renderHook(() => useFormsList());
      await waitFor(() => expect(result.current.openPRs.size).toBe(1));
      expect(result.current.openPRs.get("passport")?.prNumber).toBe(9);
    });

    it("degrades to an empty map (not a load failure) when listOpenDeployPRs rejects", async () => {
      // A GitHub hiccup/rate-limit on the PR lookup must never blank the
      // whole Open picker — the forms list comes from a different backend.
      mockListForms.mockResolvedValue(FORMS);
      mockListOpenDeployPRs.mockRejectedValue(new Error("rate limited"));
      const { result } = renderHook(() => useFormsList());
      await waitFor(() => expect(result.current.forms).toEqual(FORMS));
      expect(result.current.openPRs).toEqual(new Map());
      expect(result.current.loadError).toBeNull();
    });
  });

  describe("upsertForm", () => {
    it("replaces the matching formId entry in place without refetching", async () => {
      mockListForms.mockResolvedValue(FORMS);
      const { result } = renderHook(() => useFormsList());
      await waitFor(() => expect(result.current.forms).toEqual(FORMS));

      const updated: BuilderFormSummary = {
        id: "passport",
        formId: "passport",
        title: "Passport (renamed)",
        version: "2.0.0",
        isPublished: false,
      };
      act(() => result.current.upsertForm(updated));

      expect(result.current.forms).toEqual([updated]);
      // The cheap upsert must not trigger another slow listForms waterfall.
      expect(mockListForms).toHaveBeenCalledTimes(1);
    });

    it("appends when no entry with that formId exists yet", async () => {
      mockListForms.mockResolvedValue(FORMS);
      const { result } = renderHook(() => useFormsList());
      await waitFor(() => expect(result.current.forms).toEqual(FORMS));

      const added: BuilderFormSummary = {
        id: "licence",
        formId: "licence",
        title: "Driving Licence",
        version: "1.0.0",
        isPublished: false,
      };
      act(() => result.current.upsertForm(added));

      expect(result.current.forms).toEqual([...FORMS, added]);
    });

    it("no-ops while the list is still loading (forms is null)", () => {
      mockListForms.mockReturnValue(new Promise<BuilderFormSummary[]>(() => {}));
      const { result } = renderHook(() => useFormsList());
      expect(result.current.forms).toBeNull();

      act(() =>
        result.current.upsertForm({
          id: "licence",
          formId: "licence",
          title: "Driving Licence",
          version: "1.0.0",
          isPublished: false,
        }),
      );

      // Nothing to patch yet; the pending mount fetch still owns the eventual list.
      expect(result.current.forms).toBeNull();
    });
  });
});
