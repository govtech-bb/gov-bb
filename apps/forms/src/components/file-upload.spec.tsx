import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import FileUpload from "./file-upload";
import type { FileUploadProps, UploadedFile } from "@forms/types";

// Mock the presigned-upload client so tests don't hit the network.
jest.mock("../lib/api/files", () => {
  class FileUploadError extends Error {
    constructor(
      message: string,
      public readonly stage: string,
    ) {
      super(message);
      this.name = "FileUploadError";
    }
  }
  return { uploadFile: jest.fn(), FileUploadError };
});
import { uploadFile, FileUploadError } from "../lib/api/files";

const mockUploadFile = uploadFile as jest.Mock;

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
};

const baseSharedProps: FileUploadProps["sharedProps"] = {
  name: "doc-field",
  id: "step-1.doc-field",
  disabled: false,
};

function renderComponent(overrides: Partial<FileUploadProps> = {}) {
  const onFileChange = jest.fn();
  const props: FileUploadProps = {
    field: baseField,
    sharedProps: baseSharedProps,
    onFileChange,
    value: null,
    errorMessage: "",
    validationRules: undefined,
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

describe("FileUpload", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUploadFile.mockResolvedValue(makeUploaded("default.pdf"));
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
    mockUploadFile.mockResolvedValue(makeUploaded("report.pdf"));
    const { onFileChange, fileInput } = renderComponent({ formId: "f1" });

    const file = makeFile("report.pdf", "application/pdf", 512);
    await user.upload(fileInput, file);

    await waitFor(() => expect(onFileChange).toHaveBeenCalled());
    expect(mockUploadFile).toHaveBeenCalledWith(
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

  it("appends a newly uploaded file to existing files in the list", async () => {
    const user = userEvent.setup();
    mockUploadFile.mockResolvedValue(
      makeUploaded("new.jpg", "image/jpeg", 200),
    );
    const { onFileChange, fileInput } = renderComponent({
      value: [makeUploaded("existing.png", "image/png", 100)],
    });

    const newFile = makeFile("new.jpg", "image/jpeg", 200);
    await user.upload(fileInput, newFile);

    await waitFor(() => expect(onFileChange).toHaveBeenCalled());
    const calledWith = onFileChange.mock.calls.at(-1)?.[0] as UploadedFile[];
    expect(calledWith.map((f) => f.name)).toEqual(["existing.png", "new.jpg"]);
  });

  it("shows an uploading status while in progress, then the file when confirmed", async () => {
    const user = userEvent.setup();
    let resolveUpload: (f: UploadedFile) => void = () => {};
    mockUploadFile.mockReturnValue(
      new Promise<UploadedFile>((resolve) => {
        resolveUpload = resolve;
      }),
    );

    // Controlled wrapper: feed onFileChange back into value, like the real form,
    // so the confirmed file renders once the upload resolves.
    function Harness() {
      const [value, setValue] = React.useState<UploadedFile[] | null>(null);
      return (
        <FileUpload
          field={baseField}
          sharedProps={baseSharedProps}
          value={value}
          onFileChange={setValue}
        />
      );
    }
    const { container } = render(<Harness />);
    const fileInput = container.querySelector(
      ".govbb-file-upload__input",
    ) as HTMLInputElement;

    await user.upload(fileInput, makeFile("slow.pdf", "application/pdf", 100));
    expect(await screen.findByText(/uploading/i)).toBeInTheDocument();

    resolveUpload(makeUploaded("slow.pdf"));
    await waitFor(() =>
      expect(screen.queryByText(/uploading/i)).not.toBeInTheDocument(),
    );
    expect(screen.getByText("slow.pdf")).toBeInTheDocument();
  });

  it("shows an error and does not store the file when the upload fails", async () => {
    const user = userEvent.setup();
    mockUploadFile.mockRejectedValue(
      new FileUploadError("File upload failed (put). Please try again.", "put"),
    );
    const { onFileChange, fileInput } = renderComponent();

    await user.upload(fileInput, makeFile("bad.pdf", "application/pdf", 100));

    expect(await screen.findByText(/file upload failed/i)).toBeInTheDocument();
    expect(onFileChange).not.toHaveBeenCalled();
  });

  it("rejects an oversize file client-side without calling the upload API", async () => {
    const user = userEvent.setup();
    const { onFileChange, fileInput } = renderComponent({
      validationRules: { maxSize: { value: 1024 } }, // 1KB cap
    });

    await user.upload(fileInput, makeFile("huge.pdf", "application/pdf", 5000));

    expect(await screen.findByText(/larger than/i)).toBeInTheDocument();
    expect(mockUploadFile).not.toHaveBeenCalled();
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
    const { onFileChange } = renderComponent({ value: [fileA, fileB] });

    expect(screen.getByText("alpha.pdf")).toBeInTheDocument();
    expect(screen.getByText("beta.pdf")).toBeInTheDocument();

    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    await user.click(removeButtons[0]);

    expect(onFileChange).toHaveBeenCalledTimes(1);
    const remaining = onFileChange.mock.calls[0][0] as UploadedFile[];
    expect(remaining).toHaveLength(1);
    expect(remaining[0].name).toBe("beta.pdf");
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

  it("renders fallback description when no fileTypes validation is set", () => {
    renderComponent();
    expect(screen.getByText(/no file type restrictions/i)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 9. Max-size display
  // -------------------------------------------------------------------------
  it("renders the formatted max-size when validationRules.maxSize is provided", () => {
    renderComponent({
      validationRules: { maxSize: { value: 5 * 1024 * 1024 } }, // 5 MB
    });
    expect(screen.getByText(/5\.0 MB/i)).toBeInTheDocument();
  });

  it("renders '--' for max size when validationRules has no maxSize", () => {
    renderComponent({ validationRules: {} });
    expect(screen.getByText(/Max Size:.*--/i)).toBeInTheDocument();
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
});
