import { Text } from "@govtech-bb/react";
import { TridentAvatar } from "#/components/trident-avatar";

export function OptimisticUserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="text-bubble max-w-[75%] rounded-[16px_16px_4px_16px] bg-blue-100 px-4 py-2.5 text-white-00">
        {text}
      </div>
    </div>
  );
}

// Beta disclaimer rendered as the first chat row, above the welcome bubble.
// Intentionally always shown (no dismiss / once-per-session suppression) and
// styled as a full-width yellow WARNING banner — not a chat bubble — so it
// reads as a standing notice rather than a message from the assistant. The word
// "feedback" is an inline link (the manual counterpart to the model's offer)
// that starts the feedback form; it stays put — it never hides on click.
export function NoticeBubble({
  onGiveFeedback,
}: {
  onGiveFeedback: () => void;
}) {
  return (
    <div
      role="note"
      className="mb-s flex items-start gap-2.5 rounded-lg bg-yellow-10 px-4 py-3"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="mt-px size-5 shrink-0 text-yellow-00"
      >
        <path
          fill="currentColor"
          d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"
        />
      </svg>
      <Text as="p" size="caption" className="text-black-00">
        This assistant is still new and improving. Your{" "}
        <button
          type="button"
          onClick={onGiveFeedback}
          className="cursor-pointer font-medium text-black-00 underline underline-offset-2"
        >
          feedback
        </button>{" "}
        helps us make it better!
      </Text>
    </div>
  );
}

export function WelcomeBubble() {
  return (
    <div className="flex max-w-[92%] items-start gap-2.5">
      <TridentAvatar size="sm" tone="filled" />
      <div className="text-bubble rounded-[16px_16px_16px_4px] bg-blue-10 px-4 py-3 text-black-00 sm:px-5 sm:py-3.5">
        Welcome to <strong>alpha.gov.bb.</strong> What would you like help with
        today?
      </div>
    </div>
  );
}

export function ThinkingIndicator({ label = "Thinking" }: { label?: string }) {
  return (
    // role="status" announces the working state to screen readers; the
    // gradient text is otherwise visual-only.
    <div role="status" className="flex items-center gap-2.5">
      <TridentAvatar size="sm" tone="filled" />
      {/* motion-reduce disables the shimmer under prefers-reduced-motion; the
          gradient text stays legible static. */}
      <span
        className="text-bubble animate-[shimmer_2.5s_linear_infinite] bg-clip-text font-medium text-transparent motion-reduce:animate-none"
        style={{
          backgroundImage:
            "linear-gradient(90deg, var(--color-blue-40) 0%, var(--color-teal-00) 35%, var(--color-teal-100) 50%, var(--color-teal-00) 65%, var(--color-blue-40) 100%)",
          backgroundSize: "200% 100%",
        }}
      >
        {label}
      </span>
    </div>
  );
}
