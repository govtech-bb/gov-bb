import { Button, TextArea } from "@govtech-bb/react";
import { useEffect, useRef } from "react";

// The message input pinned to the bottom of the chat. Enter sends, Shift+Enter
// adds a newline; while a reply streams the Send button becomes Stop. Width is
// capped to match the message bubbles above it.
export function Composer({
  input,
  onChange,
  onSubmit,
  onStop,
  streaming,
  placeholder = "Ask a question...",
}: {
  input: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  streaming: boolean;
  placeholder?: string;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Return focus to the box when a turn finishes (streaming → false), so the
  // next message can be typed without clicking back in.
  useEffect(() => {
    if (!streaming) inputRef.current?.focus();
  }, [streaming]);

  const hasInput = input.trim().length > 0;

  return (
    <footer className="px-s pb-s">
      <form
        className="mx-auto flex max-w-2xl flex-col items-center gap-xs"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <div className="flex w-full items-end gap-xs">
          <TextArea
            aria-label="Ask the government assistant"
            className="composer-field flex-1 text-black-00"
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter drops to a new line.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!streaming) onSubmit();
              }
            }}
            placeholder={placeholder}
            ref={inputRef}
            rows={1}
            value={input}
          />
          {streaming ? (
            <Button
              aria-label="Stop generating the response"
              onClick={onStop}
              type="button"
            >
              Stop
            </Button>
          ) : (
            <Button disabled={!hasInput} type="submit">
              Send
            </Button>
          )}
        </div>
        <p className="text-disclaimer text-center text-mid-grey-00">
          Responses are based on official Government of Barbados information
        </p>
      </form>
    </footer>
  );
}
