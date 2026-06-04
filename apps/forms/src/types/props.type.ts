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
  formId?: string;
  /** Form version, required for the presigned-upload requests. */
  formVersion?: string;
};

export interface SubmissionState {
  hasPayment: boolean;
  serviceName: string;
  amount?: string;
  unitPrice?: string;
  quantity?: number;
  submissionSuccess: boolean;
  paymentSuccess?: boolean;
  referenceNumber: string;
  date: string;
  paymentUrl?: string;
  paymentId?: string;
  paymentDescription?: string;
}

export interface SubmissionConfirmationProps {
  serviceTitle: string;
  stepTitle: string;
  /**
   * Service-specific processing copy shown under the title (e.g. "The Barbados
   * Postal Service will process your request when you have made the payment").
   * Sourced from the confirmation step's `description`; falls back to a generic
   * message when absent.
   */
  processingMessage?: string;
  nextSteps?: { title: string; content?: string; items?: string[] }[];
  /**
   * Raw markdown rendered on the confirmation page (e.g. a "What you need to
   * know" section). Sourced from the confirmation step's `markdownContent`,
   * letting a recipe drive form-specific copy. Parsed by react-markdown with
   * HTML escaping (no raw HTML), so recipe-authored content is XSS-safe.
   */
  markdownContent?: string;
  contactDetails?: ContactDetails;
  onTryAgain?: () => void;
  submissionState?: SubmissionState;
}
