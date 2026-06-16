import { createFileRoute } from "@tanstack/react-router";
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChatHeader, SiteHeader } from "#/components/chat/chrome";
import { Composer } from "#/components/chat/composer";
import {
  Messages,
  awaitingFieldAnswer,
  latestAssistantText,
} from "#/components/chat/messages";
import {
  conversationPersistence,
  loadCitationSidecar,
  saveCitationSidecar,
  type CitationSidecar,
} from "#/lib/chat/persistence";
import type { LinkTokenMap } from "#/lib/chat/link-tokens";
import type { Citation } from "#/lib/rag/types";

const EMPTY_SIDECAR: CitationSidecar = {
  citations: {},
  linkTokens: {},
};

// Cap the landing handoff query before auto-send, so an oversized `?q=` can't
// be replayed into the model verbatim.
const MAX_QUERY_LENGTH = 2000;

export const Route = createFileRoute("/")({
  component: Home,
  // The landing site deep-links the chat box into `/chat?q=…`; carry the query
  // through so it can be auto-sent on arrival.
  validateSearch: (s: Record<string, unknown>): { q?: string } => ({
    q: typeof s.q === "string" && s.q ? s.q : undefined,
  }),
});

interface CitationsEvent {
  messageId?: string;
  citations?: Citation[];
  linkTokens?: LinkTokenMap;
}

function Home() {
  const [input, setInput] = useState("");
  // Citations + link tokens for restored/streamed replies, keyed by messageId.
  // One piece of state, persisted via a functional update (no ref needed — the
  // hydrate effect below always runs before any onCustomEvent, which only fires
  // after the user sends a message).
  const [sidecar, setSidecar] = useState<CitationSidecar>(EMPTY_SIDECAR);

  // Restore after mount (SSR has no localStorage, so first server + client
  // renders both start empty — no hydration mismatch).
  useEffect(() => {
    setSidecar(loadCitationSidecar());
  }, []);

  const connection = useMemo(() => fetchServerSentEvents("/api/chat"), []);
  const {
    messages,
    sendMessage,
    isLoading,
    stop,
    error,
    clear,
    reload,
    addToolApprovalResponse,
  } = useChat({
    id: "conversation",
    connection,
    // Reload-survival: messages round-trip through localStorage (the example's
    // ChatClientPersistence adapter). stop() / clear-during-stream handling come
    // for free with it.
    persistence: conversationPersistence,
    // The server emits a `citations` CUSTOM event after TEXT_MESSAGE_START,
    // keyed by messageId (the example's onCustomEvent pattern). Merge it into
    // the persisted sidecar so a restored reply keeps its Sources + links.
    onCustomEvent: (eventType, data) => {
      if (eventType !== "citations") return;
      const payload = data as CitationsEvent | undefined;
      const id = payload?.messageId;
      if (!id) return;
      setSidecar((prev) => {
        const addCites = Array.isArray(payload.citations) && !prev.citations[id];
        const addTokens =
          !!payload.linkTokens &&
          Object.keys(payload.linkTokens).length > 0 &&
          !prev.linkTokens[id];
        if (!addCites && !addTokens) return prev;
        const next: CitationSidecar = {
          citations: addCites
            ? { ...prev.citations, [id]: payload.citations! }
            : prev.citations,
          linkTokens: addTokens
            ? { ...prev.linkTokens, [id]: payload.linkTokens! }
            : prev.linkTokens,
        };
        saveCitationSidecar(next);
        return next;
      });
    },
  });

  // Auto-send the landing handoff query (`/chat?q=…`) once, on arrival.
  const { q } = Route.useSearch();
  const autoSentRef = useRef(false);
  useEffect(() => {
    if (autoSentRef.current) return;
    const query = q?.trim().slice(0, MAX_QUERY_LENGTH);
    if (!query) return;
    autoSentRef.current = true;
    sendMessage(query);
  }, [q, sendMessage]);

  const submit = () => {
    const text = input.trim();
    if (!text || isLoading) return;
    sendMessage(text);
    setInput("");
  };

  // A field-widget answer (pill click) is sent as the user's next message —
  // turn-based + refresh-safe, the same path as typing. Ignored mid-stream.
  const answer = (text: string) => {
    if (isLoading) return;
    sendMessage(text);
  };

  // The notice banner's "feedback" link starts the chat-feedback form by sending
  // a natural-language request — the model recognises feedback intent and pins
  // the chat-feedback form (see system-prompt). No-op while a turn is streaming.
  const giveFeedback = () => {
    if (isLoading) return;
    sendMessage("I would like to give feedback on the assistant.");
  };

  // Clear the conversation + its persisted sidecar (no server session to reset).
  const startAgain = () => {
    clear();
    setSidecar(EMPTY_SIDECAR);
    saveCitationSidecar(EMPTY_SIDECAR);
  };

  // While a turn is in flight but the assistant hasn't started replying, show a
  // thinking indicator instead of dead air.
  const thinking =
    isLoading && messages[messages.length - 1]?.role !== "assistant";

  // Announce the finished reply once to screen readers — empty while streaming
  // so it isn't read token-by-token (the virtualized transcript isn't a live
  // region, so this off-screen node carries the announcement).
  const announcement = useMemo(
    () => (isLoading ? "" : latestAssistantText(messages, sidecar.linkTokens)),
    [isLoading, messages, sidecar.linkTokens],
  );

  return (
    <div className="flex h-dvh flex-col bg-white-00">
      <SiteHeader />
      <ChatHeader onStartAgain={startAgain} />
      <Messages
        messages={messages}
        citationsByMessageId={sidecar.citations}
        linkTokensByMessageId={sidecar.linkTokens}
        thinking={thinking}
        error={!!error}
        onReload={() => void reload()}
        onGiveFeedback={giveFeedback}
        onAnswer={answer}
        onApprove={(id, approved) => {
          void addToolApprovalResponse({ id, approved });
        }}
        onChange={(id, fieldLabel) => {
          // Can't submit and edit at once: cancel the pending submit, then
          // re-ask the field so the model re-presents it before re-summarising.
          void Promise.resolve(
            addToolApprovalResponse({ id, approved: false }),
          ).then(() => sendMessage(`I'd like to change my ${fieldLabel}.`));
        }}
      />
      <div className="sr-only" aria-live="polite">
        {announcement}
      </div>
      <Composer
        input={input}
        onChange={setInput}
        onSubmit={submit}
        onStop={stop}
        streaming={isLoading}
        placeholder={
          awaitingFieldAnswer(messages)
            ? "Type your answer…"
            : "Ask a question..."
        }
      />
    </div>
  );
}
