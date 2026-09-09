import { useEffect, useRef, useState, type RefObject } from "react";
import { AiMagicIcon, ArrowUp01Icon, Cancel01Icon } from "hugeicons-react";
import type { AssistantRequest } from "./prompt-bar";
import s from "./components.module.css";

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
    <div
      ref={toolbar}
      className={s.selectionActions}
      aria-label="AI actions for selected text"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          setSelected(undefined);
        }
      }}
    >
      <div className={s.selectionActionsRow}>
        <AiMagicIcon size={15} aria-hidden="true" />
        <span className={s.selectionCount}>
          {selected.text.length.toLocaleString()} characters selected
        </span>
        <button
          type="button"
          aria-label="Dismiss selection actions"
          onClick={() => setSelected(undefined)}
        >
          <Cancel01Icon size={14} aria-hidden="true" />
        </button>
      </div>
      <div className={s.selectionActionsRow}>
        <button
          type="button"
          onClick={() =>
            run(
              "Improve the selected text. Keep its meaning and preserve all facts, links and requirements.",
            )
          }
        >
          Improve
        </button>
        <button
          type="button"
          onClick={() =>
            run(
              "Shorten the selected text without losing important facts or requirements.",
            )
          }
        >
          Shorten
        </button>
        <button
          type="button"
          onClick={() =>
            run(
              "Fix spelling and grammar in the selected text. Preserve its meaning.",
            )
          }
        >
          Fix grammar
        </button>
        <button
          type="button"
          onClick={() =>
            run(
              "Explain the selected text and point out anything unclear. Do not propose edits yet.",
            )
          }
        >
          Explain
        </button>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (instruction.trim()) run(instruction.trim());
        }}
      >
        <input
          aria-label="Describe edits to selected text"
          placeholder="Describe an edit…"
          value={instruction}
          maxLength={2000}
          onChange={(event) => setInstruction(event.target.value)}
        />
        <button
          type="submit"
          aria-label="Use edit instruction"
          disabled={!instruction.trim()}
        >
          <ArrowUp01Icon size={15} aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
