import type { UIMessage } from "@tanstack/ai";
import {
  askFieldDef,
  offerFeedbackDef,
  presentChoicesDef,
  reviewFormDef,
  submitFormDef,
} from "#/lib/chat-tools";
import { extractText, hasAnyToolCall } from "./messages";

export function shouldShowThinking(messages: UIMessage[]): boolean {
  const last = messages.at(-1);
  if (!last) return false;
  if (last.role === "user") return true;
  // Hide once something renderable lands: text deltas, a present_choices
  // tool call, or a submit_form approval prompt. set_field is invisible.
  // offer_feedback also ends the turn's "work" (it pins the feedback form),
  // so treat it as a stop signal to avoid a hung indicator if no text follows.
  if (extractText(last).length > 0) return false;
  if (
    hasAnyToolCall(
      [last],
      [
        presentChoicesDef.name,
        askFieldDef.name,
        reviewFormDef.name,
        submitFormDef.name,
        offerFeedbackDef.name,
      ],
    )
  ) {
    return false;
  }
  return true;
}
