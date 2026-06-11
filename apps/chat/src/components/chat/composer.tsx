import { Button, TextArea } from "@govtech-bb/react";
import { useEffect, useRef } from "react";

export function Composer({
  input,
  onChange,
  onSubmit,
  onStop,
  streaming,
}: {
  input: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  streaming: boolean;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
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
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!streaming) onSubmit();
              }
            }}
            placeholder="Ask a question..."
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
