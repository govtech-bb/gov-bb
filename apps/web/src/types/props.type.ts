import { AnyFormApi } from "@tanstack/react-form";
import {
  ClientFormStep,
  ClientPrimitive,
  ClientServiceContract,
} from "./field-mapper.type";
import { FormMeta } from "./renderer.type";
import { FormRepeatableRecord } from "./behavior-helper.type";
import { ValidationConfig } from "@govtech-bb/form-types";

export interface FormRendererProps {
  form: AnyFormApi;
  formMeta: FormMeta;
  visibleSteps: ClientFormStep[];
  stepId: string;
  repeatableRecord: FormRepeatableRecord;
  setRepeatableRecord: React.Dispatch<
    React.SetStateAction<FormRepeatableRecord>
  >;
}

export type FormRouteProps = {
  contract: ClientServiceContract;
  stepId?: string;
};

export type UseStepGuardProps = {
  formId: string;
  steps: { stepId: string }[];
  stepId?: string;
  setStepIndex: React.Dispatch<React.SetStateAction<number>>;
};

export type FileUploadProps = {
  field: ClientPrimitive;
  sharedProps: React.InputHTMLAttributes<HTMLInputElement>;
  onFileChange?: (files: File[] | null) => void;
  value?: File[] | null;
  errorMessage?: string;
  validationRules?: any;
};
