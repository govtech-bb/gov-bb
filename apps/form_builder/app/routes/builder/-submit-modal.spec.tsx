/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { SubmitModal } from "./-submit-modal";
import type { RecipeDraft } from "@govtech-bb/form-builder";

// VITE_FORMS_URL is stubbed by ts-jest-mock-import-meta (see jest.config.ts).
const draft = {
  formId: "passport",
  title: "Passport Application",
  description: "",
  steps: [],
} as unknown as RecipeDraft;

function renderModal(props: Partial<React.ComponentProps<typeof SubmitModal>> = {}) {
  return render(
    <SubmitModal
      draft={draft}
      version="1.0.0"
      currentVersion={null}
      loadedFromId={null}
      isSubmitting={false}
      submitSuccess={false}
      submitError={null}
      onSubmit={jest.fn()}
      onClose={jest.fn()}
      {...props}
    />,
  );
}

describe("SubmitModal preview link", () => {
  it("shows a Preview form link to VITE_FORMS_URL/forms/{id} with the preview token after a successful save", () => {
    renderModal({ submitSuccess: true });

    const link = screen.getByRole("link", { name: /preview form/i });
    expect(link).toHaveAttribute(
      "href",
      "https://forms.example.test/forms/passport?preview=stub-token",
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("does not show the preview link before a successful save", () => {
    renderModal({ submitSuccess: false });
    expect(
      screen.queryByRole("link", { name: /preview form/i }),
    ).not.toBeInTheDocument();
  });
});
