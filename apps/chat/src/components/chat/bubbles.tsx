import { Button, cn, linkVariants, Text } from "@govtech-bb/react";
import { TridentAvatar } from "#/components/trident-avatar";

// The chat's message bubbles and the fixed notices around them. User and
// assistant bubbles are the two sides of the conversation (right-aligned vs.
// next to the bot avatar); Welcome, Notice and Error are standing rows the
// transcript opens and closes with.
export function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end">
      <div className="text-bubble max-w-[75%] rounded-[16px_16px_4px_16px] bg-blue-100 px-4 py-2.5 text-white-00">
        {children}
      </div>
    </div>
  );
}

export function AssistantBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex max-w-[92%] items-start gap-2.5">
      <TridentAvatar size="sm" tone="filled" />
      <div className="text-bubble rounded-[16px_16px_16px_4px] bg-blue-10 px-4 py-3 text-black-00 sm:px-5 sm:py-3.5">
        {children}
      </div>
    </div>
  );
}

export function ErrorBubble({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex max-w-[92%] items-start gap-2.5">
      <TridentAvatar size="sm" tone="filled" />
      <div className="flex min-w-0 flex-1 flex-col space-y-xs rounded-[16px_16px_16px_4px] bg-red-10 px-4 py-3 sm:px-5 sm:py-3.5">
        <p className="text-bubble font-semibold text-red-00">
          Something went wrong
        </p>
        <p className="text-bubble text-pretty text-black-00">
          We couldn&rsquo;t get a response. Please check your connection and try
          again.
        </p>
        <Button className="self-start" onClick={onRetry} type="button">
          Try again
        </Button>
      </div>
    </div>
  );
}

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
          className={cn(linkVariants({ variant: "secondary" }))}
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
    <AssistantBubble>
      Welcome to <strong>alpha.gov.bb.</strong> What would you like help with
      today?
    </AssistantBubble>
  );
}
