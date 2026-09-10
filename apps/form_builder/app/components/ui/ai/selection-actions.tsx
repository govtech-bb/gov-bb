import { Elevated } from "../surface";
import { Input } from "../input";
import { Button } from "../button";
import { useEffect, useRef, useState, type RefObject } from "react";
import { AiMagicIcon, ArrowUp01Icon, Cancel01Icon } from "hugeicons-react";
import type { AssistantRequest } from "./prompt-bar";

/** Uses the editor's native selection, including Markdown textarea ranges. */
export function SelectionActions({
  target,
  value,
  onAction,
}: {
  target: RefObject<HTMLDivElement | null>;
  value: string;
  onAction: (request: AssistantRequest) => void;
}) {
  const [selected, setSelected] = useState<{ text: string; source: string }>();
  const [instruction, setInstruction] = useState("");
  const toolbar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = target.current;
    if (!host) return;
    const update = () => {
      if (toolbar.current?.contains(document.activeElement)) return;
      const active = document.activeElement;
      let text = "";
      if (active instanceof HTMLTextAreaElement && host.contains(active))
        text = active.value.slice(active.selectionStart, active.selectionEnd);
      else {
        const selection = window.getSelection();
        const node = selection?.anchorNode;
        const anchor = (
          node instanceof Element ? node : node?.parentElement
        )?.closest('[contenteditable="true"]');
        if (
          selection &&
          anchor &&
          host.contains(anchor) &&
          anchor.contains(selection.focusNode)
        )
          text = selection.toString();
      }
      setSelected(
        text.trim() ? { text: text.slice(0, 4000), source: value } : undefined,
      );
    };
    document.addEventListener("selectionchange", update);
    host.addEventListener("select", update, true);
    return () => {
      document.removeEventListener("selectionchange", update);
      host.removeEventListener("select", update, true);
    };
  }, [target, value]);
  const run = (prompt: string) => {
    if (!selected || selected.source !== value) return;
    onAction({ id: crypto.randomUUID(), selection: selected.text, prompt });
    setSelected(undefined);
    setInstruction("");
  };
  if (!selected || selected.source !== value) return null;
  return (
    <Elevated
      offset={1}
      shadowLevel={2}
      render={<div />}
      ref={toolbar}
      className="sticky bottom-3 z-5 mx-auto my-2.5 inline-fit max-inline-[calc(100%-20px)] rounded-xl p-2 font-sans text-ui-default motion-safe:animate-ai-appear [&_form]:mt-1 [&_form]:flex [&_form]:items-center [&_form]:border-t [&_form]:border-ui-hairline [&_form]:pt-1"
      aria-label="AI actions for selected text"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          setSelected(undefined);
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-1">
        <AiMagicIcon size={15} aria-hidden="true" />
        <span className="flex-1 text-[11px] text-ui-default">
          {selected.text.length.toLocaleString()} characters selected
        </span>
        <Button
          type="button"
          aria-label="Dismiss selection actions"
          onClick={() => setSelected(undefined)}
          variant="ghost"
          size="sm"
        >
          <Cancel01Icon size={14} aria-hidden="true" />
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <Button
          type="button"
          onClick={() =>
            run(
              "Improve the selected text. Keep its meaning and preserve all facts, links and requirements.",
            )
          }
          variant="ghost"
          size="sm"
        >
          Improve
        </Button>
        <Button
          type="button"
          onClick={() =>
            run(
              "Shorten the selected text without losing important facts or requirements.",
            )
          }
          variant="ghost"
          size="sm"
        >
          Shorten
        </Button>
        <Button
          type="button"
          onClick={() =>
            run(
              "Fix spelling and grammar in the selected text. Preserve its meaning.",
            )
          }
          variant="ghost"
          size="sm"
        >
          Fix grammar
        </Button>
        <Button
          type="button"
          onClick={() =>
            run(
              "Explain the selected text and point out anything unclear. Do not propose edits yet.",
            )
          }
          variant="ghost"
          size="sm"
        >
          Explain
        </Button>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (instruction.trim()) run(instruction.trim());
        }}
      >
        <Input
          aria-label="Describe edits to selected text"
          placeholder="Describe an edit…"
          value={instruction}
          maxLength={2000}
          onChange={(event) => setInstruction(event.target.value)}
          className="w-full min-w-0"
        />
        <Button
          type="submit"
          aria-label="Use edit instruction"
          disabled={!instruction.trim()}
          variant="ghost"
          size="sm"
        >
          <ArrowUp01Icon size={15} aria-hidden="true" />
        </Button>
      </form>
    </Elevated>
  );
}
