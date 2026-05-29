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

export type FileUploadProps = {
  field: ClientPrimitive;
  sharedProps: React.InputHTMLAttributes<HTMLInputElement>;
  onFileChange: (files: File[] | null) => void;
  value?: File[] | null;
  errorMessage?: string;
  /** id for the error element, so the input's aria-describedby resolves. */
  errorId?: string;
  validationRules?: any;
  formId?: string;
};

export interface SubmissionState {
  hasPayment: boolean;
  serviceName: string;
  amount?: string;
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
  nextSteps?: { title: string; content?: string; items?: string[] }[];
  contactDetails?: ContactDetails;
  onTryAgain?: () => void;
  submissionState?: SubmissionState;
}
