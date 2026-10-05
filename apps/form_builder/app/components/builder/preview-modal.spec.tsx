import type { Mock, MockInstance } from "vitest";
/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  ServiceContract,
  ServiceContractRecipe,
} from "@govtech-bb/form-types";
import { PreviewModal } from "./preview-modal";

function renderModal(
  props: Partial<React.ComponentProps<typeof PreviewModal>> = {},
) {
  return render(
    <PreviewModal
      open
      contract={null}
      isLoading={false}
      error={null}
      previewUrl={null}
      onClose={vi.fn()}
      {...props}
    />,
  );
}

describe("PreviewModal live preview link", () => {
  it("renders a live preview link pointing at previewUrl when the recipe is saved", () => {
    renderModal({
      previewUrl: "http://localhost:3000/forms/passport?draft=demo",
    });

    const link = screen.getByRole("link", { name: /preview saved form/i });
    expect(link).toHaveAttribute(
      "href",
      "http://localhost:3000/forms/passport?draft=demo",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows a save-first hint and no link when the recipe is unsaved", () => {
    renderModal({ previewUrl: null });

    expect(
      screen.queryByRole("link", { name: /preview saved form/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/save a draft to preview the applicant journey/i),
    ).toBeInTheDocument();
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
  let createObjectURL: Mock;
  let revokeObjectURL: Mock;
  let windowOpen: MockInstance;
  // jsdom's Blob has no .text(), so capture the construction input instead.
  let blobParts: BlobPart[] | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    blobParts = undefined;
    globalThis.Blob = class extends RealBlob {
      constructor(parts?: BlobPart[], opts?: BlobPropertyBag) {
        super(parts, opts);
        blobParts = parts;
      }
    };
    createObjectURL = vi.fn().mockReturnValue("blob:mock-recipe-url");
    revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    windowOpen = vi.spyOn(window, "open").mockReturnValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
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
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
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
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderModal({ recipe });

    await user.click(screen.getByRole("button", { name: /view recipe json/i }));

    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-recipe-url");
  });
});

describe("PreviewModal content blocks (#2873)", () => {
  // A hydrated step mixing content blocks with a value-holding field. Only the
  // keys the row reads are modelled, hence the cast.
  const contract = {
    formId: "passport",
    title: "Passport application",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    steps: [
      {
        stepId: "start",
        title: "Before you start",
        elements: [
          {
            fieldId: "intro",
            htmlType: "content",
            label: "Information",
            variant: "inset",
            content: "Bring your **National ID**.\nAnd a recent photo.",
          },
          {
            fieldId: "fees",
            htmlType: "content",
            label: "Information",
            variant: "details",
            summary: "What you will need",
            content: "Two recent photos.",
          },
          {
            fieldId: "blank",
            htmlType: "content",
            label: "Information",
            variant: "text",
            content: "",
          },
          {
            fieldId: "last-name",
            htmlType: "text",
            label: "Last name",
            validations: { required: { value: true } },
          },
        ],
      },
    ],
  } as unknown as ServiceContract;

  const rowContaining = (text: string) => {
    const row = screen.getByText(text).closest("li");
    if (!row) throw new Error(`no row contains "${text}"`);
    return within(row);
  };

  it("shows the opening line and style of a content block instead of Required/Optional", () => {
    renderModal({ contract });
    const row = rowContaining("Bring your **National ID**.");
    expect(row.getByText("inset")).toBeInTheDocument();
    expect(row.queryByText(/required|optional/i)).not.toBeInTheDocument();
    expect(row.queryByText(/recent photo/)).not.toBeInTheDocument();
  });

  it("shows the details summary with the opening line beneath it", () => {
    renderModal({ contract });
    const row = rowContaining("What you will need");
    expect(row.getByText("details")).toBeInTheDocument();
    expect(row.getByText("Two recent photos.")).toBeInTheDocument();
  });

  it("falls back to the label when the body is empty", () => {
    renderModal({ contract });
    const row = rowContaining("Information");
    expect(row.getByText("text")).toBeInTheDocument();
  });

  it("still badges a value-holding field Required or Optional", () => {
    renderModal({ contract });
    expect(
      rowContaining("Last name").getByText("Required"),
    ).toBeInTheDocument();
  });
});
