import type { FormSettings } from "../../core/form-settings";
import type { FormPage, LegacySsbFormSchema } from "./schema";
import { serviceContract } from "./form-settings";
import { projectLogicRules } from "./logic-rules";

/** Keep the established SSB key order and apply only the legacy target's derived logic. */
export function finalizeLegacySsb(
  pages: FormPage[],
  settings: FormSettings,
  serviceTitle: string,
  title: string,
): LegacySsbFormSchema {
  const { formId, ...service } = serviceContract(settings, serviceTitle, pages);
  const schema: LegacySsbFormSchema = { formId, title, ...service, pages };
  projectLogicRules(schema);

  return schema;
}
