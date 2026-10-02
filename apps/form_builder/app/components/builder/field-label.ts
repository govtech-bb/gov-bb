import type {
  RecipeFieldDraft,
  ComponentDefinition,
  BlockDefinition,
} from "@govtech-bb/form-builder";

/**
 * Resolve the human-facing label for an added-field row.
 *
 * Fallback chain:
 *   field.overrides?.label → (component/custom) item.primitive label →
 *   item.displayName → field.ref
 *
 * Empty strings are treated as not-set so they fall through. The primitive
 * label is optional-chained because custom components surface a component-shaped
 * object whose `primitive` can lack a `label` at runtime.
 */
export function resolveFieldLabel(
  field: RecipeFieldDraft,
  item: ComponentDefinition | BlockDefinition | undefined,
): string {
  const overrideLabel = field.overrides?.label;
  if (overrideLabel) return overrideLabel;

  if (item && "primitive" in item) {
    const primitiveLabel = item.primitive?.label;
    if (primitiveLabel) return primitiveLabel;
  }

  if (item?.displayName) return item.displayName;

  return field.ref;
}
