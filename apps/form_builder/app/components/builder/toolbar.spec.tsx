/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent } from "../../test/ui";
import { Toolbar } from "./toolbar";

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
    status: "public" as const,
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
  const settings = screen.getByRole("button", { name: /Form settings/ });
  if (settings.getAttribute("aria-expanded") === "false")
    fireEvent.click(settings);
  return {
    onFormIdChange: props.onFormIdChange,
    onDiscard: props.onDiscard,
  };
}

function formIdInput() {
  return screen.getByLabelText(/form id/i);
}

describe("Toolbar — read-only status from the API (#2875)", () => {
  it("shows the status apps/api reports and where to change it, with no control", () => {
    renderToolbar({ status: "maintenance" });
    expect(screen.getByTestId("form-status")).toHaveTextContent("Maintenance");
    expect(
      screen.getByText(/set in the feature flagging tool/i),
    ).toBeInTheDocument();
    // #1682's Visibility select is gone: the builder never edits the status.
    expect(
      screen.queryByRole("combobox", { name: /visibility/i }),
    ).not.toBeInTheDocument();
  });

  it("summarises the status next to Form settings", () => {
    renderToolbar({ status: "preview" });
    expect(
      screen.getByRole("button", { name: /Form settings/ }),
    ).toHaveTextContent("Preview");
  });

  it("says 'Not published' for a form with no live status yet", () => {
    renderToolbar({ status: null });
    expect(screen.getByTestId("form-status")).toHaveTextContent(
      "Not published",
    );
  });

  it("says the status is unavailable when the API could not report one", () => {
    renderToolbar({ status: "unavailable" });
    expect(screen.getByTestId("form-status")).toHaveTextContent(
      "Status unavailable",
    );
  });

  it("says it is checking while the forms list is in flight", () => {
    renderToolbar({ status: "loading" });
    expect(screen.getByTestId("form-status")).toHaveTextContent(
      "Checking status…",
    );
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
    fireEvent.click(screen.getByRole("button", { name: "More form actions" }));
    return screen.getByRole("menuitem", { name: /discard/i });
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

    expect(discardButton()).not.toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getByRole("menuitem", { name: /discard/i }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it("disables Discard when the draft is clean", () => {
    renderToolbar({ hasUnsavedChanges: false });

    expect(discardButton()).toHaveAttribute("aria-disabled", "true");
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

    expect(screen.getByRole("button", { name: /^publish$/i })).toBeDisabled();
  });

  it("enables Deploy when the draft is clean", () => {
    renderToolbar({ hasUnsavedChanges: false });

    expect(screen.getByRole("button", { name: /^publish$/i })).toBeEnabled();
  });
});

describe("Toolbar — Deploy is never gated on status (#2875)", () => {
  // #1682 disabled Deploy while the recipe's `meta.visibility` was `draft`.
  // Status is the service_status row's job now, so a clean form deploys
  // whatever the API reports — including no status at all.
  it.each([
    "draft",
    "preview",
    "public",
    "maintenance",
    "unavailable",
    "loading",
    null,
  ] as const)("enables Deploy on a clean form when status is %s", (status) => {
    renderToolbar({ hasUnsavedChanges: false, status });

    expect(screen.getByRole("button", { name: /^publish$/i })).toBeEnabled();
    expect(
      screen.queryByText(/set visibility to preview or public/i),
    ).not.toBeInTheDocument();
  });
});

describe("Toolbar — read-only lock (#874)", () => {
  it("disables Save draft when read-only, even with unsaved changes", () => {
    renderToolbar({ hasUnsavedChanges: true, isReadOnly: true });
    expect(screen.getByRole("button", { name: /save draft/i })).toBeDisabled();
  });

  it("disables Deploy when read-only, even on a clean draft", () => {
    renderToolbar({ hasUnsavedChanges: false, isReadOnly: true });
    expect(screen.getByRole("button", { name: /^publish$/i })).toBeDisabled();
  });

  it("disables the Form ID and Title inputs when read-only", () => {
    renderToolbar({ isReadOnly: true });
    expect(formIdInput()).toBeDisabled();
    expect(screen.getByLabelText(/title/i)).toBeDisabled();
  });
});
