import { AssistantBubble } from "./bubbles";

// Shown while a turn is in flight but no assistant text has streamed yet — so
// the multi-second RAG + model latency isn't dead air. Three pulsing dots in an
// assistant bubble; replaced by the real reply as soon as tokens arrive.
export function ThinkingBubble() {
  return (
    <AssistantBubble>
      <span className="flex gap-1 py-1" aria-label="Working" role="status">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-mid-grey-00"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </span>
    </AssistantBubble>
  );
}
