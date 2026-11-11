import { trackEvent, type TrackingData } from "@govtech-bb/analytics";

// Chat analytics (#3515): one `chat-answer` for every `chat-submit` this app
// sends. Only the turns that start with a question are tracked: a question
// typed into the composer ("chat"), or one carried over from landing in `?q=`
// ("landing"). Retries, pill answers and other follow-ups send nothing, so the
// two counts stay paired. No question or answer text is ever sent.

export type QuestionSource = "chat" | "landing";

type ChatEvent = "chat-submit" | "chat-answer";
type Send = <E extends ChatEvent>(event: E, data: TrackingData[E]) => void;

export function createAnswerTracker(send: Send = trackEvent) {
  let pending = false;
  let cited = false;

  const answer = (outcome: TrackingData["chat-answer"]["outcome"]) => {
    if (!pending) return;
    pending = false;
    send("chat-answer", { outcome, source: cited ? "citations" : "none" });
  };

  return {
    asked(source: QuestionSource) {
      pending = true;
      cited = false;
      send("chat-submit", { source });
    },
    /** The server sent the reply's `citations` event (cited alpha.gov.bb pages). */
    cited() {
      if (pending) cited = true;
    },
    finished: () => answer("answered"),
    failed: () => answer("error"),
    /** The user stopped the reply, or started again while it streamed. */
    stopped: () => answer("stopped"),
  };
}
