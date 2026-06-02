/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormPicker } from "./-form-picker";
import type { FormDefinitionSummary } from "../../types/index";
import type { RegistryCatalog } from "@govtech-bb/form-builder";

// getRecipe is only invoked when a row is clicked; render-only tests never hit
// it, but mocking keeps the module from attempting a real RPC.
jest.mock("../../server/forms", () => ({
  getRecipe: jest.fn(),
}));

const CATALOG = {} as RegistryCatalog;
const FORMS: FormDefinitionSummary[] = [
  { id: "passport", formId: "passport", title: "Passport Application", version: "1.2.0", isPublished: true },
];

const DRAFT: FormDefinitionSummary = {
  id: "draft-form",
  formId: "draft-form",
  title: "Draft Form",
  version: "1.0.0",
  isPublished: false,
};
const LIVE_PUBLISHED: FormDefinitionSummary = {
  id: "live",
  formId: "live",
  title: "Live Service",
  version: "1.0.0",
  isPublished: true,
};
const DISABLED_PUBLISHED: FormDefinitionSummary = {
  id: "killed",
  formId: "killed",
  title: "Killed Service",
  version: "1.0.0",
  isPublished: true,
  isDisabled: true,
};

function renderPicker(props: Partial<React.ComponentProps<typeof FormPicker>> = {}) {
  return render(
    <FormPicker
      forms={null}
      loadError={null}
      isDirty={false}
      catalog={CATALOG}
      onLoad={jest.fn()}
      onClose={jest.fn()}
      onRequestDelete={jest.fn()}
      onRequestDisable={jest.fn()}
      onEnable={jest.fn()}
      {...props}
    />,
  );
}

describe("FormPicker", () => {
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
    const onRequestDelete = jest.fn();
    renderPicker({ forms: [DRAFT], onRequestDelete });

    const deleteBtn = screen.getByRole("button", { name: /delete/i });
    expect(deleteBtn).toBeInTheDocument();
    // A draft offers neither Disable nor Enable.
    expect(screen.queryByRole("button", { name: /disable/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /enable/i })).not.toBeInTheDocument();

    await userEvent.click(deleteBtn);
    expect(onRequestDelete).toHaveBeenCalledWith(DRAFT);
  });

  it("renders a Disable button (not Delete) for a live published form and calls onRequestDisable", async () => {
    const onRequestDisable = jest.fn();
    renderPicker({ forms: [LIVE_PUBLISHED], onRequestDisable });

    const disableBtn = screen.getByRole("button", { name: /disable/i });
    expect(disableBtn).toBeInTheDocument();
    // A live published form must NOT offer the destructive Delete.
    expect(screen.queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument();

    await userEvent.click(disableBtn);
    expect(onRequestDisable).toHaveBeenCalledWith(LIVE_PUBLISHED);
  });

  it("renders a Disabled badge + Enable button (no Delete/Disable) for a disabled published form and calls onEnable", async () => {
    const onEnable = jest.fn();
    renderPicker({ forms: [DISABLED_PUBLISHED], onEnable });

    expect(screen.getByText(/disabled/i)).toBeInTheDocument();
    const enableBtn = screen.getByRole("button", { name: /enable/i });
    expect(enableBtn).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument();
    // The "Disable" action is gone once disabled (only Enable remains). The
    // Disabled badge text must not be matched as a Disable button.
    expect(screen.queryByRole("button", { name: /^disable$/i })).not.toBeInTheDocument();

    await userEvent.click(enableBtn);
    expect(onEnable).toHaveBeenCalledWith(DISABLED_PUBLISHED);
  });
});
