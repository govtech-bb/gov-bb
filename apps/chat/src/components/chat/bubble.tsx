import type { InferToolInput, UIMessage } from "@tanstack/ai";
import { Allow, parse as parsePartialJson } from "partial-json";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { presentChoicesDef } from "#/lib/chat-tools";
import { TridentAvatar } from "#/components/trident-avatar";
import {
  extractText,
  findToolCall,
  stripLeakedToolCalls,
} from "#/lib/chat/messages";
import { normalizeMarkdown } from "#/lib/chat/normalize-markdown";
import type { Citation } from "#/lib/chat/types";
import {
  AskFieldWidget,
  type AskFieldOutput,
} from "./ask-field";
import { ChoicePills } from "./choice-pills";
import { ReviewSummary, type ReviewOutput } from "./review-summary";
import { annotateCitations, buildMarkdownComponents } from "./markdown";

type ChoicesArgs = Partial<InferToolInput<typeof presentChoicesDef>>;

function parseChoiceArgs(raw: string | undefined): ChoicesArgs | undefined {
  if (!raw) return undefined;
  try {
    return parsePartialJson(raw, Allow.ALL) as ChoicesArgs;
  } catch {
    return undefined;
  }
}

// The model tends to narrate the question as text AND call present_choices.
// Drop a trailing interrogative sentence so the question shows once (as the
// buttons), keeping any lead-in. Without this the text+buttons double-render.
function stripTrailingQuestion(text: string): string {
  return text.replace(/\s*[^.!?\n]*\?\s*$/, "").trimEnd();
}

function BubbleImpl({
  message,
  onChoice,
  onApproval,
  choicesDisabled = false,
  citations,
}: {
  message: UIMessage;
  onChoice: (choice: string) => void;
  onApproval: (id: string, approved: boolean) => void;
  choicesDisabled?: boolean;
  citations?: Citation[];
}) {
  const text = useMemo(
    () => stripLeakedToolCalls(extractText(message)),
    [message],
  );

  const choicesPart = findToolCall(message, "present_choices");
  const askFieldPart = findToolCall(message, "ask_field");
  // present_choices is a no-op server tool: once it resolves, the part lands in
  // "complete". Keep rendering the buttons in that state (they go disabled, not
  // gone, once a later turn lands) — otherwise they flash on then vanish.
  const ready = (part: typeof choicesPart) =>
    part?.state === "input-complete" ||
    part?.state === "approval-requested" ||
    part?.state === "approval-responded" ||
    part?.state === "complete";
  const choicesArgs = ready(choicesPart)
    ? parseChoiceArgs(choicesPart?.arguments)
    : undefined;
  const choices = (choicesArgs?.choices ?? []).filter(
    (c): c is string => typeof c === "string" && c.length > 0,
  );
  const hasChoices = choices.length > 0;

  // ask_field and review_form render from the tool RESULT (the canonical data
  // from the contract / session), so they're only available once the no-op
  // server tool completed.
  const askFieldOutput =
    askFieldPart?.state === "complete"
      ? (askFieldPart.output as AskFieldOutput | undefined)
      : undefined;
  const fieldSpec = askFieldOutput?.ok ? askFieldOutput.field : undefined;

  const reviewPart = findToolCall(message, "review_form");
  const reviewOutput =
    reviewPart?.state === "complete"
      ? (reviewPart.output as ReviewOutput | undefined)
      : undefined;
  const reviewItems = reviewOutput?.ok ? (reviewOutput.items ?? []) : [];
  // The feedback form reads as "feedback", not "application". review_form runs
  // in the same turn as the submit_form approval below, so its output is the
  // signal for wording the approval prompt.
  const isFeedbackForm = reviewOutput?.ok && reviewOutput.isFeedback === true;

  // Keep the lead-in text but drop the trailing question when buttons render it.
  const displayText = useMemo(
    () => (hasChoices || fieldSpec ? stripTrailingQuestion(text) : text),
    [text, hasChoices, fieldSpec],
  );
  const renderedMarkdown = useMemo(() => {
    const normalized = normalizeMarkdown(displayText);
    return annotateCitations(normalized, citations ?? []);
  }, [displayText, citations]);
  const markdownComponents = useMemo(
    () => buildMarkdownComponents(citations ?? []),
    [citations],
  );

  // Latch the bubble's interactive controls to fire ONCE. They otherwise gate
  // re-clicks only on `choicesDisabled`, which flips a network round-trip later
  // (when the next message lands) — leaving a window where a fast second click
  // sends a duplicate. A double-picked choice spawns two turns (two review +
  // submit prompts); a double-clicked Submit sends the approval twice. The ref
  // blocks synchronously (before React repaints the disabled state); the state
  // drives the disabled styling.
  const respondedRef = useRef(false);
  const [responded, setResponded] = useState(false);
  const respondOnce = useCallback((fire: () => void) => {
    if (respondedRef.current) return;
    respondedRef.current = true;
    setResponded(true);
    fire();
  }, []);
  const handleChoice = useCallback(
    (choice: string) => respondOnce(() => onChoice(choice)),
    [respondOnce, onChoice],
  );
  const handleApproval = useCallback(
    (id: string, approved: boolean) =>
      respondOnce(() => onApproval(id, approved)),
    [respondOnce, onApproval],
  );

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="text-bubble max-w-[75%] rounded-[16px_16px_4px_16px] bg-blue-100 px-4 py-2.5 text-white-00">
          {text}
        </div>
      </div>
    );
  }

  const submitPart = findToolCall(message, "submit_form");
  const submitApproval =
    submitPart?.state === "approval-requested" ? submitPart.approval : null;
  // "Not yet" flips the part to approval-responded/approved=false. Without this
  // the prompt would just vanish, leaving the decline unacknowledged.
  const submitDeclined =
    submitPart?.state === "approval-responded" &&
    submitPart.approval?.approved === false;

  // Once any control in this bubble has fired, lock them all — both the
  // historical-staleness gate and the just-clicked latch.
  const controlsDisabled = choicesDisabled || responded;

  const showText = displayText.length > 0;

  if (
    !showText &&
    !hasChoices &&
    !fieldSpec &&
    !reviewItems.length &&
    !submitApproval &&
    !submitDeclined
  )
    return null;

  return (
    <div className="flex max-w-[92%] items-start gap-2.5">
      <TridentAvatar size="sm" tone="filled" />
      <div className="flex min-w-0 flex-1 rounded-[16px_16px_16px_4px] bg-blue-10 px-4 py-3 sm:px-5 sm:py-3.5">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {showText && (
            <div className="text-bubble text-black-00">
              <ReactMarkdown
                components={markdownComponents}
                remarkPlugins={[remarkGfm]}
              >
                {renderedMarkdown}
              </ReactMarkdown>
            </div>
          )}

          {hasChoices && (
            <ChoicePills
              questionId={`choices-q-${message.id}`}
              question={choicesArgs?.question}
              choices={choices}
              disabled={controlsDisabled}
              onPick={handleChoice}
            />
          )}

          {fieldSpec && (
            <AskFieldWidget
              spec={fieldSpec}
              messageId={message.id}
              answered={controlsDisabled}
              onAnswer={handleChoice}
            />
          )}

          {reviewItems.length > 0 && (
            <ReviewSummary
              items={reviewItems}
              disabled={controlsDisabled}
              onChange={(label) => handleChoice(`I'd like to change ${label}`)}
            />
          )}

          {submitApproval && (
            <div className="flex flex-col gap-2.5">
              <p className="text-bubble font-medium text-black-00">
                Submit your {isFeedbackForm ? "feedback" : "application"} now?
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded-full bg-teal-00 px-4 py-1.5 font-medium text-sm text-white-00 transition-colors hover:bg-teal-100 focus-visible:outline-2 focus-visible:outline-teal-00 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-mid-grey-00"
                  disabled={controlsDisabled}
                  onClick={() => handleApproval(submitApproval.id, true)}
                  type="button"
                >
                  Submit
                </button>
                <button
                  className="rounded-full border-[1.5px] border-mid-grey-00 bg-transparent px-3.5 py-1.5 font-medium text-sm text-mid-grey-00 transition-colors hover:border-black-00 hover:text-black-00 focus-visible:outline-2 focus-visible:outline-teal-00 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={controlsDisabled}
                  onClick={() => handleApproval(submitApproval.id, false)}
                  type="button"
                >
                  Not yet
                </button>
              </div>
            </div>
          )}

          {submitDeclined && (
            <p className="text-bubble text-mid-grey-00 italic">
              Not submitted.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export const Bubble = memo(BubbleImpl);
