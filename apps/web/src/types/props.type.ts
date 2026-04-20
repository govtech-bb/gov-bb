// Will handle prop definitions

import { ClientServiceContract } from "./field-mapper.type";

export interface FormRendererProps {
  contract: ClientServiceContract;
  stepId?: string;
}
