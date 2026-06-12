/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { SubmitModal } from "./-submit-modal";
import type { RecipeDraft } from "@govtech-bb/form-builder";

// VITE_FORMS_URL is stubbed by ts-jest-mock-import-meta (see vi.config.ts).
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
      onSubmit={vi.fn()}
      onClose={vi.fn()}
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

describe("SubmitModal version hint", () => {
  it("says it overwrites in place when the loaded version is an unpublished draft", () => {
    renderModal({
      loadedFromId: "passport",
      currentVersion: "1.0.1",
      version: "1.0.1",
      currentVersionIsPublished: false,
    });
    expect(
      screen.getByText(/overwrites this draft in place/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/saves a new draft/i)).not.toBeInTheDocument();
  });

  it("says it saves a new draft (not overwrite) when the loaded version is published", () => {
    // currentVersion is the published version; `version` is the bumped patch
    // the page passes in. The modal must NOT claim an in-place overwrite.
    renderModal({
      loadedFromId: "passport",
      currentVersion: "1.0.0",
      version: "1.0.1",
      currentVersionIsPublished: true,
    });
    expect(screen.getByText(/saves a new draft/i)).toBeInTheDocument();
    expect(screen.getByText(/v1\.0\.1/)).toBeInTheDocument();
    expect(
      screen.queryByText(/overwrites this draft in place/i),
    ).not.toBeInTheDocument();
  });
});
