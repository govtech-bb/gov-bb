import { cn } from "@govtech-bb/react";
import { STARTER_PROMPTS } from "#/lib/chat/starter-prompts";

interface StarterCardsProps {
  onPick: (prompt: string) => void;
}

export function StarterCards({ onPick }: StarterCardsProps) {
  return (
    <div
      aria-label="Suggested questions"
      className="grid grid-cols-1 gap-xs sm:grid-cols-2"
      role="group"
    >
      {STARTER_PROMPTS.map(({ slug, prompt }) => (
        <button
          key={slug}
          aria-label={prompt}
          className={cn(
            "text-bubble min-h-[44px] rounded-[12px]",
            "border border-mid-grey-00 bg-white-00 px-4 py-3 text-left text-black-00",
            "transition-colors hover:border-black-00",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-00",
          )}
          onClick={() => onPick(prompt)}
          type="button"
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}
