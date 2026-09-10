import { Elevated } from "../surface";
import { Popover } from "../popover";
import { Select } from "../select";
import { InputArea } from "../input/input-area";
import { Button } from "../button";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  Attachment02Icon,
  ArrowUp01Icon,
  StopIcon,
  Cancel01Icon,
} from "hugeicons-react";
import type { AiContext } from "@govtech-bb/form-builder";
import s from "./components.module.css";

export type AssistantRequest = {
  id: string;
  prompt: string;
  selection: string;
};

export function PromptBar({
  attachments,
  onAttachmentError,
  value,
  onChange,
  mode,
  onModeChange,
  busy,
  pending,
  readOnly,
  blocked,
  kind,
  selection,
  documentName,
  requestId,
  onClearSelection,
  onSend,
  onStop,
  onAttach,
}: {
  attachments?: ReactNode;
  onAttachmentError: (message: string) => void;
  value: string;
  onChange: (value: string) => void;
  mode: AiContext["mode"];
  onModeChange: (mode: AiContext["mode"]) => void;
  busy: boolean;
  pending: boolean;
  readOnly?: boolean;
  blocked?: boolean;
  kind: AiContext["kind"];
  selection?: string;
  documentName?: string;
  requestId?: string;
  onClearSelection: () => void;
  onSend: () => void;
  onStop: () => void;
  onAttach: (file: File) => void;
}) {
  const id = useId();
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const match = /(^|\s)([@/])([\w-]*)$/.exec(value);
  const token =
    !dismissed && match
      ? {
          kind: match[2],
          query: match[3].toLowerCase(),
          start: match.index + match[1].length,
        }
      : null;
  const choices =
    token?.kind === "@"
      ? [
          {
            key: "draft",
            name: "Current draft",
            description:
              kind === "form"
                ? "Form structure and fields"
                : "Page content and settings",
            text: "the current draft",
          },
          ...(selection
            ? [
                {
                  key: "selection",
                  name: "Selection",
                  description: "The text or field you selected",
                  text: "the selected text or field",
                },
              ]
            : []),
          ...(documentName
            ? [
                {
                  key: "document",
                  name: documentName,
                  description: "Attached document",
                  text: `the attached document “${documentName}”`,
                },
              ]
            : []),
        ]
      : [
          {
            key: "review",
            name: "/review",
            description: "Check clarity and completeness",
            text: "Review this draft for clarity and completeness.",
          },
          {
            key: "simplify",
            name: "/simplify",
            description: "Use plain language",
            text: "Make the wording easier to understand, preserving all facts and requirements.",
          },
          {
            key: "structure",
            name: "/structure",
            description: "Improve the reading order",
            text:
              kind === "form"
                ? "Suggest a clearer order for the form steps and fields."
                : "Improve this page’s structure and headings.",
          },
          {
            key: "summarize",
            name: "/summarize",
            description: "Summarize the current draft",
            text: "Summarize the current draft and identify any missing information.",
          },
        ];
  const rows = choices.filter((row) =>
    `${row.name} ${row.description}`.toLowerCase().includes(token?.query ?? ""),
  );
  const current = Math.min(active, Math.max(0, rows.length - 1));
  const menuOpen = !!token && !pending;
  useEffect(() => {
    if (requestId) input.current?.focus();
  }, [requestId]);
  const change = (text: string) => {
    onChange(text);
    setActive(0);
    setDismissed(false);
  };
  const pick = (row: (typeof choices)[number]) => {
    onChange(
      `${value.slice(0, token?.start ?? value.length)}${row.text} `.slice(
        0,
        16000,
      ),
    );
    setDismissed(true);
    input.current?.focus();
  };
  const attachFiles = (files: FileList) => {
    if (busy || pending) {
      onAttachmentError(
        "Wait for the current response before attaching a document.",
      );
      return;
    }
    if (files.length !== 1) {
      onAttachmentError("Attach one document at a time.");
      return;
    }
    onAttach(files[0]);
  };
  return (
    <Popover
      open={menuOpen}
      onOpenChange={(open) => {
        if (!open) setDismissed(true);
      }}
    >
      <div
        className={s.promptBar}
        data-dragging={dragging}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("Files")) {
            event.preventDefault();
            event.dataTransfer.dropEffect = busy || pending ? "none" : "copy";
            if (!busy && !pending) setDragging(true);
          }
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node))
            setDragging(false);
        }}
        onDrop={(event) => {
          if (event.dataTransfer.types.includes("Files")) {
            event.preventDefault();
            setDragging(false);
            attachFiles(event.dataTransfer.files);
          }
        }}
      >
        <Popover.Content
          anchor={input}
          side="top"
          align="start"
          initialFocus={false}
          finalFocus={false}
          id={id}
          className="w-(--anchor-width) max-h-[min(320px,40dvh)] p-1.5"
          role="listbox"
          aria-label={
            token?.kind === "@" ? "Draft references" : "Assistant commands"
          }
        >
          {rows.map((row, i) => (
            <Button
              key={row.key}
              type="button"
              role="option"
              className="grid h-auto w-full justify-stretch gap-1 text-left aria-selected:bg-ui-tint"
              aria-selected={i === current}
              id={`${id}-${i}`}
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              onPointerMove={() => setActive(i)}
              onClick={() => pick(row)}
              variant="ghost"
              size="sm"
            >
              <span>{row.name}</span>
              <small>{row.description}</small>
            </Button>
          ))}
          {rows.length === 0 && (
            <p>
              No matching {token?.kind === "@" ? "references" : "commands"}.
            </p>
          )}
          <div className={s.menuHint}>
            ↑ ↓ to choose · Enter to insert · Esc to close
          </div>
        </Popover.Content>
        <Elevated
          offset={1}
          shadowLevel={2}
          render={<form />}
          className={s.prompt}
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy && !pending && !blocked && value.trim()) onSend();
          }}
        >
          {attachments && (
            <div className={s.composerAttachments}>{attachments}</div>
          )}
          {dragging && (
            <div className={s.dropHint}>Drop a PDF or image here</div>
          )}
          {selection && (
            <div className={s.selectionChip}>
              <span title={selection}>Selection: {selection}</span>
              <Button
                type="button"
                aria-label="Clear selected context"
                disabled={busy || pending}
                onClick={onClearSelection}
                variant="ghost"
                size="sm"
              >
                <Cancel01Icon size={13} aria-hidden="true" />
              </Button>
            </div>
          )}
          <InputArea
            ref={input}
            aria-label="Message the assistant"
            placeholder={
              mode === "ask"
                ? "Ask about this draft…"
                : "Describe what you want to change…"
            }
            value={value}
            maxLength={16000}
            rows={3}
            disabled={pending}
            onPaste={(event) => {
              if (event.clipboardData.files.length) {
                event.preventDefault();
                attachFiles(event.clipboardData.files);
              }
            }}
            onChange={(event) => change(event.target.value)}
            aria-autocomplete="list"
            aria-controls={menuOpen ? id : undefined}
            aria-haspopup="listbox"
            aria-activedescendant={
              menuOpen && rows.length ? `${id}-${current}` : undefined
            }
            onBlur={(event) => {
              if (
                !event.currentTarget.parentElement?.parentElement?.contains(
                  event.relatedTarget as Node,
                )
              )
                setDismissed(true);
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Escape" && menuOpen) {
                event.preventDefault();
                event.stopPropagation();
                setDismissed(true);
                return;
              }
              if (
                menuOpen &&
                rows.length &&
                (event.key === "ArrowDown" || event.key === "ArrowUp")
              ) {
                event.preventDefault();
                setActive(
                  (current +
                    (event.key === "ArrowDown" ? 1 : rows.length - 1)) %
                    rows.length,
                );
                return;
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (menuOpen && rows.length) pick(rows[current]);
                else if (!busy && !pending && !blocked && value.trim())
                  onSend();
              }
            }}
            className="min-h-20 max-h-44 w-full resize-y [field-sizing:content]"
          />
          <div className={s.promptControls}>
            <Button
              variant="ghost"
              size="sm"
              shape="square"
              aria-label="Attach a document"
              title="Attach PDF (20 MB), PNG or JPEG (10 MB)"
              disabled={busy || pending}
              onClick={() => fileInput.current?.click()}
            >
              <Attachment02Icon size={18} aria-hidden="true" />
            </Button>
            <input
              ref={fileInput}
              hidden
              aria-label="Choose attachment"
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              disabled={busy || pending}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) onAttach(file);
              }}
            />
            <div>
              <Select
                aria-label={"Assistant mode"}
                value={mode}
                disabled={busy || pending || readOnly}
                onValueChange={(nextValue) => {
                  if (nextValue === null) return;
                  onModeChange(nextValue as AiContext["mode"]);
                }}
                items={[
                  { value: "edit", label: "Review edits" },
                  { value: "ask", label: "Ask" },
                ]}
              />
            </div>
            <span className={s.promptHint}>@ references · / commands</span>
            {busy ? (
              <Button
                type="button"
                aria-label="Stop response"
                onClick={onStop}
                variant="primary"
                size="sm"
                shape="circle"
                className="ml-auto shrink-0"
              >
                <StopIcon size={15} aria-hidden="true" />
              </Button>
            ) : (
              <Button
                type="submit"
                aria-label="Send message"
                disabled={!value.trim() || pending || blocked}
                variant="primary"
                size="sm"
                shape="circle"
                className="ml-auto shrink-0"
              >
                <ArrowUp01Icon size={18} aria-hidden="true" />
              </Button>
            )}
          </div>
        </Elevated>
      </div>
    </Popover>
  );
}
