/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ServiceContractRecipe } from "@govtech-bb/form-types";
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

describe("PreviewModal view recipe JSON action", () => {
  // The in-memory recipe as serializeRecipeDraft would emit it — only the
  // shape matters to the modal, which treats it as an opaque JSON payload.
  const recipe = {
    formId: "passport",
    title: "Passport application",
    version: "1.0.0",
  } as unknown as ServiceContractRecipe;

  const realCreateObjectURL = URL.createObjectURL;
  const realRevokeObjectURL = URL.revokeObjectURL;
  const RealBlob = globalThis.Blob;
  let createObjectURL: jest.Mock;
  let revokeObjectURL: jest.Mock;
  let windowOpen: jest.SpyInstance;
  // jsdom's Blob has no .text(), so capture the construction input instead.
  let blobParts: BlobPart[] | undefined;

  beforeEach(() => {
    jest.useFakeTimers();
    blobParts = undefined;
    globalThis.Blob = class extends RealBlob {
      constructor(parts?: BlobPart[], opts?: BlobPropertyBag) {
        super(parts, opts);
        blobParts = parts;
      }
    };
    createObjectURL = jest.fn().mockReturnValue("blob:mock-recipe-url");
    revokeObjectURL = jest.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    windowOpen = jest.spyOn(window, "open").mockReturnValue(null);
  });

  afterEach(() => {
    jest.useRealTimers();
    globalThis.Blob = RealBlob;
    URL.createObjectURL = realCreateObjectURL;
    URL.revokeObjectURL = realRevokeObjectURL;
    windowOpen.mockRestore();
  });

  it("renders the action when a recipe is provided", () => {
    renderModal({ recipe });

    expect(
      screen.getByRole("button", { name: /view recipe json/i }),
    ).toBeInTheDocument();
  });

  it("does not render the action without a recipe", () => {
    renderModal({ recipe: null });

    expect(
      screen.queryByRole("button", { name: /view recipe json/i }),
    ).not.toBeInTheDocument();
  });

  it("opens the pretty-printed recipe as a JSON blob URL in a new tab", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderModal({ recipe });

    await user.click(screen.getByRole("button", { name: /view recipe json/i }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("application/json");
    expect(blobParts).toEqual([JSON.stringify(recipe, null, 2)]);
    expect(windowOpen).toHaveBeenCalledWith(
      "blob:mock-recipe-url",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("revokes the blob URL after opening", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderModal({ recipe });

    await user.click(screen.getByRole("button", { name: /view recipe json/i }));

    expect(revokeObjectURL).not.toHaveBeenCalled();
    jest.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-recipe-url");
  });
});
