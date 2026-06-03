import type { FieldOverrides, HtmlTypes } from "@govtech-bb/form-types";
import { REGISTRY_PRIMITIVES } from "@govtech-bb/registry";
import { getRegistryItem } from "./catalog";
import type { RegistryCatalog } from "./catalog";
import { VALIDATION_RULE_DESCRIPTORS } from "./behaviors/validation-builder";

// A swap group bundles the htmlTypes an author can interchange. A field can only
// be re-typed within its own group, so its label/validations/position survive
// the change. htmlTypes absent from every group (date, file, show-hide) are
// "singletons" with no swap peers.
export const SWAP_GROUPS = {
  "text-like": ["text", "textarea", "tel", "number", "email"],
  choice: ["select", "radio", "checkbox"],
} as const satisfies Record<string, HtmlTypes[]>;

export type SwapGroup = keyof typeof SWAP_GROUPS;

export interface SwappableRef {
  ref: string;
  displayName: string;
  htmlType: HtmlTypes;
}

// Validation rule types that are type-agnostic and must survive any in-group
// swap, even though they appear in no per-htmlType descriptor list:
// `required` (carried for every type) and `conditionalOn` (conditional-required
// logic, independent of the field's html type).
const ALWAYS_CARRIED_VALIDATIONS = new Set(["required", "conditionalOn"]);

function groupFor(htmlType: HtmlTypes): readonly HtmlTypes[] | undefined {
  return Object.values(SWAP_GROUPS).find((types) =>
    (types as readonly HtmlTypes[]).includes(htmlType),
  );
}

function htmlTypeOf(
  ref: string,
  catalog: RegistryCatalog,
): HtmlTypes | undefined {
  const item = getRegistryItem(ref, catalog);
  if (item && "primitive" in item) return item.primitive.htmlType;
  return undefined; // blocks and unknown refs have no single htmlType
}

/**
 * The generic primitives an author may switch the field at `currentRef` to —
 * those sharing its swap group, minus `currentRef` itself. Candidates are drawn
 * only from the generic primitives (REGISTRY_PRIMITIVES), not the named
 * components, so the picker is a short list of true type-swaps. Returns `[]` for
 * singleton htmlTypes, blocks, and unknown refs.
 */
export function getSwappableRefs(
  currentRef: string,
  catalog: RegistryCatalog,
): SwappableRef[] {
  const htmlType = htmlTypeOf(currentRef, catalog);
  if (htmlType === undefined) return [];
  const group = groupFor(htmlType);
  if (group === undefined) return [];

  return Object.entries(REGISTRY_PRIMITIVES)
    .filter(
      ([ref, primitive]) =>
        ref !== currentRef && group.includes(primitive.htmlType),
    )
    .map(([ref, primitive]) => ({
      ref,
      displayName: primitive.label,
      htmlType: primitive.htmlType,
    }));
}

/**
 * Keep-compatible override migration when a field's ref changes html type.
 * Carries the type-agnostic overrides (id, label, hint, placeholder, disabled,
 * hidden, ui, behaviours), keeps `required`/`conditionalOn` plus any validation
 * rule the *target* htmlType supports, and carries `options`/`multiple` only
 * when both ends are in the Choice group. Type-specific keys (`defaultValue`,
 * `mask`) are dropped.
 */
export function migrateOverridesForRef(
  overrides: FieldOverrides,
  fromHtmlType: HtmlTypes,
  toHtmlType: HtmlTypes,
): FieldOverrides {
  const next: FieldOverrides = {};

  // Always-compatible, type-agnostic keys.
  if (overrides.fieldId !== undefined) next.fieldId = overrides.fieldId;
  if (overrides.label !== undefined) next.label = overrides.label;
  if (overrides.hint !== undefined) next.hint = overrides.hint;
  if (overrides.placeholder !== undefined)
    next.placeholder = overrides.placeholder;
  if (overrides.isDisabled !== undefined)
    next.isDisabled = overrides.isDisabled;
  if (overrides.isHidden !== undefined) next.isHidden = overrides.isHidden;
  if (overrides.ui !== undefined) next.ui = overrides.ui;
  if (overrides.behaviours !== undefined)
    next.behaviours = overrides.behaviours;

  // Validations: carry the always-compatible rules, plus any rule the target
  // htmlType offers per its descriptor list.
  if (overrides.validations !== undefined) {
    const supported = new Set<string>(
      (VALIDATION_RULE_DESCRIPTORS[toHtmlType] ?? []).map((d) => d.type),
    );
    const migrated = Object.fromEntries(
      Object.entries(overrides.validations).filter(
        ([type]) => ALWAYS_CARRIED_VALIDATIONS.has(type) || supported.has(type),
      ),
    ) as FieldOverrides["validations"];
    if (migrated && Object.keys(migrated).length > 0)
      next.validations = migrated;
  }

  // `options` survive any swap within the Choice group (select/radio/checkbox
  // all carry options). `multiple` is select-only — radio/checkbox have no such
  // property — so it survives only when the target is a select.
  const choice = SWAP_GROUPS.choice as readonly HtmlTypes[];
  if (choice.includes(fromHtmlType) && choice.includes(toHtmlType)) {
    if (overrides.options !== undefined) next.options = overrides.options;
    if (overrides.multiple !== undefined && toHtmlType === "select")
      next.multiple = overrides.multiple;
  }

  return next;
}
