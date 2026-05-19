import posthog from "posthog-js";
import { isPostHogEnabled } from "./posthog-client";

type Props = Record<string, string | number | boolean | undefined>;

function capture(event: string, props: Props) {
  if (!isPostHogEnabled()) return;
  posthog.capture(event, props);
}

export function trackFormStarted(formId: string, formVersion: string) {
  capture("form_started", { form_id: formId, form_version: formVersion });
}

export function trackStepViewed(
  formId: string,
  formVersion: string,
  stepId: string,
  stepIndex: number,
) {
  capture("step_viewed", {
    form_id: formId,
    form_version: formVersion,
    step_id: stepId,
    step_index: stepIndex,
  });
}

export function trackStepCompleted(
  formId: string,
  formVersion: string,
  stepId: string,
  stepIndex: number,
  durationMs: number,
) {
  capture("step_completed", {
    form_id: formId,
    form_version: formVersion,
    step_id: stepId,
    step_index: stepIndex,
    duration_ms: durationMs,
  });
}

export function trackStepBack(
  formId: string,
  formVersion: string,
  fromStepId: string,
  toStepId: string,
) {
  capture("step_back", {
    form_id: formId,
    form_version: formVersion,
    from_step_id: fromStepId,
    to_step_id: toStepId,
  });
}

export function trackFieldValidationError(
  formId: string,
  formVersion: string,
  stepId: string,
  fieldId: string,
  errorType: string,
) {
  capture("field_validation_error", {
    form_id: formId,
    form_version: formVersion,
    step_id: stepId,
    field_id: fieldId,
    error_type: errorType,
  });
}

export function trackFormSubmitted(
  formId: string,
  formVersion: string,
  durationMs: number,
) {
  capture("form_submitted", {
    form_id: formId,
    form_version: formVersion,
    duration_ms: durationMs,
  });
}
