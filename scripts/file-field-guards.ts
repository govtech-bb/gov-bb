/**
 * Lint the file-upload convention on a parsed recipe: every file element must
 * declare `fileTypes`, as a non-empty array of format strings.
 *
 * There is no implicit default for `fileTypes` — a file field without one
 * cannot say what it accepts, so nothing can establish that an upload is a
 * permitted type. The API's presign gate then refuses any file the browser
 * could not type at all (an extensionless scan), which on a *required* upload
 * leaves a step the applicant cannot pass. That is a recipe defect rather than
 * anything an applicant can act on, so it is caught on the trunk instead of in
 * production.
 *
 * `itemMaxSize` is deliberately NOT required here: an unbounded upload is a
 * judgment call about the service, not a defect that can strand an applicant.
 *
 * Only recipe `overrides` are inspected, because neither file component in the
 * registry ships a `fileTypes` default (`GenericFile` and `UploadDocument` both
 * omit it), so the override is the only place it can come from. If a component
 * ever gains one, this guard would need to resolve refs to stay accurate.
 *
 * Returns human-readable error strings (empty when clean).
 */

/** Registry refs whose resolved primitive is a file input. */
const FILE_REFS = new Set([
  "components/upload-document",
  "components/generic-file",
]);

interface Elementish {
  ref?: unknown;
  overrides?: {
    fieldId?: unknown;
    validations?: { fileTypes?: { value?: unknown } };
  };
}

export function checkFileFieldsDeclareTypes(
  recipe: unknown,
  relative: string,
): string[] {
  const errors: string[] = [];
  const steps = (recipe as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) return errors;

  for (const step of steps) {
    const stepId = (step as { stepId?: unknown }).stepId;
    const elements = (step as { elements?: unknown }).elements;
    if (!Array.isArray(elements)) continue;

    elements.forEach((raw, i) => {
      const el = raw as Elementish;
      if (typeof el?.ref !== "string" || !FILE_REFS.has(el.ref)) return;

      const fieldId =
        typeof el.overrides?.fieldId === "string"
          ? el.overrides.fieldId
          : `element ${i}`;
      const where = `${relative}: ${String(stepId)}.${fieldId} (${el.ref})`;
      const value = el.overrides?.validations?.fileTypes?.value;

      if (value === undefined) {
        errors.push(
          `${where} declares no fileTypes — add a fileTypes validation listing the formats the service accepts`,
        );
        return;
      }
      if (
        !Array.isArray(value) ||
        value.length === 0 ||
        value.some((v) => typeof v !== "string" || v.trim() === "")
      ) {
        errors.push(
          `${where} has an invalid fileTypes.value — expected a non-empty array of format strings`,
        );
      }
    });
  }

  return errors;
}
