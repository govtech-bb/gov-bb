import type { Mock } from "vitest";
import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import FileUpload from "./file-upload";
import type { FileUploadProps, UploadedFile } from "@forms/types";

// Mock the network calls; keep the real error class and messages.
vi.mock("../lib/api/files", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/api/files")>()),
  sendFile: vi.fn(),
  checkFile: vi.fn(),
}));
import {
  sendFile,
  checkFile,
  FileUploadError,
  UPLOAD_PROBLEM_MESSAGE,
} from "../lib/api/files";
import {
  INFECTED_FILE_MESSAGE,
  UNSCANNABLE_FILE_MESSAGE,
} from "@govtech-bb/form-validation";

const mockSendFile = sendFile as Mock;
const mockCheckFile = checkFile as Mock;

function makeFile(name: string, type: string, sizeBytes: number): File {
  return new File(["x".repeat(sizeBytes)], name, { type });
}

function makeUploaded(
  name: string,
  type = "application/pdf",
  size = 100,
): UploadedFile {
  return {
    key: `uploads/test/2026/05/00000000-0000-0000-0000-000000000000-${name}`,
    name,
    size,
    type,
    url: `https://preview.example/${name}`,
  };
}

// A field with no `fileTypes` is a recipe defect, so the shared fixture
// declares one. The unconstrained case has its own tests below.
const baseField: FileUploadProps["field"] = {
  id: "step-1.doc-field",
  fieldId: "doc-field",
  stepId: "step-1",
  name: "doc-field",
  label: "Upload document",
  htmlType: "file",
  disabled: false,
  hidden: false,
  conditionallyHidden: false,
  behaviours: [],
  validations: {
    fileTypes: {
      value: ["application/pdf", "image/png", "image/jpeg"],
      error: "Upload a PDF, PNG or JPEG",
    },
  },
};

const noFileTypesField: FileUploadProps["field"] = {
  ...baseField,
  validations: {},
};

const baseSharedProps: FileUploadProps["sharedProps"] = {
  name: "doc-field",
  id: "step-1.doc-field",
  disabled: false,
};

function renderComponent(overrides: Partial<FileUploadProps> = {}) {
  const onFileChange = vi.fn();
  const props: FileUploadProps = {
    field: baseField,
    sharedProps: baseSharedProps,
    onFileChange,
    value: null,
    errorMessage: "",
    ...overrides,
  };
  const result = render(<FileUpload {...props} />);
  return {
    ...result,
    onFileChange,
    get fileInput() {
      return result.container.querySelector(
        ".govbb-file-upload__input",
      ) as HTMLInputElement;
    },
  };
}

// The widget's own announcer (the design-system input may render another).
const liveRegion = () =>
  document.querySelector('div[role="status"].govbb-visually-hidden');

// Controlled wrapper: feeds onFileChange back into value, like the real form,
// so a confirmed file renders as a list row.
function renderHarness(field: FileUploadProps["field"] = baseField) {
  const onFileChange = vi.fn();
  function Harness() {
    const [value, setValue] = React.useState<UploadedFile[] | null>(null);
    return (
      <FileUpload
        field={field}
        sharedProps={baseSharedProps}
        value={value}
        onFileChange={(files) => {
          onFileChange(files);
          setValue(files);
        }}
      />
    );
  }
  const { container } = render(<Harness />);
  harnessOnFileChange = onFileChange;
  return container.querySelector(
    ".govbb-file-upload__input",
  ) as HTMLInputElement;
}
let harnessOnFileChange: Mock;

describe("FileUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendFile.mockResolvedValue("uploads/k");
    mockCheckFile.mockResolvedValue(makeUploaded("default.pdf"));
  });

  it("sets the multiple attribute on the input when field.multiple is true", () => {
    const { fileInput } = renderComponent({
      field: { ...baseField, multiple: true },
    });
    expect(fileInput.multiple).toBe(true);
  });

  it("does not set multiple on the input when field.multiple is false or absent", () => {
    const { fileInput } = renderComponent({
      field: { ...baseField, multiple: false },
    });
    expect(fileInput.multiple).toBe(false);

    const { fileInput: defaultInput } = renderComponent();
    expect(defaultInput.multiple).toBe(false);
  });

  it("renders a file input with the accept attribute from sharedProps", () => {
    const { fileInput } = renderComponent({
      sharedProps: { ...baseSharedProps, accept: "image/png,image/jpeg" },
    });
    expect(screen.getByText(/choose file/i)).toBeInTheDocument();
    // The hidden file input carries the accept attribute
    expect(fileInput).not.toBeNull();
    expect(fileInput.accept).toBe("image/png,image/jpeg");
  });

  it("uploads the selected file and stores the confirmed reference (without url)", async () => {
    const user = userEvent.setup();
    mockCheckFile.mockResolvedValue(makeUploaded("report.pdf"));
    const { onFileChange, fileInput } = renderComponent({ formId: "f1" });

    const file = makeFile("report.pdf", "application/pdf", 512);
    await user.upload(fileInput, file);

    await waitFor(() => expect(onFileChange).toHaveBeenCalled());
    expect(mockSendFile).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldId: "doc-field",
        stepId: "step-1",
        formId: "f1",
        file: expect.any(File),
      }),
    );
    const calledWith = onFileChange.mock.calls.at(-1)?.[0] as UploadedFile[];
    expect(calledWith).toHaveLength(1);
    expect(calledWith[0].name).toBe("report.pdf");
    // The expiring preview url is not stored in form state.
    expect(calledWith[0].url).toBeUndefined();
    expect(calledWith[0].key).toBeDefined();
  });

  it("forwards the previewToken prop to sendFile", async () => {
    const user = userEvent.setup();
    const { fileInput } = renderComponent({
      formId: "f1",
      previewToken: "preview-tok",
    });

    await user.upload(
      fileInput,
      makeFile("report.pdf", "application/pdf", 512),
    );

    await waitFor(() => expect(mockSendFile).toHaveBeenCalled());
    expect(mockSendFile).toHaveBeenCalledWith(
      expect.objectContaining({ previewToken: "preview-tok" }),
    );
  });

  it("forwards the draftToken prop to sendFile (#1682)", async () => {
    const user = userEvent.setup();
    const { fileInput } = renderComponent({
      formId: "f1",
      draftToken: "draft-tok",
    });

    await user.upload(
      fileInput,
      makeFile("report.pdf", "application/pdf", 512),
    );

    await waitFor(() => expect(mockSendFile).toHaveBeenCalled());
    expect(mockSendFile).toHaveBeenCalledWith(
      expect.objectContaining({ draftToken: "draft-tok" }),
    );
  });

  it("appends a newly uploaded file to existing files in the list", async () => {
    const user = userEvent.setup();
    mockCheckFile.mockResolvedValue(makeUploaded("new.jpg", "image/jpeg", 200));
    const { onFileChange, fileInput } = renderComponent({
      value: [makeUploaded("existing.png", "image/png", 100)],
    });

    const newFile = makeFile("new.jpg", "image/jpeg", 200);
    await user.upload(fileInput, newFile);

    await waitFor(() => expect(onFileChange).toHaveBeenCalled());
    const calledWith = onFileChange.mock.calls.at(-1)?.[0] as UploadedFile[];
    expect(calledWith.map((f) => f.name)).toEqual(["existing.png", "new.jpg"]);
  });

  it("goes uploading → checking → added for a clean file", async () => {
    const user = userEvent.setup();
    let finishSend: (key: string) => void = () => {};
    let finishCheck: (f: UploadedFile) => void = () => {};
    let reportProgress: (fraction: number) => void = () => {};
    mockSendFile.mockImplementation(
      ({ onProgress }: { onProgress: (f: number) => void }) => {
        reportProgress = onProgress;
        return new Promise<string>((resolve) => {
          finishSend = resolve;
        });
      },
    );
    mockCheckFile.mockReturnValue(
      new Promise<UploadedFile>((resolve) => {
        finishCheck = resolve;
      }),
    );
    const fileInput = renderHarness();

    await user.upload(fileInput, makeFile("slow.pdf", "application/pdf", 100));
    const bar = await screen.findByRole("progressbar", {
      name: "Uploading slow.pdf",
    });
    act(() => reportProgress(0.4));
    expect(bar).toHaveAttribute("value", "0.4");
    expect(liveRegion()).toHaveTextContent("Uploading slow.pdf");

    await act(async () => finishSend("uploads/k"));
    expect(
      screen.getByRole("progressbar", { name: "Checking slow.pdf" }),
    ).not.toHaveAttribute("value");
    expect(screen.getByText(/checking your file/i)).toBeInTheDocument();
    expect(liveRegion()).toHaveTextContent("Checking slow.pdf");

    await act(async () =>
      finishCheck({ ...makeUploaded("slow.pdf"), scanStatus: "clean" }),
    );
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Remove slow.pdf" }),
    ).toBeInTheDocument();
    expect(liveRegion()).toHaveTextContent("slow.pdf added.");
  });

  it("shows the agreed message, Retry and Remove when the upload fails", async () => {
    const user = userEvent.setup();
    mockSendFile.mockRejectedValue(
      new FileUploadError(UPLOAD_PROBLEM_MESSAGE, "put"),
    );
    const { onFileChange, fileInput } = renderComponent();

    await user.upload(fileInput, makeFile("bad.pdf", "application/pdf", 100));

    expect(
      await screen.findByText(UPLOAD_PROBLEM_MESSAGE, {
        selector: ".govbb-file-upload__status--error",
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`bad.pdf: ${UPLOAD_PROBLEM_MESSAGE}`, {
        selector: '[role="status"]',
      }),
    ).toBeInTheDocument();
    expect(onFileChange).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Retry bad.pdf" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove bad.pdf" }));
    expect(fileInput).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Remove bad.pdf" })).toBeNull();
  });

  it("rejects an oversize file client-side without calling the upload API", async () => {
    const user = userEvent.setup();
    const { onFileChange, fileInput } = renderComponent({
      field: {
        ...baseField,
        validations: { ...baseField.validations, maxSize: { value: 1024 } }, // 1KB cap
      },
    });

    await user.upload(fileInput, makeFile("huge.pdf", "application/pdf", 5000));

    expect(
      await screen.findByText(/larger than/i, {
        selector: ".govbb-file-upload__status--error",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/huge\.pdf:.*larger than/i, {
        selector: '[role="status"]',
      }),
    ).toBeInTheDocument();
    expect(mockSendFile).not.toHaveBeenCalled();
    expect(onFileChange).not.toHaveBeenCalled();
  });

  // MIME-type and size validation is external; component only renders the errorMessage prop.
  it("displays a MIME-type error message when errorMessage prop is provided", () => {
    renderComponent({
      errorMessage: "File type not allowed. Please upload a pdf or png file.",
    });
    expect(
      screen.getByText(
        "File type not allowed. Please upload a pdf or png file.",
      ),
    ).toBeInTheDocument();
  });

  it("displays a file-size error message when errorMessage prop is provided", () => {
    renderComponent({
      errorMessage: "File exceeds the maximum allowed size of 5 MB.",
    });
    expect(
      screen.getByText("File exceeds the maximum allowed size of 5 MB."),
    ).toBeInTheDocument();
  });

  it("calls onFileChange without the removed file when Remove is clicked", async () => {
    const user = userEvent.setup();
    const fileA = makeUploaded("alpha.pdf");
    const fileB = makeUploaded("beta.pdf", "application/pdf", 200);
    const { onFileChange, fileInput } = renderComponent({
      value: [fileA, fileB],
    });

    expect(screen.getByText("alpha.pdf")).toBeInTheDocument();
    expect(screen.getByText("beta.pdf")).toBeInTheDocument();

    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    await user.click(removeButtons[0]);

    expect(onFileChange).toHaveBeenCalledTimes(1);
    const remaining = onFileChange.mock.calls[0][0] as UploadedFile[];
    expect(remaining).toHaveLength(1);
    expect(remaining[0].name).toBe("beta.pdf");
    expect(fileInput).toHaveFocus();
  });

  it("calls onFileChange with null when the only file is removed", async () => {
    const user = userEvent.setup();
    const { onFileChange } = renderComponent({
      value: [makeUploaded("only.pdf")],
    });

    const removeButton = screen.getByRole("button", { name: /remove/i });
    await user.click(removeButton);

    expect(onFileChange).toHaveBeenCalledWith(null);
  });

  it("still renders the file input when files equal maxItems (enforcement is external)", () => {
    const maxItems = 3;
    const files = Array.from({ length: maxItems }, (_, i) =>
      makeUploaded(`file-${i}.pdf`),
    );
    const { fileInput } = renderComponent({
      value: files,
      field: {
        ...baseField,
        validations: { maxItems: { value: maxItems } },
      },
    });

    files.forEach((f) => expect(screen.getByText(f.name)).toBeInTheDocument());
    expect(fileInput).not.toBeNull();
  });

  it("shows a minItems error when fewer files than required are selected", () => {
    renderComponent({
      value: [makeUploaded("single.pdf")],
      errorMessage: "Please attach at least 2 files.",
      field: {
        ...baseField,
        validations: { minItems: { value: 2 } },
      },
    });
    expect(
      screen.getByText("Please attach at least 2 files."),
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 8. File type description text is rendered from field.validations.fileTypes
  // -------------------------------------------------------------------------
  it("renders a file-type description derived from field validations", () => {
    renderComponent({
      field: {
        ...baseField,
        validations: {
          fileTypes: { value: ["image/png", "image/jpeg"] },
        },
      },
    });
    // Component formats: "Attach a png or jpeg file"
    expect(screen.getByText(/attach a png or jpeg file/i)).toBeInTheDocument();
  });

  it("renders extension-style file types verbatim (with leading dots)", () => {
    renderComponent({
      field: {
        ...baseField,
        validations: {
          fileTypes: { value: [".pdf", ".docx", ".png"] },
        },
      },
    });
    expect(
      screen.getByText(/attach a \.pdf, \.docx, or \.png file/i),
    ).toBeInTheDocument();
  });

  it("warns in the console for a field with no fileTypes without blocking the applicant", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderComponent({ field: { ...noFileTypesField, hint: undefined } });

    // Whoever is reviewing the form needs to see this even though the applicant
    // is shown nothing — it is a recipe defect, not applicant error.
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("no `fileTypes` validation is configured"),
    );
    expect(
      screen.queryByText(/not correctly configured/i),
    ).not.toBeInTheDocument();
    warn.mockRestore();
  });

  // A field with no allowlist must not become impossible to satisfy — that is
  // the bug this branch set out to fix. It takes a typed file (the same call the
  // API's presign gate makes) and refuses only one it cannot identify.
  it("uploads a typed file against a field with no fileTypes", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const user = userEvent.setup();
    const { onFileChange, fileInput } = renderComponent({
      field: noFileTypesField,
    });

    await user.upload(fileInput, makeFile("a.pdf", "application/pdf", 10));

    await waitFor(() => expect(mockSendFile).toHaveBeenCalledTimes(1));
    expect(onFileChange).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("refuses an unidentifiable file against a field with no fileTypes", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const user = userEvent.setup();
    const { onFileChange, fileInput } = renderComponent({
      field: noFileTypesField,
    });

    await user.upload(fileInput, makeFile("scan", "", 10));

    expect(
      await screen.findByText(/file type could not be identified/i, {
        selector: ".govbb-file-upload__status--error",
      }),
    ).toBeInTheDocument();
    expect(mockSendFile).not.toHaveBeenCalled();
    expect(onFileChange).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  // #2384: the form builder wrote `fileTypes.value` as a comma-separated
  // string, which reached this component and threw "map is not a function" —
  // the error boundary then replaced the whole step with "Something went
  // wrong", making the form impossible to navigate past. The schema now
  // rejects that shape, but DB drafts never pass through CI, so the renderer
  // tolerates it the way `fileTypesRunner` already does.
  it("tolerates a comma-separated fileTypes string instead of crashing", () => {
    renderComponent({
      field: {
        ...baseField,
        validations: {
          fileTypes: {
            value: "application/pdf,image/jpeg,image/png",
          } as unknown as { value: string[] },
        },
      },
    });
    expect(
      screen.getByText(/attach a pdf, jpeg, or png file/i),
    ).toBeInTheDocument();
  });

  it("constrains the native picker when fileTypes is a comma-separated string", () => {
    const { container } = renderComponent({
      field: {
        ...baseField,
        validations: {
          fileTypes: {
            value: ".pdf,.docx",
          } as unknown as { value: string[] },
        },
      },
    });
    expect(container.querySelector("input[type=file]")).toHaveAttribute(
      "accept",
      ".pdf,.docx",
    );
  });

  it("renders the authored hint instead of the derived file-type description, without leaking raw MIME subtypes", () => {
    const { fileInput } = renderComponent({
      sharedProps: {
        ...baseSharedProps,
        "aria-describedby": `${baseField.id}-hint`,
      },
      field: {
        ...baseField,
        hint: "A list of the food vendors taking part in your event. PDF, JPG, PNG, DOC or DOCX.",
        validations: {
          fileTypes: {
            value: [
              "application/pdf",
              "image/jpeg",
              "image/png",
              "application/msword",
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ],
          },
        },
      },
    });
    expect(
      screen.getByText(
        "A list of the food vendors taking part in your event. PDF, JPG, PNG, DOC or DOCX.",
      ),
    ).toBeInTheDocument();
    expect(fileInput).toHaveAccessibleDescription(
      "A list of the food vendors taking part in your event. PDF, JPG, PNG, DOC or DOCX.",
    );
    expect(
      screen.queryByText(
        /vnd\.openxmlformats-officedocument\.wordprocessingml\.document/i,
      ),
    ).not.toBeInTheDocument();
  });

  it("says there are no file type restrictions when both hint and fileTypes are absent", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderComponent({ field: { ...noFileTypesField, hint: undefined } });
    expect(screen.getByText(/no file type restrictions/i)).toBeInTheDocument();
    warn.mockRestore();
  });

  it("treats a whitespace-only hint as absent, falling back to the derived file-type description", () => {
    renderComponent({
      field: {
        ...baseField,
        hint: "   ",
        validations: {
          fileTypes: { value: ["image/png", "image/jpeg"] },
        },
      },
    });
    expect(screen.getByText(/attach a png or jpeg file/i)).toBeInTheDocument();
  });

  it("derives the accept attribute from MIME-type validations", () => {
    const { fileInput } = renderComponent({
      field: {
        ...baseField,
        validations: {
          fileTypes: { value: ["image/png", "application/pdf"] },
        },
      },
    });
    expect(fileInput.accept).toBe("image/png,application/pdf");
  });

  it("derives the accept attribute from extension validations, adding a leading dot when missing", () => {
    const { fileInput } = renderComponent({
      field: {
        ...baseField,
        validations: {
          fileTypes: { value: [".pdf", "docx", "png"] },
        },
      },
    });
    expect(fileInput.accept).toBe(".pdf,.docx,.png");
  });

  it("prefers an explicit sharedProps.accept over the derived value", () => {
    const { fileInput } = renderComponent({
      sharedProps: { ...baseSharedProps, accept: "image/jpeg" },
      field: {
        ...baseField,
        validations: { fileTypes: { value: ["image/png"] } },
      },
    });
    expect(fileInput.accept).toBe("image/jpeg");
  });

  it("leaves accept empty when no fileTypes validation is set", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { fileInput } = renderComponent({ field: noFileTypesField });
    expect(fileInput.accept).toBe("");
    warn.mockRestore();
  });

  // -------------------------------------------------------------------------
  // 8b. Status announcements for screen readers (WCAG 4.1.3)
  // -------------------------------------------------------------------------
  it("announces the chosen file name once the upload is confirmed", async () => {
    const user = userEvent.setup();
    mockCheckFile.mockResolvedValue(makeUploaded("report.pdf"));
    const { fileInput } = renderComponent();

    await user.upload(fileInput, makeFile("report.pdf", "application/pdf", 64));

    expect(
      await screen.findByText(/report\.pdf added\./i, {
        selector: '[role="status"]',
      }),
    ).toBeInTheDocument();
  });

  it("announces when a file is removed", async () => {
    const user = userEvent.setup();
    renderComponent({ value: [makeUploaded("alpha.pdf")] });

    await user.click(screen.getByRole("button", { name: /remove/i }));

    expect(
      screen.getByText(/alpha\.pdf removed\./i, {
        selector: '[role="status"]',
      }),
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 9. Max-size display
  // -------------------------------------------------------------------------
  it("renders the formatted max-size when validations.maxSize is provided", () => {
    renderComponent({
      field: {
        ...baseField,
        validations: { maxSize: { value: 5 * 1024 * 1024 } }, // 5 MB
      },
    });
    expect(screen.getByText(/5\.0 MB/i)).toBeInTheDocument();
  });

  // A recipe that caps per-file size only (`itemMaxSize`) sets no `maxSize`, and
  // the old "Max Size: --" placeholder read as a broken value rather than as "no
  // limit" — so the label is omitted entirely instead.
  it("omits the max-size label entirely when validations has no maxSize", () => {
    renderComponent({ field: { ...baseField, validations: {} } });
    expect(screen.queryByText(/Max Size/i)).not.toBeInTheDocument();
    expect(screen.queryByText("--")).not.toBeInTheDocument();
  });

  it("omits the max-size label when only itemMaxSize (a per-file cap) is set", () => {
    renderComponent({
      field: {
        ...baseField,
        validations: { itemMaxSize: { value: 5 * 1024 * 1024 } },
      },
    });
    expect(screen.queryByText(/Max Size/i)).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 10. Passes jest-axe accessibility audit
  // -------------------------------------------------------------------------
  it("passes axe accessibility audit with no files", async () => {
    const { container } = renderComponent();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("passes axe accessibility audit with files listed", async () => {
    const files = [
      makeUploaded("alpha.pdf"),
      makeUploaded("beta.png", "image/png", 200),
    ];
    const { container } = renderComponent({ value: files });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("passes axe accessibility audit when an error message is displayed", async () => {
    const { container } = renderComponent({
      errorMessage: "File type not allowed.",
    });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  describe("scan verdict (#2940)", () => {
    const pdf = () => makeFile("doc.pdf", "application/pdf", 100);

    it.each([
      ["infected", INFECTED_FILE_MESSAGE],
      ["unscannable", UNSCANNABLE_FILE_MESSAGE],
    ] as const)(
      "shows the %s message, offers only Remove, and never adds the file",
      async (scanStatus, message) => {
        const user = userEvent.setup();
        mockCheckFile.mockResolvedValue({
          ...makeUploaded("doc.pdf"),
          scanStatus,
        });
        const fileInput = renderHarness();

        await user.upload(fileInput, pdf());

        expect(
          await screen.findByText(message, {
            exact: false,
            selector: ".govbb-file-upload__status--error",
          }),
        ).toBeVisible();
        expect(liveRegion()).toHaveTextContent(`doc.pdf: ${message}`);
        expect(harnessOnFileChange).not.toHaveBeenCalled();
        expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();

        await user.click(
          screen.getByRole("button", { name: "Remove doc.pdf" }),
        );
        expect(
          screen.queryByText(message, {
            exact: false,
            selector: ".govbb-file-upload__status--error",
          }),
        ).toBeNull();
      },
    );

    // An API older than #3333 sends no verdict. The submit check is the
    // security control, so the upload page doesn't block on it.
    it("adds a file whose confirm response has no verdict", async () => {
      const user = userEvent.setup();
      mockCheckFile.mockResolvedValue(makeUploaded("doc.pdf"));
      const fileInput = renderHarness();

      await user.upload(fileInput, pdf());

      await waitFor(() => expect(harnessOnFileChange).toHaveBeenCalled());
      expect(harnessOnFileChange.mock.calls[0][0][0]).not.toHaveProperty(
        "scanStatus",
      );
    });

    it("never stores the verdict in the form value", async () => {
      const user = userEvent.setup();
      mockCheckFile.mockResolvedValue({
        ...makeUploaded("doc.pdf"),
        scanStatus: "clean",
      });
      const fileInput = renderHarness();

      await user.upload(fileInput, pdf());

      await waitFor(() => expect(harnessOnFileChange).toHaveBeenCalled());
      expect(harnessOnFileChange.mock.calls[0][0][0]).toEqual({
        key: expect.any(String),
        name: "doc.pdf",
        size: 100,
        type: "application/pdf",
      });
    });

    it("after a scan that took too long, Retry re-checks without uploading again", async () => {
      const user = userEvent.setup();
      mockCheckFile
        .mockResolvedValueOnce("timeout")
        .mockResolvedValueOnce({
          ...makeUploaded("doc.pdf"),
          scanStatus: "clean",
        });
      const fileInput = renderHarness();

      await user.upload(fileInput, pdf());
      expect(
        await screen.findByText(/could not finish checking your file/i, {
          selector: ".govbb-file-upload__status--error",
        }),
      ).toBeVisible();

      await user.click(screen.getByRole("button", { name: "Retry doc.pdf" }));

      await waitFor(() => expect(harnessOnFileChange).toHaveBeenCalled());
      expect(mockSendFile).toHaveBeenCalledTimes(1);
      expect(mockCheckFile).toHaveBeenCalledTimes(2);
      expect(mockCheckFile).toHaveBeenLastCalledWith(
        expect.objectContaining({ key: "uploads/k" }),
      );
      expect(fileInput).toHaveFocus();
    });

    it("after a failed send, Retry uploads the same file again without re-picking it", async () => {
      const user = userEvent.setup();
      mockSendFile
        .mockRejectedValueOnce(
          new FileUploadError(UPLOAD_PROBLEM_MESSAGE, "put"),
        )
        .mockResolvedValueOnce("uploads/k2");
      const fileInput = renderHarness();
      const file = pdf();

      await user.upload(fileInput, file);
      await user.click(
        await screen.findByRole("button", { name: "Retry doc.pdf" }),
      );

      await waitFor(() => expect(harnessOnFileChange).toHaveBeenCalled());
      expect(mockSendFile).toHaveBeenCalledTimes(2);
      expect(mockSendFile.mock.calls[1][0].file).toBe(file);
      expect(mockCheckFile).toHaveBeenCalledWith(
        expect.objectContaining({ key: "uploads/k2" }),
      );
    });

    it("after a failed check, Retry re-checks the file already sent", async () => {
      const user = userEvent.setup();
      mockCheckFile
        .mockRejectedValueOnce(
          new FileUploadError(UPLOAD_PROBLEM_MESSAGE, "confirm"),
        )
        .mockResolvedValueOnce({
          ...makeUploaded("doc.pdf"),
          scanStatus: "clean",
        });
      const fileInput = renderHarness();

      await user.upload(fileInput, pdf());
      await user.click(
        await screen.findByRole("button", { name: "Retry doc.pdf" }),
      );

      await waitFor(() => expect(harnessOnFileChange).toHaveBeenCalled());
      expect(mockSendFile).toHaveBeenCalledTimes(1);
    });

    it.each([
      ["uploading", () => mockSendFile.mockReturnValue(new Promise(() => {}))],
      ["checking", () => mockCheckFile.mockReturnValue(new Promise(() => {}))],
      [
        "refused",
        () =>
          mockCheckFile.mockResolvedValue({
            ...makeUploaded("doc.pdf"),
            scanStatus: "infected",
          }),
      ],
      ["timed out", () => mockCheckFile.mockResolvedValue("timeout")],
    ])("passes axe while %s", async (_state, arrange) => {
      const user = userEvent.setup();
      arrange();
      const fileInput = renderHarness();

      await user.upload(fileInput, pdf());
      await screen.findByText("doc.pdf");

      expect(
        await axe(fileInput.closest(".govbb-file-upload") as HTMLElement),
      ).toHaveNoViolations();
    });
  });
});
