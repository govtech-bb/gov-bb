import { trackEvent, type TrackingData } from "@govtech-bb/analytics";

// Chat analytics (#3515): one `chat-answer` for every question, so each
// `chat-submit` has one answer. Only the turns that start with a question are
// tracked: a question typed into the composer ("chat"), or one carried over
// from landing in `?q=` ("landing"). Landing already sent `chat-submit` (or
// `chat-suggestion`) for its question, so only a question typed here sends
// `chat-submit`. Retries, field answers and other follow-ups send nothing. No
// question or answer text is ever sent.
//
// The answer is settled when the turn stops loading, not on useChat's
// onFinish: onFinish can fire once per model pass in a tool loop, and not at
// all when no reply text came back.

export type QuestionSource = TrackingData["chat-answer"]["source"];

type ChatEvent = "chat-submit" | "chat-answer";
type Send = <E extends ChatEvent>(event: E, data: TrackingData[E]) => void;

export function createAnswerTracker(send: Send = trackEvent) {
  let pending: QuestionSource | null = null;
  let cited = false;
  let replied = false;
  let loading = false;

  const answer = (outcome: TrackingData["chat-answer"]["outcome"]) => {
    if (!pending) return;
    send("chat-answer", { outcome, source: pending, cited });
    pending = null;
  };

  return {
    asked(source: QuestionSource) {
      pending = source;
      cited = false;
      replied = false;
      if (source === "chat") send("chat-submit", { source });
    },
    /** The server sent the reply's `citations` event (cited alpha.gov.bb pages). */
    cited() {
      if (pending) cited = true;
    },
    /** Reply text came back (useChat's onFinish). */
    replied() {
      if (pending) replied = true;
    },
    failed: () => answer("error"),
    /** The user stopped the reply, or started again while it streamed. */
    stopped: () => answer("stopped"),
    /** useChat's isLoading. When a turn ends, so does its question's answer. */
    loading(now: boolean) {
      const ended = loading && !now;
      loading = now;
      if (ended) answer(replied ? "answered" : "error");
    },
  };
}
