import type { AnyFormApi } from "@tanstack/react-form";
import type { ClientFormStep, FormMeta } from "@forms/types";
import { validateStep } from "./validate-step";

export interface WalkResult {
  targetStepId: string;
  blocked: boolean;
}

// Forward-jump validation walk for the step progress map (#1864 phase 2).
//
// Backward navigation (target at or before the current step) is always
// free — no validation — since going back can't surface stale-forward
// errors and the target is already `done`.
//
// A forward jump walks every step from the current one (inclusive —
// leaving the current step forward must validate it exactly like Continue)
// up to but excluding the target, stopping at the first step that fails.
// Only the current step (`currentIndex`) is mounted, so it validates via
// `validateStep`'s normal mounted path (`form.validateField`, unchanged from
// `handleContinue`). Every other step in the walk is unmounted, so it uses
// `validateStep`'s `formMeta` fallback — see validate-step.ts and
// jump-walk.spike.spec.tsx for why the mounted path can't be reused there.
export const walkToStep = async (
  form: AnyFormApi,
  formMeta: FormMeta,
  visibleSteps: ClientFormStep[],
  currentIndex: number,
  targetStepId: string,
): Promise<WalkResult> => {
  const targetIndex = visibleSteps.findIndex((s) => s.stepId === targetStepId);

  if (targetIndex <= currentIndex) {
    return { targetStepId, blocked: false };
  }

  for (let i = currentIndex; i < targetIndex; i++) {
    const step = visibleSteps[i];
    const { ok } =
      i === currentIndex
        ? await validateStep(form, step)
        : await validateStep(form, step, formMeta);

    if (!ok) {
      return { targetStepId: step.stepId, blocked: true };
    }
  }

  return { targetStepId, blocked: false };
};
