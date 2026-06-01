/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { PreviewModal } from "./-preview-modal";

function renderModal(
  props: Partial<React.ComponentProps<typeof PreviewModal>> = {},
) {
  return render(
    <PreviewModal
      contract={null}
      isLoading={false}
      error={null}
      previewUrl={null}
      onClose={jest.fn()}
      {...props}
    />,
  );
}

describe("PreviewModal live preview link", () => {
  it("renders a live preview link pointing at previewUrl when the recipe is saved", () => {
    renderModal({ previewUrl: "http://localhost:3000/forms/passport?preview=demo" });

    const link = screen.getByRole("link", { name: /preview saved form/i });
    expect(link).toHaveAttribute(
      "href",
      "http://localhost:3000/forms/passport?preview=demo",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows a save-first hint and no link when the recipe is unsaved", () => {
    renderModal({ previewUrl: null });

    expect(screen.queryByRole("link", { name: /preview saved form/i })).not.toBeInTheDocument();
    expect(screen.getByText(/save this recipe to enable a live preview link/i)).toBeInTheDocument();
  });
});
