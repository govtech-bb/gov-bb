/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { PublishModal } from "./-publish-modal";
import type { RecipeDraft } from "@govtech-bb/form-builder";

const draft = {
  formId: "passport",
  title: "Passport Application",
  description: "",
  steps: [],
} as unknown as RecipeDraft;

function renderModal(
  props: Partial<React.ComponentProps<typeof PublishModal>> = {},
) {
  return render(
    <PublishModal
      draft={draft}
      version="1.1.0"
      baseBranch="dev"
      isPublishing={false}
      publishSuccess={null}
      publishError={null}
      onPublish={jest.fn()}
      onClose={jest.fn()}
      {...props}
    />,
  );
}

describe("PublishModal base branch", () => {
  it("shows the configured base branch in the pre-publish copy", () => {
    renderModal({ baseBranch: "sandbox" });
    // The branch renders as a <code> element inside the "against …" sentence.
    expect(screen.getByText("sandbox").tagName).toBe("CODE");
  });

  it("shows the configured base branch in the success copy", () => {
    renderModal({
      baseBranch: "sandbox",
      publishSuccess: { prUrl: "https://example.test/pr/7", prNumber: 7 },
    });
    expect(screen.getByText("sandbox").tagName).toBe("CODE");
  });

  it("uses the dev branch when that is what is configured", () => {
    renderModal({ baseBranch: "dev" });
    expect(screen.getByText("dev").tagName).toBe("CODE");
  });
});
