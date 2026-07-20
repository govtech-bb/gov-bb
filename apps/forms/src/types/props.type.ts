import { ContactDetails } from "@govtech-bb/form-types";
import { AnyFormApi } from "@tanstack/react-form";
import { ClientFormStep, ClientPrimitive } from "./field-mapper.type";
import { FormMeta } from "./renderer.type";
import { RepeatableStepSettings } from "./repeatable.type";

export interface FormRendererProps {
  form: AnyFormApi;
  formMeta: FormMeta;
  visibleSteps: ClientFormStep[];
  stepId: string;
  repeatableStepSettingsRef: React.MutableRefObject<RepeatableStepSettings>;
  submissionState?: SubmissionState;
  /**
   * `?draft=` mode (#1682): viewing the in-progress DB scratch draft. Submission
   * is BLOCKED (the recipe isn't published). Drives the blocking banner, the
   * disabled submit button, and the submit hint. `?preview=` (the published
   * recipe of a non-public form) is intentionally NOT flagged here — it submits
   * exactly as a citizen would once the form launches.
   */
  isDraft?: boolean;
  /**
   * The raw `?preview=` token, forwarded to file uploads so presign/confirm
   * resolve the non-public published recipe.
   */
  previewToken?: string;
  /**
   * The raw `?draft=` token, forwarded to file uploads so presign/confirm
   * resolve the file field against the in-progress DB scratch during review
   * (#1682).
   */
  draftToken?: string;
}

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
  /**
   * The `?preview=` token (published recipe of a non-public form). Forwarded as
   * X-Recipe-Preview on presign + confirm.
   */
  previewToken?: string;
  /**
   * The `?draft=` token (in-progress DB scratch). Forwarded as X-Recipe-Draft so
   * the file field resolves during draft review (#1682).
   */
  draftToken?: string;
};

export interface SubmissionState {
  hasPayment: boolean;
  serviceName: string;
  amount?: string;
  unitPrice?: string;
  quantity?: number;
  submissionSuccess: boolean;
  paymentSuccess?: boolean;
  /**
   * Set when the submission came back `processing` — an idempotency-key replay
   * of an in-flight submission (HTTP 202). The confirmation step renders a
   * neutral "we're processing your submission" panel rather than a finished
   * receipt (#463). Absent on every other state.
   */
  processing?: boolean;
  referenceNumber: string;
  // Optional: payment ("gated") submissions are not finalised yet, so the
  // server returns `submittedAt: null` — there is no submission date to show
  // until payment completes (#919). formatDate() renders nothing for undefined.
  date?: string;
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
  /**
   * Target for the "Give feedback on this service" link. When set, the feedback
   * section renders an exit-survey link carrying the originating form id as
   * `?source=`. Omitted (e.g. on the exit survey's own confirmation) hides the
   * section so the feedback form never links back to itself.
   */
  feedbackUrl?: string;
}
