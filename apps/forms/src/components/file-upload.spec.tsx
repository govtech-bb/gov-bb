import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import FileUpload from "./file-upload";
import type { FileUploadProps } from "@forms/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFile(name: string, type: string, sizeBytes: number): File {
  const file = new File(["x".repeat(sizeBytes)], name, { type });
  // Ensure the size property reflects our intent (jsdom File honours content length)
  Object.defineProperty(file, "size", { value: sizeBytes, configurable: true });
  return file;
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
  return { ...result, onFileChange };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FileUpload", () => {
  beforeEach(() => jest.clearAllMocks());

  // -------------------------------------------------------------------------
  // 1. Renders a file input with the correct `accept` attribute
  // -------------------------------------------------------------------------
  it("renders a file input with the accept attribute from sharedProps", () => {
    renderComponent({
      sharedProps: { ...baseSharedProps, accept: "image/png,image/jpeg" },
    });
    const input = screen.getByRole("button", { name: /choose file/i });
    // The hidden file input carries the accept attribute
    const fileInput = document.querySelector(
      "[data-file-upload-input]",
    ) as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    expect(fileInput.accept).toBe("image/png,image/jpeg");
  });

  // -------------------------------------------------------------------------
  // 2. Selecting a valid file adds it to the displayed file list
  // -------------------------------------------------------------------------
  it("calls onFileChange with the selected file", async () => {
    const user = userEvent.setup();
    const { onFileChange } = renderComponent();

    const fileInput = document.querySelector(
      "[data-file-upload-input]",
    ) as HTMLInputElement;

    const file = makeFile("report.pdf", "application/pdf", 512);
    await user.upload(fileInput, file);

    expect(onFileChange).toHaveBeenCalledTimes(1);
    const calledWith = onFileChange.mock.calls[0][0] as File[];
    expect(calledWith).toHaveLength(1);
    expect(calledWith[0].name).toBe("report.pdf");
  });

  it("appends a newly selected file to existing files in the list", async () => {
    const user = userEvent.setup();
    const existingFile = makeFile("existing.png", "image/png", 100);
    const { onFileChange } = renderComponent({ value: [existingFile] });

    const fileInput = document.querySelector(
      "[data-file-upload-input]",
    ) as HTMLInputElement;

    const newFile = makeFile("new.jpg", "image/jpeg", 200);
    await user.upload(fileInput, newFile);

    expect(onFileChange).toHaveBeenCalledTimes(1);
    const calledWith = onFileChange.mock.calls[0][0] as File[];
    expect(calledWith).toHaveLength(2);
    expect(calledWith.map((f) => f.name)).toEqual(["existing.png", "new.jpg"]);
  });

  // -------------------------------------------------------------------------
  // 3. Selecting a file whose MIME type is not in fileTypes shows an error
  //    NOTE: The component itself does NOT perform MIME-type validation —
  //    validation is done externally and the error is passed via `errorMessage`.
  //    This test confirms the component renders that error message correctly.
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // 4. Selecting a file exceeding itemMaxSize shows the correct error message
  //    Same pattern: error is supplied via the `errorMessage` prop.
  // -------------------------------------------------------------------------
  it("displays a file-size error message when errorMessage prop is provided", () => {
    renderComponent({
      errorMessage: "File exceeds the maximum allowed size of 5 MB.",
    });
    expect(
      screen.getByText("File exceeds the maximum allowed size of 5 MB."),
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 5. Remove button removes the file from the displayed list
  // -------------------------------------------------------------------------
  it("calls onFileChange without the removed file when Remove is clicked", async () => {
    const user = userEvent.setup();
    const fileA = makeFile("alpha.pdf", "application/pdf", 100);
    const fileB = makeFile("beta.pdf", "application/pdf", 200);
    const { onFileChange } = renderComponent({ value: [fileA, fileB] });

    // Both filenames should be visible
    expect(screen.getByText("alpha.pdf")).toBeInTheDocument();
    expect(screen.getByText("beta.pdf")).toBeInTheDocument();

    // Click Remove on the first file (index 0)
    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    await user.click(removeButtons[0]);

    expect(onFileChange).toHaveBeenCalledTimes(1);
    const remaining = onFileChange.mock.calls[0][0] as File[];
    expect(remaining).toHaveLength(1);
    expect(remaining[0].name).toBe("beta.pdf");
  });

  it("calls onFileChange with null when the only file is removed", async () => {
    const user = userEvent.setup();
    const file = makeFile("only.pdf", "application/pdf", 100);
    const { onFileChange } = renderComponent({ value: [file] });

    const removeButton = screen.getByRole("button", { name: /remove/i });
    await user.click(removeButton);

    expect(onFileChange).toHaveBeenCalledWith(null);
  });

  // -------------------------------------------------------------------------
  // 6. When the number of files equals maxItems the component still renders
  //    the file input (the component defers maxItems enforcement to the caller).
  //    We test that the component renders correctly with a full set of files.
  // -------------------------------------------------------------------------
  it("still renders the file input when files equal maxItems (enforcement is external)", () => {
    const maxItems = 3;
    const files = Array.from({ length: maxItems }, (_, i) =>
      makeFile(`file-${i}.pdf`, "application/pdf", 100),
    );
    renderComponent({
      value: files,
      field: {
        ...baseField,
        validations: { maxItems: { value: maxItems } },
      },
    });

    // All files should be listed
    files.forEach((f) => expect(screen.getByText(f.name)).toBeInTheDocument());

    // The hidden file input is still present (caller is responsible for disabling)
    const fileInput = document.querySelector(
      "[data-file-upload-input]",
    ) as HTMLInputElement;
    expect(fileInput).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // 7. When fewer files than minItems are selected and the field is validated,
  //    the error message is shown. Again, validation is external; we test that
  //    the component surfaces the errorMessage passed by the caller.
  // -------------------------------------------------------------------------
  it("shows a minItems error when fewer files than required are selected", () => {
    const file = makeFile("single.pdf", "application/pdf", 100);
    renderComponent({
      value: [file],
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
    expect(screen.getByText(/--/)).toBeInTheDocument();
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
      makeFile("alpha.pdf", "application/pdf", 100),
      makeFile("beta.png", "image/png", 200),
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
