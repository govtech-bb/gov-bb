/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { useRecipeValidation } from "./-use-recipe-validation";
import { EMPTY_DRAFT } from "./-recipe-reducer";
import type { RecipeDraft, RegistryCatalog } from "@govtech-bb/form-builder";
import type { FormUniquenessResult } from "./-form-uniqueness";

// A bare vi.fn (rather than vi.mocked on the real createServerFn) so
// mockResolvedValue isn't fighting the fetcher's return type — same pattern as
// index.spec.tsx. The factory delegates lazily so the hoisted vi.mock is fine.
const validateRecipe = vi.fn();

vi.mock("../../server/registry", () => ({
  validateRecipe: (...args: unknown[]) => validateRecipe(...args),
}));

const CATALOG: RegistryCatalog = { components: [], blocks: [], custom: [] };
const CLEAN: FormUniquenessResult = { idError: null, titleError: null };

// A draft that clears every pre-flight gate: a content-only editable step
// (markdown, no fields — valid), a well-formed formId/title, and non-draft
// visibility so the server round-trip is actually reached.
const VALID_DRAFT: RecipeDraft = {
  ...EMPTY_DRAFT,
  formId: "test-form",
  title: "Test Form",
  meta: { visibility: "preview" },
  steps: [
    ...EMPTY_DRAFT.steps,
    {
      stepId: "intro",
      title: "Intro",
      description: "",
      fields: [],
      behaviours: [],
      markdownContent: "# Hello",
    },
  ],
};

type Params = Parameters<typeof useRecipeValidation>[0];

function render(overrides: Partial<Params> = {}) {
  const onFocusProcessors = vi.fn();
  const hook = renderHook(() =>
    useRecipeValidation({
      draft: EMPTY_DRAFT,
      catalog: CATALOG,
      uniqueness: CLEAN,
      rekeyError: null,
      onFocusProcessors,
      ...overrides,
    }),
  );
  return { ...hook, onFocusProcessors };
}

describe("useRecipeValidation", () => {
  beforeEach(() => validateRecipe.mockReset());

  describe("runValidation pre-flight gates (no server call)", () => {
    it("fails when there are no editable steps, before hitting the server", async () => {
      const { result } = render({ draft: EMPTY_DRAFT });
      let res!: Awaited<ReturnType<typeof result.current.runValidation>>;
      await act(async () => {
        res = await result.current.runValidation();
      });
      expect(res.valid).toBe(false);
      expect(res.issues[0].path).toBe("steps");
      expect(result.current.lastSaveStatus).toBe("error");
      expect(validateRecipe).not.toHaveBeenCalled();
    });

    it("fails on missing formId and title even with an editable step", async () => {
      const { result } = render({
        draft: { ...VALID_DRAFT, formId: "", title: "" },
      });
      let res!: Awaited<ReturnType<typeof result.current.runValidation>>;
      await act(async () => {
        res = await result.current.runValidation();
      });
      expect(res.valid).toBe(false);
      expect(res.issues.map((i) => i.path)).toEqual(["formId", "title"]);
      expect(validateRecipe).not.toHaveBeenCalled();
    });
  });

  describe("runValidation server round-trip", () => {
    it("returns valid + success when the server accepts a clean draft", async () => {
      validateRecipe.mockResolvedValue({ ok: true });
      const { result } = render({ draft: VALID_DRAFT });
      let res!: Awaited<ReturnType<typeof result.current.runValidation>>;
      await act(async () => {
        res = await result.current.runValidation();
      });
      expect(validateRecipe).toHaveBeenCalledTimes(1);
      expect(res.valid).toBe(true);
      expect(result.current.lastSaveStatus).toBe("success");
    });

    it("surfaces a server 'invalid' verdict as an error status", async () => {
      // The network-failure catch branch is covered end-to-end in index.spec.tsx
      // ("hard-errors when the validate request itself fails"); here we cover the
      // server-returns-invalid branch, which needs no thrown error.
      validateRecipe.mockResolvedValue({
        ok: false,
        issues: [{ path: "steps", message: "server said no" }],
      });
      const { result } = render({ draft: VALID_DRAFT });
      let res!: Awaited<ReturnType<typeof result.current.runValidation>>;
      await act(async () => {
        res = await result.current.runValidation();
      });
      expect(res.valid).toBe(false);
      expect(res.issues).toEqual([{ path: "steps", message: "server said no" }]);
      expect(result.current.lastSaveStatus).toBe("error");
    });
  });

  describe("blockedByUniqueness", () => {
    it("returns false and lights no verdict when there are no collisions", () => {
      const { result } = render();
      let blocked!: boolean;
      act(() => {
        blocked = result.current.blockedByUniqueness();
      });
      expect(blocked).toBe(false);
      expect(result.current.validateResult).toBeNull();
    });

    it("blocks and lights the panel on an id collision", () => {
      const { result } = render({
        uniqueness: { idError: "dup id", titleError: null },
      });
      let blocked!: boolean;
      act(() => {
        blocked = result.current.blockedByUniqueness();
      });
      expect(blocked).toBe(true);
      expect(result.current.validateResult).toEqual({
        valid: false,
        issues: [{ path: "formId", message: "dup id" }],
      });
      expect(result.current.lastSaveStatus).toBe("error");
    });

    it("includes the rekey error alongside a title collision", () => {
      const { result } = render({
        uniqueness: { idError: null, titleError: "dup title" },
        rekeyError: "cannot rekey",
      });
      act(() => {
        result.current.blockedByUniqueness();
      });
      expect(result.current.validateResult?.issues).toEqual([
        { path: "formId", message: "cannot rekey" },
        { path: "title", message: "dup title" },
      ]);
    });
  });

  describe("blockedByDraftVisibility", () => {
    it("blocks a draft-visibility form", () => {
      const { result } = render({ draft: EMPTY_DRAFT }); // visibility: draft
      let blocked!: boolean;
      act(() => {
        blocked = result.current.blockedByDraftVisibility();
      });
      expect(blocked).toBe(true);
    });

    it("allows a preview/public form", () => {
      const { result } = render({ draft: VALID_DRAFT }); // visibility: preview
      let blocked!: boolean;
      act(() => {
        blocked = result.current.blockedByDraftVisibility();
      });
      expect(blocked).toBe(false);
    });
  });

  describe("blockedByIncompletePayment", () => {
    it("returns false (and does not steer to Processors) when defaults are complete", () => {
      const { result, onFocusProcessors } = render({ draft: EMPTY_DRAFT });
      let blocked!: boolean;
      act(() => {
        blocked = result.current.blockedByIncompletePayment();
      });
      expect(blocked).toBe(false);
      expect(onFocusProcessors).not.toHaveBeenCalled();
    });
  });

  it("dismiss clears the verdict and resets the status", () => {
    const { result } = render({
      uniqueness: { idError: "dup", titleError: null },
    });
    act(() => {
      result.current.blockedByUniqueness();
    });
    expect(result.current.validateResult).not.toBeNull();
    act(() => {
      result.current.dismiss();
    });
    expect(result.current.validateResult).toBeNull();
    expect(result.current.lastSaveStatus).toBe("idle");
  });
});
