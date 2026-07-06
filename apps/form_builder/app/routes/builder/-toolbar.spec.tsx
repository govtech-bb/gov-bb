/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { Toolbar } from "./-toolbar";

function renderToolbar(overrides: Partial<Parameters<typeof Toolbar>[0]> = {}) {
  const onFormIdChange = vi.fn();
  const props = {
    formId: "",
    title: "",
    idError: null,
    isDirty: false,
    hasUnsavedChanges: false,
    isValidating: false,
    isPreviewing: false,
    isSubmitting: false,
    isPublishing: false,
    isReadOnly: false,
    lastSaveStatus: "idle" as const,
    visibility: "public" as const,
    onVisibilityChange: vi.fn(),
    onFormIdChange,
    onTitleChange: vi.fn(),
    onNew: vi.fn(),
    onOpen: vi.fn(),
    onValidate: vi.fn(),
    onPreview: vi.fn(),
    onSubmit: vi.fn(),
    onPublish: vi.fn(),
    onDiscard: vi.fn(),
    ...overrides,
  };
  render(<Toolbar {...props} />);
  return {
    onFormIdChange: props.onFormIdChange,
    onDiscard: props.onDiscard,
    onVisibilityChange: props.onVisibilityChange,
  };
}

function formIdInput() {
  return screen.getByLabelText(/form id/i);
}

describe("Toolbar — Visibility selector (#1682)", () => {
  it("reflects the current visibility value", () => {
    renderToolbar({ visibility: "draft" });
    expect(screen.getByLabelText(/visibility/i)).toHaveValue("draft");
  });

  it("offers public, preview, draft and maintenance options", () => {
    renderToolbar();
    const select = screen.getByLabelText(/visibility/i);
    const values = Array.from(
      select.querySelectorAll("option"),
      (o) => (o as HTMLOptionElement).value,
    );
    expect(values).toEqual(["public", "preview", "draft", "maintenance"]);
  });

  it("calls onVisibilityChange with the selected level", () => {
    const { onVisibilityChange } = renderToolbar({ visibility: "public" });
    fireEvent.change(screen.getByLabelText(/visibility/i), {
      target: { value: "preview" },
    });
    expect(onVisibilityChange).toHaveBeenCalledWith("preview");
  });

  it("is disabled when the form is read-only", () => {
    renderToolbar({ isReadOnly: true });
    expect(screen.getByLabelText(/visibility/i)).toBeDisabled();
  });
});

describe("Toolbar — Form ID input", () => {
  it("shows 'Form ID is required' and still propagates the empty value when cleared", () => {
    const { onFormIdChange } = renderToolbar({ formId: "birth" });

    fireEvent.change(formIdInput(), { target: { value: "" } });

    expect(screen.getByText(/form id is required/i)).toBeInTheDocument();
    expect(onFormIdChange).toHaveBeenCalledWith("");
  });

  it("shows the shared kebab-case error for a malformed id and still propagates the value", () => {
    const { onFormIdChange } = renderToolbar();

    // Underscores survive the toolbar's whitespace→hyphen normalization, so the
    // value stays malformed and must be flagged (and propagated so the
    // controlled input reflects what the author typed).
    fireEvent.change(formIdInput(), { target: { value: "foo_bar" } });

    expect(
      screen.getByText(/lowercase letters, numbers, and hyphens only/i),
    ).toBeInTheDocument();
    expect(onFormIdChange).toHaveBeenCalledWith("foo_bar");
  });

  it("flags a trailing hyphen (stricter than the old pattern allowed)", () => {
    renderToolbar();

    fireEvent.change(formIdInput(), { target: { value: "foo-" } });

    expect(
      screen.getByText(/lowercase letters, numbers, and hyphens only/i),
    ).toBeInTheDocument();
  });

  it("accepts a well-formed kebab id with no error", () => {
    const { onFormIdChange } = renderToolbar();

    fireEvent.change(formIdInput(), {
      target: { value: "birth-registration" },
    });

    expect(
      screen.queryByText(/lowercase letters, numbers, and hyphens only/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/form id is required/i)).not.toBeInTheDocument();
    expect(onFormIdChange).toHaveBeenCalledWith("birth-registration");
  });
});

describe("Toolbar — unsaved changes + Discard", () => {
  function discardButton() {
    return screen.getByRole("button", { name: /discard/i });
  }
  function saveDraftButton() {
    return screen.getByRole("button", { name: /save draft/i });
  }

  it("shows the 'Unsaved changes' indicator when there are unsaved changes", () => {
    renderToolbar({ hasUnsavedChanges: true });

    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
  });

  it("hides the 'Unsaved changes' indicator when the draft is clean", () => {
    renderToolbar({ hasUnsavedChanges: false });

    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();
  });

  it("enables Discard and calls onDiscard when there are unsaved changes", () => {
    const { onDiscard } = renderToolbar({ hasUnsavedChanges: true });

    expect(discardButton()).toBeEnabled();
    fireEvent.click(discardButton());
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it("disables Discard when the draft is clean", () => {
    renderToolbar({ hasUnsavedChanges: false });

    expect(discardButton()).toBeDisabled();
  });

  it("disables Save draft when the draft is clean", () => {
    renderToolbar({ hasUnsavedChanges: false });

    expect(saveDraftButton()).toBeDisabled();
  });

  it("enables Save draft when there are unsaved changes", () => {
    renderToolbar({ hasUnsavedChanges: true });

    expect(saveDraftButton()).toBeEnabled();
  });

  it("disables Deploy when there are unsaved changes (#331)", () => {
    renderToolbar({ hasUnsavedChanges: true });

    expect(screen.getByRole("button", { name: /deploy/i })).toBeDisabled();
  });

  it("enables Deploy when the draft is clean", () => {
    renderToolbar({ hasUnsavedChanges: false });

    expect(screen.getByRole("button", { name: /deploy/i })).toBeEnabled();
  });
});

describe("Toolbar — Deploy blocked while visibility is draft (#1682)", () => {
  it("disables Deploy when visibility is draft, even on a clean valid draft", () => {
    renderToolbar({ hasUnsavedChanges: false, visibility: "draft" });

    expect(screen.getByRole("button", { name: /deploy/i })).toBeDisabled();
  });

  it("shows a hint telling the author to set Preview or Public", () => {
    renderToolbar({ hasUnsavedChanges: false, visibility: "draft" });

    expect(
      screen.getByText(/set visibility to preview or public to deploy/i),
    ).toBeInTheDocument();
  });

  it("enables Deploy when visibility is preview", () => {
    renderToolbar({ hasUnsavedChanges: false, visibility: "preview" });

    expect(screen.getByRole("button", { name: /deploy/i })).toBeEnabled();
  });

  it("enables Deploy when visibility is public", () => {
    renderToolbar({ hasUnsavedChanges: false, visibility: "public" });

    expect(screen.getByRole("button", { name: /deploy/i })).toBeEnabled();
  });

  it("enables Deploy when visibility is maintenance (#1694)", () => {
    renderToolbar({ hasUnsavedChanges: false, visibility: "maintenance" });

    expect(screen.getByRole("button", { name: /deploy/i })).toBeEnabled();
  });
});

describe("Toolbar — read-only lock (#874)", () => {
  it("disables Save draft when read-only, even with unsaved changes", () => {
    renderToolbar({ hasUnsavedChanges: true, isReadOnly: true });
    expect(
      screen.getByRole("button", { name: /save draft/i }),
    ).toBeDisabled();
  });

  it("disables Deploy when read-only, even on a clean draft", () => {
    renderToolbar({ hasUnsavedChanges: false, isReadOnly: true });
    expect(screen.getByRole("button", { name: /deploy/i })).toBeDisabled();
  });

  it("disables the Form ID and Title inputs when read-only", () => {
    renderToolbar({ isReadOnly: true });
    expect(formIdInput()).toBeDisabled();
    expect(screen.getByLabelText(/title/i)).toBeDisabled();
  });
});
