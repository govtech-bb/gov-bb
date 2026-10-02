import { Elevated } from "../surface";
import { Popover } from "../popover";
import { PermissionMenu } from "./permission-menu";
import type { Permission } from "./history";
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
  permission,
  onPermissionChange,
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
  permission: Permission;
  onPermissionChange: (permission: Permission) => void;
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
        className="group/prompt-bar relative min-inline-0"
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
              className="grid h-auto min-h-9 w-full justify-stretch gap-0.5 px-2.5 py-2 text-left text-[12px] aria-selected:bg-ui-tint"
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
              <small className="text-[11px] font-normal text-ui-subtle">
                {row.description}
              </small>
            </Button>
          ))}
          {rows.length === 0 && (
            <p className="px-2.5 py-2 text-[12px] text-ui-subtle">
              No matching {token?.kind === "@" ? "references" : "commands"}.
            </p>
          )}
          <div className="mt-1 border-t border-ui-hairline px-2.5 py-1.5 text-[11px] text-ui-subtle">
            ↑ ↓ to choose · Enter to insert · Esc to close
          </div>
        </Popover.Content>
        <Elevated
          offset={1}
          shadowLevel={2}
          render={<form />}
          className="overflow-hidden rounded-2xl p-3 outline-offset-2 has-[textarea:focus-visible]:outline-2 has-[textarea:focus-visible]:outline-ui-focus forced-colors:has-[textarea:focus-visible]:outline-[Highlight] group-data-[dragging=true]/prompt-bar:outline-2 group-data-[dragging=true]/prompt-bar:outline-ui-focus"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy && !pending && !blocked && value.trim()) onSend();
          }}
        >
          {attachments && <div className="px-1 pb-2">{attachments}</div>}
          {dragging && (
            <div className="mb-2 rounded-lg bg-ui-tint px-3 py-2 text-[12px]">
              Drop a PDF or image here
            </div>
          )}
          {selection && (
            <div className="mb-2 flex items-center gap-1.5 rounded-lg bg-ui-tint py-0.5 ps-2.5 pe-0.5 text-[11px] [&>span]:min-inline-0 [&>span]:flex-1 [&>span]:truncate">
              <span title={selection}>Selection: {selection}</span>
              <Button
                type="button"
                aria-label="Clear selected context"
                disabled={busy || pending}
                onClick={onClearSelection}
                variant="ghost"
                size="sm"
                shape="square"
              >
                <Cancel01Icon size={13} aria-hidden="true" />
              </Button>
            </div>
          )}
          <InputArea
            ref={input}
            aria-label="Message the assistant"
            placeholder={
              readOnly ? "Ask a question…" : "Describe what you want to change…"
            }
            value={value}
            maxLength={16000}
            autoResize
            minRows={2}
            maxRows={8}
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
            className="min-h-17 max-h-44 w-full rounded-none bg-transparent! px-1 py-2 text-[14px] leading-5 ring-0! focus-visible:outline-none!"
          />
          <div className="mt-2 flex items-center gap-1.5">
            <Button
              type="button"
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
              <PermissionMenu
                value={readOnly ? "ask" : permission}
                disabled={busy || pending || readOnly}
                onValueChange={onPermissionChange}
              />
            </div>
            {busy ? (
              <Button
                type="button"
                aria-label="Stop response"
                onClick={onStop}
                variant="primary"
                size="sm"
                shape="circle"
                className="ms-auto shrink-0"
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
                className="ms-auto shrink-0"
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
