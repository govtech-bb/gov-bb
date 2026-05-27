/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { FormPicker } from "./-form-picker";
import type { FormDefinitionSummary } from "../../../types/index";
import type { RegistryCatalog } from "@govtech-bb/form-builder";

// getRecipe is only invoked when a row is clicked; render-only tests never hit
// it, but mocking keeps the module from attempting a real RPC.
jest.mock("../../../server/forms", () => ({
  getRecipe: jest.fn(),
}));

const CATALOG = {} as RegistryCatalog;
const FORMS: FormDefinitionSummary[] = [
  { id: "passport", formId: "passport", title: "Passport Application", version: "1.2.0", isPublished: true },
];

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
});
