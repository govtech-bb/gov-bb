import { AnyFormApi } from "@tanstack/react-form";
import { ClientServiceContract } from "./field-mapper.type";
import { FormMeta } from "./renderer.type";
import { Store } from "@tanstack/react-store";

export interface FormRendererProps {
  form: AnyFormApi;
  formMeta: FormMeta;
  targetStores: Store<AnyFormApi>[];
  stepId?: string;
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

export type ReviewProps = {
  formMeta: FormMeta;
  form: AnyFormApi;
};
