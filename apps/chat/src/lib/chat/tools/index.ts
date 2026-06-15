import type { Features } from "#/config/features";
import { getFormDefinitionTool } from "./form-definition";
import { presentChoicesTool } from "./present-choices";
import { presentFieldTool } from "./present-field";
import { setFieldTool } from "./set-field";
import { submitFormTool } from "./submit";

// The server tools the chat turn exposes, gated by feature flags. With no
// in-chat form features on, the assistant just answers questions and exposes no
// tools. `features.forms` turns on filling a form INLINE in chat:
// getFormDefinition (look up a form's fields) → presentField (render a field's
// widget) → setField (validate + record an answer) → submitForm (approval-gated;
// dry-run unless SUBMIT_LIVE). `feedback` reuses the same collection tools for
// the chat-feedback form. `features.offers` adds presentChoices — clickable
// offer/disclosure pills (progressive disclosure + "apply now?" offers). The
// agent loop only runs when this returns tools, so a turn with no form/offer
// feature is unchanged.
export function buildChatTools(features: Features) {
  const tools = [];
  if (features.forms || features.feedback) {
    tools.push(
      getFormDefinitionTool,
      presentFieldTool,
      setFieldTool,
      submitFormTool,
    );
  }
  if (features.offers) {
    tools.push(presentChoicesTool);
  }
  return tools;
}
