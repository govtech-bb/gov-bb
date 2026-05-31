import { ContactDetails } from "@govtech-bb/form-types";
import { AnyFormApi } from "@tanstack/react-form";
import {
  ClientFormStep,
  ClientPrimitive,
  ClientServiceContract,
} from "./field-mapper.type";
import { FormMeta } from "./renderer.type";
import { RepeatableStepSettings } from "./behavior-helper.type";

export interface FormRendererProps {
  form: AnyFormApi;
  formMeta: FormMeta;
  visibleSteps: ClientFormStep[];
  stepId: string;
  repeatableStepSettingsRef: React.MutableRefObject<RepeatableStepSettings>;
  submissionState?: SubmissionState;
}

export type FormRouteProps = {
  contract: ClientServiceContract;
  stepId?: string;
};

export type UseStepGuardProps = {
  formId: string;
  /**
   * The condition-filtered list of steps that are currently visible/active.
   * Hidden or conditionally-removed steps must NOT be included — the guard
   * derives all accessibility decisions from this list.
   */
  activeSteps: ClientFormStep[];
  /**
   * The step ID currently reflected in the URL (?step=...).
   * The guard enforces that the user may only be on a step that is both
   * present in activeSteps and reachable (all preceding steps completed).
   */
  currentStepId: string;
};

/**
 * A file that has been uploaded to storage via the presign → PUT → confirm
 * flow. This (not the raw `File`) is what is held in form state and sent in the
 * submission. `url` is a short-lived preview link returned at confirm time —
 * it expires, so it is kept only in component memory and never persisted.
 */
export interface UploadedFile {
  key: string;
  name: string;
  size: number;
  type: string;
  url?: string;
}

export type FileUploadProps = {
  field: ClientPrimitive;
  sharedProps: React.InputHTMLAttributes<HTMLInputElement>;
  onFileChange: (files: UploadedFile[] | null) => void;
  value?: UploadedFile[] | null;
  errorMessage?: string;
  /** id for the error element, so the input's aria-describedby resolves. */
  errorId?: string;
  validationRules?: any;
  formId?: string;
  /** Form version, required for the presigned-upload requests. */
  formVersion?: string;
};

/**
 * Which of the three confirmation outcomes the screen should render. This is
 * the discriminant the confirmation component renders off. When omitted it is
 * derived from `submissionSuccess` for back-compat (true → "success",
 * false → "error").
 *
 * - "success"    — submission saved (with or without payment).
 * - "processing" — the submission is still being processed asynchronously
 *                  (idempotent replay of an in-flight submit).
 * - "error"      — the submission failed; show a genuine error message.
 */
export type SubmissionDisplayStatus = "success" | "processing" | "error";

export interface SubmissionState {
  /**
   * Display discriminant. Optional for back-compat — when absent it is derived
   * from `submissionSuccess`.
   */
  displayStatus?: SubmissionDisplayStatus;
  hasPayment: boolean;
  /** Absent when an error is surfaced with no submission response body. */
  serviceName?: string;
  amount?: string;
  quantity?: number;
  submissionSuccess: boolean;
  paymentSuccess?: boolean;
  /** Absent for a generic error raised before any reference was issued. */
  referenceNumber?: string;
  /** Absent for a generic error raised before any reference was issued. */
  date?: string;
  paymentUrl?: string;
  paymentId?: string;
  paymentDescription?: string;
  /** Human-readable message shown when `displayStatus` is "error". */
  errorMessage?: string;
}

export interface SubmissionConfirmationProps {
  serviceTitle: string;
  stepTitle: string;
  nextSteps?: { title: string; content?: string; items?: string[] }[];
  contactDetails?: ContactDetails;
  onTryAgain?: () => void;
  submissionState?: SubmissionState;
}
