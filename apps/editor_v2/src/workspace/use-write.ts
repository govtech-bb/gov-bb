import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { EditorApi } from "../api/client";
import { writeAttempt, type Outcome, type Write } from "../api/write-attempt";

/** Keep one attempt per mounted write; refresh content after lost answers and confirmed writes. */
export function useWrite<Sent, Answer>(
  api: EditorApi,
  entry: (api: EditorApi) => Write<Sent, Answer>,
) {
  const client = useQueryClient();
  const [outcome, setOutcome] = useState<Outcome<Answer>>();
  const [state, setState] = useState<"idle" | "sending" | "checking" | "unsettled">("idle");

  const hold = () => {
    const write = entry(api);

    const attempt = writeAttempt({
      ...write,
      send: (sent: Sent) => {
        setState("sending");

        return write.send(sent);
      },
      readBack: (sent: Sent) => {
        setState("checking");
        // Every check follows a lost answer, including the author's later check.
        void client.invalidateQueries({ queryKey: ["content"] });

        return write.readBack(sent);
      },
    });

    return { api, entry, client, attempt };
  };

  // State, not useMemo: React may drop a memo, and with it the frozen request a retry must resend.
  const [held, setHeld] = useState(hold);
  let { attempt } = held;

  if (held.api !== api || held.entry !== entry || held.client !== client) {
    const next = hold();

    setHeld(next);
    attempt = next.attempt;
  }

  return {
    state,
    outcome,
    async press(next: () => Sent) {
      // A fresh request starts clean. An unsettled one keeps "unknown" up while it is checked.
      if (attempt.state !== "unsettled") setOutcome(undefined);

      const result = await attempt.press(next);
      setOutcome(result);
      setState(attempt.state);

      if (result.kind === "landed") void client.invalidateQueries({ queryKey: ["content"] });

      return result;
    },
    forget() {
      attempt.forget();
      setState(attempt.state);
      setOutcome(undefined);
    },
  };
}
