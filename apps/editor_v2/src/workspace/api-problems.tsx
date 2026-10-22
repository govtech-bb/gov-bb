import { Banner } from "../ui/banner";

/** One API problem as a sentence, several as a list. */
export function ApiProblemText({ messages }: { messages: readonly string[] }) {
  return messages.length === 1 ? (
    messages[0]
  ) : (
    <ul className="list-disc ps-5">
      {messages.map((message) => (
        <li key={message}>{message}</li>
      ))}
    </ul>
  );
}

/** Dialog problems announced together, separate from field-specific errors. */
export function ApiProblems({ messages }: { messages: readonly string[] }) {
  if (messages.length === 0) return null;

  return (
    <Banner tone="error" className="mt-4">
      <ApiProblemText messages={messages} />
    </Banner>
  );
}
