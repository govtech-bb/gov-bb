import basic from "../../styles/basic.module.css";
import govtechbb from "../../styles/govtechbb.module.css";

const DESIGN_SYSTEMS = {
    basic,
    govtechbb,
} as const;

export const designSystem = DESIGN_SYSTEMS[process.env.DESIGN_SYSTEM as keyof typeof DESIGN_SYSTEMS] || basic;