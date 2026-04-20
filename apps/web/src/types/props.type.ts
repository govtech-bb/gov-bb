import { ClientServiceContract } from "./field-mapper.type";
import { FormMeta } from "./renderer.type";

export interface FormRendererProps {
  form?: any;
  formMeta: FormMeta;
  stepId?: string;
}

export type FormRouteProps = {
  contract: ClientServiceContract;
  stepId?: string;
};
