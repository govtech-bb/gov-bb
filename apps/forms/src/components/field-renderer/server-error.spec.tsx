import { act, render, screen } from "@testing-library/react";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import FieldRenderer from ".";
import { buildFieldValidationProperties } from "@forms/lib";
import type { ClientPrimitive } from "@forms/types";

const fileField: ClientPrimitive = {
  id: "upload-site-plan_site-plan",
  fieldId: "site-plan",
  stepId: "upload-site-plan",
  name: "site-plan",
  label: "Upload a site plan of the hotel",
  htmlType: "file",
  disabled: false,
  hidden: false,
  conditionallyHidden: false,
  behaviours: [],
  validations: {
    required: { value: true, error: "Upload a site plan of the hotel." },
    fileTypes: { value: [".pdf"], error: "Upload a PDF" },
  },
};
const UNSAFE =
  "This file failed our security check. Remove it and choose another.";

// The API refuses an unsafe file at submit; the form puts the message on the
// field and returns the person to its step (#1257). The upload widget must not
// re-judge the field as it mounts, which would wipe that message (#2940).
//
// Not under React.StrictMode: TanStack resets a field's meta on unmount, and
// StrictMode's dev-only extra unmount wipes a server error on any field type.
it("keeps the server's refusal on the file field when its step shows again", async () => {
  let api: any;
  function Harness({ show }: { show: boolean }) {
    const form = useForm({
      defaultValues: { [fileField.id]: null } as Record<string, unknown>,
      validationLogic: revalidateLogic({
        mode: "submit",
        modeAfterSubmission: "change",
      }),
      onSubmit: async () => {
        form.setFieldMeta(fileField.id, (prev) => ({
          ...prev,
          isValid: false,
          errors: [UNSAFE],
          errorMap: { ...prev.errorMap, onServer: UNSAFE },
        }));
      },
    });
    api = form;
    return show ? (
      <FieldRenderer
        form={form}
        field={fileField}
        validationProperties={buildFieldValidationProperties(fileField)}
      />
    ) : null;
  }
  const { rerender } = render(<Harness show />);
  act(() =>
    api.setFieldValue(fileField.id, [{ key: "uploads/k", name: "eicar.pdf" }]),
  );
  await act(async () => api.validateField(fileField.id, "submit"));
  rerender(<Harness show={false} />);
  await act(async () => api.handleSubmit());
  rerender(<Harness show />);

  expect(screen.getByText(UNSAFE)).toBeInTheDocument();
});
