import { Elevated } from "../surface";
import { Input } from "../input";
import { Button } from "../button";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import {
  AiMagicIcon,
  ArrowRight01Icon,
  ArrowUp01Icon,
  Cancel01Icon,
  BubbleChatQuestionIcon,
} from "hugeicons-react";
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
  const [expanded, setExpanded] = useState(false);
  const actionsId = useId();
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
    setExpanded(false);
  };
  if (!selected || selected.source !== value) return null;
  return (
    <Elevated
      offset={1}
      shadowLevel={2}
      render={<div />}
      ref={toolbar}
      className={`sticky bottom-3 z-5 mx-auto my-2.5 inline-fit max-inline-[calc(100%-20px)] p-1 font-sans text-ui-default motion-safe:animate-ai-appear ${expanded ? "rounded-2xl" : "rounded-full"}`}
      aria-label="AI actions for selected text"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          setSelected(undefined);
          setExpanded(false);
          setInstruction("");
        }
      }}
    >
      <div className="flex items-center gap-0.5">
        <span className="sr-only">
          {selected.text.length.toLocaleString()} characters selected
        </span>
        <Button
          type="button"
          onClick={() =>
            run(
              "Explain the selected text and point out anything unclear. Do not propose edits yet.",
            )
          }
          variant="ghost"
          size="sm"
          className="rounded-full px-2.5 text-[12px] font-normal"
        >
          <BubbleChatQuestionIcon size={14} aria-hidden="true" />
          Explain
        </Button>
        <Button
          type="button"
          onClick={() =>
            run(
              "Improve the selected text. Keep its meaning and preserve all facts, links and requirements.",
            )
          }
          variant="ghost"
          size="sm"
          className="rounded-full px-2.5 text-[12px] font-normal"
        >
          <AiMagicIcon size={14} aria-hidden="true" />
          Improve
        </Button>
        <span aria-hidden="true" className="mx-1 h-4 w-px bg-ui-hairline" />
        <Button
          type="button"
          aria-label={expanded ? "Show fewer actions" : "Show more actions"}
          aria-expanded={expanded}
          aria-controls={actionsId}
          onClick={() => setExpanded(!expanded)}
          variant="ghost"
          size="sm"
          shape="circle"
        >
          <ArrowRight01Icon
            size={14}
            aria-hidden="true"
            className={expanded ? "rotate-90" : undefined}
          />
        </Button>
        <Button
          type="button"
          aria-label="Dismiss selection actions"
          onClick={() => {
            setSelected(undefined);
            setExpanded(false);
            setInstruction("");
          }}
          variant="ghost"
          size="sm"
          shape="circle"
        >
          <Cancel01Icon size={14} aria-hidden="true" />
        </Button>
      </div>
      {expanded && (
        <div
          id={actionsId}
          className="grid gap-1 border-t border-ui-hairline p-1 pt-2 motion-safe:animate-ai-appear"
        >
          <div className="flex items-center gap-0.5">
            <Button
              type="button"
              onClick={() =>
                run(
                  "Shorten the selected text without losing important facts or requirements.",
                )
              }
              variant="ghost"
              size="sm"
              className="text-[12px] font-normal"
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
              className="text-[12px] font-normal"
            >
              Fix grammar
            </Button>
          </div>
          <form
            className="flex items-center gap-1"
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
              size="sm"
              className="w-full min-w-0"
            />
            <Button
              type="submit"
              aria-label="Use edit instruction"
              disabled={!instruction.trim()}
              variant="primary"
              size="sm"
              shape="circle"
            >
              <ArrowUp01Icon size={15} aria-hidden="true" />
            </Button>
          </form>
        </div>
      )}
    </Elevated>
  );
}
