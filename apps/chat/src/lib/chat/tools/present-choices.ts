import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

// A general closed-set choice prompt — the old app's present_choices. The model
// offers clickable option pills OUTSIDE a form: a yes/no offer ("Would you like
// me to show you the support options?" → ["Yes, show me the options", "No, I
// need something else"]) or a pick between a few options. The question + choices
// come from the model (not a form contract), so this carries no validation —
// it's purely a presentation tool. The client renders the tool-call's arguments
// as a question + ChoicePills; a click sends the chosen label as the user's next
// message (the same turn-based path as a form pill). The server side is a no-op:
// the real answer arrives as the user's next turn, so this just acknowledges.
export const presentChoicesToolDef = toolDefinition({
  name: "presentChoices",
  description:
    'Offer the user a closed-set choice as clickable buttons. Ask the question in your normal reply (e.g. "Would you like me to show you the support options?"), then call presentChoices with ONLY the button labels — e.g. choices: ["Yes, show me the options", "No, I need something else"]. NOT for open answers (names, dates, addresses) and NOT for a form field (use presentField for those). END YOUR TURN after calling — wait for the user to pick.',
  inputSchema: z.object({
    choices: z.array(z.string()).min(2),
  }),
  outputSchema: z.object({ shown: z.boolean() }),
});

export const presentChoicesTool = presentChoicesToolDef.server(() => ({
  shown: true,
}));
