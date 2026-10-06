import type { QuestionBase, Layout } from "../../forms/schema";
import { COMPONENTS } from "./components";

/** Each named factory returns detached native data with an explicit authored identity and key. */
export function componentQuestion(
  ref: keyof typeof COMPONENTS,
  id: string,
  overrides: { label?: string; required?: boolean; visible?: boolean; layout?: Layout } = {},
): QuestionBase {
  const component = COMPONENTS[ref];

  if (!component) throw new Error(`Unknown registry component: ${ref}`);

  return {
    ...structuredClone(component),
    id,
    type: "question",
    key: id,
    ...(overrides.label !== undefined && { label: overrides.label }),
    ...(overrides.required !== undefined && {
      required: {
        value: overrides.required,
        message: component.required?.message ?? "Enter an answer",
      },
    }),
    ...(overrides.visible !== undefined && { visible: overrides.visible }),
    ...(overrides.layout && { layout: structuredClone(overrides.layout) }),
  };
}
