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
  repeatableStepSettings: RepeatableStepSettings;
  setRepeatableStepSettings: React.Dispatch<
    React.SetStateAction<RepeatableStepSettings>
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
};
