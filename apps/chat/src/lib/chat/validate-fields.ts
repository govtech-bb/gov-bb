// V1 stub: validation always reports a pending-integration error so the
// model surfaces a clean message instead of pretending it can open a
// review page.
export type ValidationResult =
  | { ok: true }
  | { ok: false; errors: Array<{ field: string; message: string }> };

export function validateFormFields(
  _service: string,
  _fields: Record<string, string>,
): Promise<ValidationResult> {
  return Promise.resolve({
    ok: false,
    errors: [
      {
        field: "service",
        message: "form integration pending",
      },
    ],
  });
}
