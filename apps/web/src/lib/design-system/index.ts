import basic from "../../styles/basic.module.css";
import govtechbb from "../../styles/govtechbb.module.css";

const DESIGN_SYSTEMS = {
  basic,
  govtechbb,
} as const;

type DesignSystemKey = keyof typeof DESIGN_SYSTEMS;

const requestedKey = process.env.DESIGN_SYSTEM as DesignSystemKey | undefined;

let designSystem = DESIGN_SYSTEMS.basic;

if (!requestedKey) {
  console.warn("[DesignSystem] No design system specified. Defaulting to 'basic'.");
} else if (!(requestedKey in DESIGN_SYSTEMS)) {
  console.warn(
    `[DesignSystem] '${requestedKey}' not found. Defaulting to 'basic'.`
  );
} else {
  designSystem = DESIGN_SYSTEMS[requestedKey];
}

export { designSystem };