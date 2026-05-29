import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import FileUpload from "./file-upload";
import type { FileUploadProps } from "@forms/types";

function makeFile(name: string, type: string, sizeBytes: number): File {
  return new File(["x".repeat(sizeBytes)], name, { type });
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
  beforeEach(() => jest.clearAllMocks());

  it("renders a file input with the accept attribute from sharedProps", () => {
    const { fileInput } = renderComponent({
      sharedProps: { ...baseSharedProps, accept: "image/png,image/jpeg" },
    });
    expect(screen.getByText(/choose file/i)).toBeInTheDocument();
    // The hidden file input carries the accept attribute
    expect(fileInput).not.toBeNull();
    expect(fileInput.accept).toBe("image/png,image/jpeg");
  });

  it("calls onFileChange with the selected file", async () => {
    const user = userEvent.setup();
    const { onFileChange, fileInput } = renderComponent();

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
    const { onFileChange, fileInput } = renderComponent({
      value: [existingFile],
    });

    const newFile = makeFile("new.jpg", "image/jpeg", 200);
    await user.upload(fileInput, newFile);

    expect(onFileChange).toHaveBeenCalledTimes(1);
    const calledWith = onFileChange.mock.calls[0][0] as File[];
    expect(calledWith).toHaveLength(2);
    expect(calledWith.map((f) => f.name)).toEqual(["existing.png", "new.jpg"]);
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
    const fileA = makeFile("alpha.pdf", "application/pdf", 100);
    const fileB = makeFile("beta.pdf", "application/pdf", 200);
    const { onFileChange } = renderComponent({ value: [fileA, fileB] });

    expect(screen.getByText("alpha.pdf")).toBeInTheDocument();
    expect(screen.getByText("beta.pdf")).toBeInTheDocument();

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

  it("still renders the file input when files equal maxItems (enforcement is external)", () => {
    const maxItems = 3;
    const files = Array.from({ length: maxItems }, (_, i) =>
      makeFile(`file-${i}.pdf`, "application/pdf", 100),
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
