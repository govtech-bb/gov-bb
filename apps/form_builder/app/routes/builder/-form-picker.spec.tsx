/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Mock } from "vitest";
import { FormPicker } from "./-form-picker";
import { getRecipe, getFormConfig } from "../../server/forms";
import type { BuilderFormSummary } from "../../types/index";
import type { OpenDeployPR } from "../../server/publish";
import type { RegistryCatalog } from "@govtech-bb/form-builder";

// getRecipe/getFormConfig are only invoked when a row is clicked; render-only
// tests never hit them, but mocking keeps the module from attempting a real RPC.
vi.mock("../../server/forms", () => ({
  getRecipe: vi.fn(),
  getFormConfig: vi.fn(),
}));

const CATALOG = {} as RegistryCatalog;
const FORMS: BuilderFormSummary[] = [
  { id: "passport", formId: "passport", title: "Passport Application", version: "1.2.0", isPublished: true },
];

const DRAFT: BuilderFormSummary = {
  id: "draft-form",
  formId: "draft-form",
  title: "Draft Form",
  version: "1.0.0",
  isPublished: false,
};
const LIVE_PUBLISHED: BuilderFormSummary = {
  id: "live",
  formId: "live",
  title: "Live Service",
  version: "1.0.0",
  isPublished: true,
};
const DISABLED_PUBLISHED: BuilderFormSummary = {
  id: "killed",
  formId: "killed",
  title: "Killed Service",
  version: "1.0.0",
  isPublished: true,
  isDisabled: true,
};
// Disabled but still has a draft row — openable, so it offers Enable and stays
// clickable.
const DISABLED_DRAFT: BuilderFormSummary = {
  id: "draft-disabled",
  formId: "draft-disabled",
  title: "Draft Disabled",
  version: "1.0.0",
  isPublished: false,
  isDisabled: true,
  isOrphanOverride: false,
};
// Disabled with no draft and no published recipe — nothing to open, so it's
// Enable-only and not row-clickable.
const ORPHAN_OVERRIDE: BuilderFormSummary = {
  id: "lost-form",
  formId: "lost-form",
  title: "lost-form",
  version: "",
  isPublished: false,
  isDisabled: true,
  isOrphanOverride: true,
};

// Published, and shadowed by a builder scratch row (#2411) — the case where a
// recipe hand-edited in the repo cannot reach the builder.
const SHADOWED_PUBLISHED: BuilderFormSummary = {
  id: "shadowed",
  formId: "shadowed",
  title: "Shadowed Service",
  version: "1.1.0",
  isPublished: true,
  hasDraftRow: true,
};

function renderPicker(props: Partial<React.ComponentProps<typeof FormPicker>> = {}) {
  return render(
    <FormPicker
      forms={null}
      loadError={null}
      isDirty={false}
      catalog={CATALOG}
      openPRs={new Map()}
      onLoad={vi.fn()}
      onClose={vi.fn()}
      onRequestDelete={vi.fn()}
      onRequestDisable={vi.fn()}
      onRequestErase={vi.fn()}
      onEnable={vi.fn()}
      onDuplicate={vi.fn()}
      {...props}
    />,
  );
}

describe("FormPicker", () => {
  // The module-level getRecipe/getFormConfig mocks accumulate calls across
  // tests; clear them so each row-click assertion starts from zero.
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading message while forms is null", () => {
    renderPicker({ forms: null, loadError: null });
    expect(screen.getByText(/loading forms/i)).toBeInTheDocument();
    expect(screen.queryByText(/no forms found/i)).not.toBeInTheDocument();
  });

  it("shows the empty message when the list loaded but is empty", () => {
    renderPicker({ forms: [], loadError: null });
    expect(screen.getByText(/no forms found/i)).toBeInTheDocument();
    expect(screen.queryByText(/loading forms/i)).not.toBeInTheDocument();
  });

  it("renders a row per form once loaded", () => {
    renderPicker({ forms: FORMS, loadError: null });
    expect(screen.getByText("Passport Application")).toBeInTheDocument();
    expect(screen.queryByText(/loading forms/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no forms found/i)).not.toBeInTheDocument();
  });

  it("surfaces a fetch error instead of the loading message", () => {
    renderPicker({ forms: null, loadError: "network boom" });
    expect(screen.getByText(/network boom/i)).toBeInTheDocument();
    expect(screen.queryByText(/loading forms/i)).not.toBeInTheDocument();
  });

  it("renders a Delete button for a draft (not published) and calls onRequestDelete", async () => {
    const onRequestDelete = vi.fn();
    renderPicker({ forms: [DRAFT], onRequestDelete });

    const deleteBtn = screen.getByRole("button", { name: /delete/i });
    expect(deleteBtn).toBeInTheDocument();
    // A draft offers neither Disable nor Enable, and never Erase.
    expect(screen.queryByRole("button", { name: /disable/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /enable/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /erase/i })).not.toBeInTheDocument();

    await userEvent.click(deleteBtn);
    expect(onRequestDelete).toHaveBeenCalledWith(DRAFT);
  });

  it("renders both Disable and Erase (not Delete) for a live published form and wires each", async () => {
    const onRequestDisable = vi.fn();
    const onRequestErase = vi.fn();
    renderPicker({ forms: [LIVE_PUBLISHED], onRequestDisable, onRequestErase });

    const disableBtn = screen.getByRole("button", { name: /^disable$/i });
    const eraseBtn = screen.getByRole("button", { name: /^erase$/i });
    expect(disableBtn).toBeInTheDocument();
    expect(eraseBtn).toBeInTheDocument();
    // A live published form must NOT offer the draft-only Delete.
    expect(screen.queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument();

    await userEvent.click(disableBtn);
    expect(onRequestDisable).toHaveBeenCalledWith(LIVE_PUBLISHED);

    await userEvent.click(eraseBtn);
    expect(onRequestErase).toHaveBeenCalledWith(LIVE_PUBLISHED);
  });

  it("renders a Disabled badge + Enable button (no Delete/Disable/Erase) for a disabled published form and calls onEnable", async () => {
    const onEnable = vi.fn();
    renderPicker({ forms: [DISABLED_PUBLISHED], onEnable });

    expect(screen.getByText(/disabled/i)).toBeInTheDocument();
    const enableBtn = screen.getByRole("button", { name: /enable/i });
    expect(enableBtn).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument();
    // The "Disable" action is gone once disabled (only Enable remains). The
    // Disabled badge text must not be matched as a Disable button.
    expect(screen.queryByRole("button", { name: /^disable$/i })).not.toBeInTheDocument();
    // Erase is offered only on LIVE published forms — a disabled form must be
    // Enabled first.
    expect(screen.queryByRole("button", { name: /^erase$/i })).not.toBeInTheDocument();

    await userEvent.click(enableBtn);
    expect(onEnable).toHaveBeenCalledWith(DISABLED_PUBLISHED);
  });

  it("renders a visibility badge for a non-public form (#1835)", () => {
    // Title deliberately free of the word "maintenance" so the assertion below
    // matches the badge, never the title text.
    const MAINTENANCE: BuilderFormSummary = {
      id: "m",
      formId: "m",
      title: "Passport Service",
      version: "1.0.0",
      isPublished: true,
      visibility: "maintenance",
    };
    renderPicker({ forms: [MAINTENANCE] });
    expect(screen.getByText(/maintenance/i)).toBeInTheDocument();
  });

  it("shows no visibility badge for a public form (#1835)", () => {
    const PUBLIC: BuilderFormSummary = {
      id: "p",
      formId: "p",
      title: "Public Service",
      version: "1.0.0",
      isPublished: true,
      visibility: "public",
    };
    renderPicker({ forms: [PUBLIC] });
    // The visibility badge appears only for non-public forms.
    expect(
      screen.queryByText(/^(preview|draft|maintenance)$/i),
    ).not.toBeInTheDocument();
  });

  it("duplicating a public form starts the copy hidden (visibility: draft, #1682)", async () => {
    (getRecipe as Mock).mockResolvedValue({
      formId: "passport",
      title: "Passport Application",
      steps: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      meta: { visibility: "public" },
    });
    const onDuplicate = vi.fn();
    renderPicker({ forms: FORMS, onDuplicate });

    await userEvent.click(screen.getByRole("button", { name: /duplicate/i }));

    expect(onDuplicate).toHaveBeenCalledTimes(1);
    const draft = onDuplicate.mock.calls[0][0];
    // A duplicate is a fresh, unpublished form — it must NOT inherit the
    // source's `public` launch state.
    expect(draft.meta).toEqual({ visibility: "draft" });
    expect(draft.formId).toBe("passport-copy");
  });

  it("renders Enable (not Delete) for a disabled draft-only form and keeps the row clickable", async () => {
    // Pending promises so handleSelect records the open attempt without running
    // the downstream deserialize/onLoad in this render-focused test.
    (getRecipe as Mock).mockReturnValue(new Promise(() => {}));
    (getFormConfig as Mock).mockReturnValue(new Promise(() => {}));
    const onEnable = vi.fn();
    renderPicker({ forms: [DISABLED_DRAFT], onEnable });

    // A disabled form takes the Enable branch, not the draft-only Delete branch.
    const enableBtn = screen.getByRole("button", { name: /enable/i });
    expect(enableBtn).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument();

    await userEvent.click(enableBtn);
    expect(onEnable).toHaveBeenCalledWith(DISABLED_DRAFT);

    // It still has a draft, so clicking the row opens it (fetches the recipe).
    // The pending getRecipe pins loadingId (disabling the buttons), so this is
    // asserted last.
    await userEvent.click(screen.getByText("Draft Disabled"));
    expect(getRecipe).toHaveBeenCalledWith({ data: { formId: "draft-disabled" } });
  });

  it("renders Enable only for an orphan-override row, hides Duplicate, and is not row-clickable", async () => {
    const onEnable = vi.fn();
    renderPicker({ forms: [ORPHAN_OVERRIDE], onEnable });

    const enableBtn = screen.getByRole("button", { name: /enable/i });
    expect(enableBtn).toBeInTheDocument();
    // Nothing to open, copy, delete, disable, or erase — Enable is the only action.
    expect(screen.queryByRole("button", { name: /duplicate/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^disable$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^erase$/i })).not.toBeInTheDocument();

    // No recipe to load — clicking the row must not attempt to open it. (The
    // title falls back to the formId, so it appears twice; the first is the row
    // title, and the click bubbles to the row container either way.)
    await userEvent.click(screen.getAllByText("lost-form")[0]);
    expect(getRecipe).not.toHaveBeenCalled();

    await userEvent.click(enableBtn);
    expect(onEnable).toHaveBeenCalledWith(ORPHAN_OVERRIDE);
  });

  describe("In review badge (#2390)", () => {
    const OPEN_PR: OpenDeployPR = {
      formId: "passport",
      prNumber: 42,
      prUrl: "https://github.com/govtech-bb/gov-bb/pull/42",
      branch: "deploy/passport",
    };

    it("renders the badge only for the row with an open Deploy PR", () => {
      renderPicker({
        forms: [FORMS[0], DRAFT],
        openPRs: new Map([[OPEN_PR.formId, OPEN_PR]]),
      });
      // Passport (formId matches the PR) shows it; Draft Form does not.
      expect(screen.getAllByText(/in review/i)).toHaveLength(1);
    });

    it("shows no badge when no form has an open PR", () => {
      renderPicker({ forms: [DRAFT], openPRs: new Map() });
      expect(screen.queryByText(/in review/i)).not.toBeInTheDocument();
    });

    it("exposes the PR number via the badge's title", () => {
      renderPicker({
        forms: FORMS,
        openPRs: new Map([[OPEN_PR.formId, OPEN_PR]]),
      });
      expect(screen.getByTitle(/#42/)).toBeInTheDocument();
    });

    it("clicking the badge opens the PR in a new tab and does not select/load the form", async () => {
      const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
      renderPicker({
        forms: FORMS,
        openPRs: new Map([[OPEN_PR.formId, OPEN_PR]]),
      });

      await userEvent.click(screen.getByText(/in review/i));

      expect(openSpy).toHaveBeenCalledWith(OPEN_PR.prUrl, "_blank", "noopener");
      // A click on the badge must not bubble to the row's select handler —
      // that would fetch the recipe and load the form into the editor.
      expect(getRecipe).not.toHaveBeenCalled();

      openSpy.mockRestore();
    });

    it("opens the PR on Enter for keyboard access", async () => {
      const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
      renderPicker({
        forms: FORMS,
        openPRs: new Map([[OPEN_PR.formId, OPEN_PR]]),
      });

      screen.getByText(/in review/i).focus();
      await userEvent.keyboard("{Enter}");

      expect(openSpy).toHaveBeenCalledWith(OPEN_PR.prUrl, "_blank", "noopener");
      expect(getRecipe).not.toHaveBeenCalled();

      openSpy.mockRestore();
    });
  });

  describe("Delete working copy (#2411)", () => {
    it("offers it for a published form that a scratch row is shadowing, reusing the delete flow", async () => {
      const onRequestDelete = vi.fn();
      renderPicker({ forms: [SHADOWED_PUBLISHED], onRequestDelete });

      const btn = screen.getByRole("button", { name: /delete working copy/i });
      await userEvent.click(btn);

      expect(onRequestDelete).toHaveBeenCalledWith(SHADOWED_PUBLISHED);
    });

    it("keeps Disable and Erase alongside it, and still offers no bare Delete", () => {
      renderPicker({ forms: [SHADOWED_PUBLISHED] });

      expect(screen.getByRole("button", { name: /^disable$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^erase$/i })).toBeInTheDocument();
      // #576: a bare "Delete" must never sit beside a live published service —
      // the working-copy action is labelled for what it actually removes.
      expect(screen.queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument();
    });

    it("offers nothing to delete for a published form with no scratch row", () => {
      renderPicker({ forms: [LIVE_PUBLISHED] });

      expect(
        screen.queryByRole("button", { name: /delete working copy/i }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument();
    });

    it("leaves a draft-only form on the plain Delete", () => {
      renderPicker({ forms: [{ ...DRAFT, hasDraftRow: true }] });

      expect(screen.getByRole("button", { name: /^delete$/i })).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /delete working copy/i }),
      ).not.toBeInTheDocument();
    });

    it("offers no working-copy delete for a disabled form — Enable wins the row", () => {
      renderPicker({ forms: [{ ...DISABLED_PUBLISHED, hasDraftRow: true }] });

      expect(
        screen.queryByRole("button", { name: /delete working copy/i }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /enable/i })).toBeInTheDocument();
    });
  });
});
