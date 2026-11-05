import type { FormModule } from "../field";
import { markRepeats } from "./repetition-presentation";

export const RepetitionModule = (): FormModule => ({
  key: "form-repetition",
  requires: ["form"],
  provides: ["form-repetition"],
  registrations: [{ key: "repeat-markers", phase: "browser", register: markRepeats }],
});
