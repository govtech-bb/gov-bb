/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { Toolbar } from "./-toolbar";

function renderToolbar(overrides: Partial<Parameters<typeof Toolbar>[0]> = {}) {
  const onFormIdChange = jest.fn();
  const props = {
    formId: "",
    title: "",
    version: "1.0.0",
    idError: null,
    isDirty: false,
    hasUnsavedChanges: false,
    isValidating: false,
    isPreviewing: false,
    isSubmitting: false,
    isPublishing: false,
    lastSaveStatus: "idle" as const,
    onFormIdChange,
    onTitleChange: jest.fn(),
    onNew: jest.fn(),
    onOpen: jest.fn(),
    onValidate: jest.fn(),
    onPreview: jest.fn(),
    onSubmit: jest.fn(),
    onPublish: jest.fn(),
    onDiscard: jest.fn(),
    ...overrides,
  };
  render(<Toolbar {...props} />);
  return { onFormIdChange: props.onFormIdChange, onDiscard: props.onDiscard };
}

function formIdInput() {
  return screen.getByLabelText(/form id/i);
}

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
