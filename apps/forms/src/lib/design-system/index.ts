import basic from "../../styles/basic.module.css";
import govtechbb from "../../styles/govtechbb.module.css";

const DESIGN_SYSTEMS = {
  basic,
  govtechbb,
} as const;

type DesignSystemKey = keyof typeof DESIGN_SYSTEMS;

export function selectDesignSystem(requestedKey: string | undefined) {
  if (!requestedKey) {
    console.warn(
      "[DesignSystem] No design system specified. Defaulting to 'basic'.",
    );
    return DESIGN_SYSTEMS.basic;
  }
  if (!(requestedKey in DESIGN_SYSTEMS)) {
    console.warn(
      `[DesignSystem] '${requestedKey}' not found. Defaulting to 'basic'.`,
    );
    return DESIGN_SYSTEMS.basic;
  }
  return DESIGN_SYSTEMS[requestedKey as DesignSystemKey];
}

export default selectDesignSystem(import.meta.env.VITE_DESIGN_SYSTEM);
