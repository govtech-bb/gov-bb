import { ScrollArea } from "../scroll-area";
import { Collapsible } from "../collapsible";
import { Banner } from "../banner";
import { Dialog } from "../dialog";
import { Select } from "../select";
import { Button } from "../button";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useLayoutEffect,
  type CSSProperties,
} from "react";
import { useChat } from "@tanstack/ai-react";
import { flushSync } from "react-dom";
import { toolDefinition } from "@tanstack/ai/client";
import { Markdown, type MarkdownComponents } from "@tanstack/markdown/react";
import { streamingMarkdownExtension } from "@tanstack/markdown/extensions/streaming";
import {
  AiMagicIcon,
  ArrowRight01Icon,
  Add01Icon,
  ArrowExpand01Icon,
  ArrowShrink01Icon,
  Cancel01Icon,
  ArrowDown01Icon,
} from "hugeicons-react";
import {
  proposeFormTool,
  proposeContentTool,
  askQuestionsTool,
  aiUploadSchema,
  type AiAnswers,
  redactAiData,
  type AiContext,
} from "@govtech-bb/form-builder";
import { ReviewCard, type PreparedChange, type Proposal } from "./review";
import {
  conversationPersistence,
  deleteConversation,
  historyKey,
  readConversations,
  writeConversations,
  type Conversation,
} from "./history";
import {
  streamChat,
  uploadDocument,
  readDocument,
  type Attachment,
} from "./transport";
import { AttachmentCard } from "./attachments";
import {
  attachmentMetadata,
  attachmentPart,
  messageAttachments,
  type AttachmentMetadata,
} from "./attachment-data";
import { LoadingState } from "./loading-state";
import { ThinkingState } from "./thinking-state";
import { ToolChips, type ToolStep } from "./tool-chips";
import { TaskRows } from "./task-rows";
import { ApprovalCard } from "./approval-card";
import { PromptBar, type AssistantRequest } from "./prompt-bar";
import { MarkdownCodeBlock } from "./code-block";

const toolLabels: Record<string, string> = {
  lookup_component: "Looking up component",
  validate_form: "Checking form",
  apply_form_draft: "Draft proposal",
  apply_content_patch: "Page proposal",
  ask_questions: "Clarifying questions",
};
const extensions = [streamingMarkdownExtension()];
const markdownComponents: MarkdownComponents = {
  pre: MarkdownCodeBlock,
  a: ({ href, children }) => (
    <a
      href={
        href &&
        /^(https?:|mailto:|tel:|\/)/i.test(href) &&
        !href.startsWith("//")
          ? href
          : undefined
      }
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  img: ({ alt }) => <span>{alt ? "Image: " + alt : "Image omitted"}</span>,
};

export type AssistantProps = {
  user: string;
  documentId: string;
  kind: AiContext["kind"];
  document: Record<string, unknown>;
  revisionSource: unknown;
  selection?: string;
  request?: AssistantRequest;
  onRequestHandled?: () => void;
  readOnly?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  prepare: (proposal: Proposal) => Promise<PreparedChange>;
};

export function Assistant(props: AssistantProps) {
  const [internalOpen, setInternalOpen] = useState(true);
  const open = props.open ?? internalOpen;
  const setOpen = props.onOpenChange ?? setInternalOpen;
  const [expanded, setExpanded] = useState(false);
  const [width, setWidth] = useState(450);
  const [compact, setCompact] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [thread, setThread] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [dock, setDock] = useState<HTMLDivElement | null>(null);
  const scope = historyKey(props.user, props.kind, props.documentId);
  const source = JSON.stringify(props.revisionSource);
  const revision = useMemo(
    () => crypto.randomUUID(),
    [source, props.documentId],
  );
  const [mode, setMode] = useState<"ask" | "edit">("edit");
  const context: AiContext = {
    kind: props.kind,
    documentId: props.documentId,
    document: redactAiData(props.document) as Record<string, unknown>,
    revision,
    mode: props.readOnly ? "ask" : mode,
    selection: props.selection,
    attachments: [],
  };
  const current = useRef({
    context,
    prepare: props.prepare,
    readOnly: props.readOnly,
    open,
  });
  useLayoutEffect(() => {
    current.current = {
      context,
      prepare: props.prepare,
      readOnly: props.readOnly,
      open,
    };
  });

  useEffect(() => {
    const query = matchMedia("(max-width: 1023px)");
    const update = () => setCompact(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    try {
      const saved = readConversations(scope);
      const items = saved.length
        ? saved
        : [
            {
              id: scope + ":" + crypto.randomUUID(),
              title: "New conversation",
            },
          ];
      setConversations(items);
      setThread(items[0].id);
    } catch {
      setStorageError(true);
      const item = {
        id: scope + ":" + crypto.randomUUID(),
        title: "New conversation",
      };
      setConversations([item]);
      setThread(item.id);
    }
  }, [scope]);
  const saveIndex = (items: Conversation[]) => {
    setConversations(items);
    try {
      writeConversations(scope, items);
    } catch {
      setStorageError(true);
    }
  };
  const newConversation = () => {
    const item = {
      id: scope + ":" + crypto.randomUUID(),
      title: "New conversation",
    };
    saveIndex([item, ...conversations]);
    setThread(item.id);
  };
  const rename = (text: string) => {
    if (
      conversations.find((item) => item.id === thread)?.title !==
      "New conversation"
    )
      return;
    saveIndex(
      conversations.map((item) =>
        item.id === thread ? { ...item, title: text.slice(0, 60) } : item,
      ),
    );
  };
  const remove = async () => {
    const previous = thread;
    const remaining = conversations.filter((item) => item.id !== previous);
    const items = remaining.length
      ? remaining
      : [{ id: scope + ":" + crypto.randomUUID(), title: "New conversation" }];
    setThread(items[0].id);
    saveIndex(items);
    try {
      await deleteConversation(previous);
    } catch {
      setStorageError(true);
    }
  };
  return (
    <>
      {!open && !props.onOpenChange && (
        <Button
          className="m-3 self-start"
          type="button"
          onClick={() => setOpen(true)}
          variant="ghost"
          size="sm"
        >
          <AiMagicIcon size={17} /> Assistant
        </Button>
      )}

      <div
        ref={setDock}
        className="relative min-inline-0 flex-[0_0_var(--ai-width,450px)] data-[open=false]:hidden data-[expanded=true]:basis-[min(720px,55vw)] max-lg:basis-0"
        data-open={open}
        data-expanded={expanded}
        style={{ "--ai-width": width + "px" } as CSSProperties}
      >
        <Dialog.Root
          open={open && dock !== null}
          onOpenChange={setOpen}
          modal={compact}
          disablePointerDismissal
        >
          <Dialog
            container={dock}
            keepMounted
            backdrop={compact}
            initialFocus={compact ? undefined : false}
            className="absolute inset-0 m-0 flex h-full max-h-none w-full max-w-none translate-none flex-col overflow-hidden rounded-none border-0 border-s border-ui-hairline p-0 font-sans text-[14px] text-ui-default sm:w-full max-lg:fixed max-lg:h-dvh max-lg:w-screen max-lg:border-0 [:where(&)_p]:mt-0 [:where(&)_p]:mb-3 [:where(&)_p]:leading-[1.6]"
            aria-label="Builder assistant"
            showCloseButton={false}
          >
            <div
              className="absolute inset-y-0 -start-1 z-2 inline-2 cursor-col-resize touch-none focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ui-focus max-lg:hidden"
              role="separator"
              tabIndex={0}
              aria-label="Assistant width"
              aria-orientation="vertical"
              aria-valuemin={360}
              aria-valuemax={720}
              aria-valuenow={width}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                  event.preventDefault();
                  setWidth((value) =>
                    Math.max(
                      360,
                      Math.min(
                        720,
                        value + (event.key === "ArrowLeft" ? 20 : -20),
                      ),
                    ),
                  );
                }
              }}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  setWidth(
                    Math.max(
                      360,
                      Math.min(720, window.innerWidth - event.clientX),
                    ),
                  );
              }}
            />
            <header className="flex min-block-14.5 shrink-0 items-center gap-1 border-b border-ui-hairline bg-ui-base px-3.5">
              <div className="min-inline-0 flex-1">
                <Select
                  aria-label={"Conversation"}
                  value={thread}
                  onValueChange={(nextValue) => {
                    if (nextValue === null) return;
                    const id = nextValue;
                    setThread(id);
                    saveIndex([
                      ...conversations.filter((item) => item.id === id),
                      ...conversations.filter((item) => item.id !== id),
                    ]);
                  }}
                  items={[
                    ...conversations.map((item) => ({
                      value: item.id,
                      label: item.title,
                    })),
                  ]}
                />
              </div>
              <Button
                type="button"
                aria-label="New conversation"
                title="New conversation"
                disabled={conversations.length >= 50}
                onClick={newConversation}
                variant="ghost"
                size="sm"
              >
                <Add01Icon size={16} aria-hidden="true" />
              </Button>
              <Button
                type="button"
                className="max-lg:hidden"
                aria-label={expanded ? "Narrow assistant" : "Expand assistant"}
                title={expanded ? "Narrow assistant" : "Expand assistant"}
                onClick={() => setExpanded((value) => !value)}
                variant="ghost"
                size="sm"
              >
                {expanded ? (
                  <ArrowShrink01Icon size={16} aria-hidden="true" />
                ) : (
                  <ArrowExpand01Icon size={16} aria-hidden="true" />
                )}
              </Button>
              <Button
                type="button"
                aria-label="Close assistant"
                title="Close assistant"
                onClick={() => setOpen(false)}
                variant="ghost"
                size="sm"
              >
                <Cancel01Icon size={16} aria-hidden="true" />
              </Button>
            </header>
            {thread && (
              <ChatSession
                key={thread}
                thread={thread}
                current={current}
                context={context}
                request={props.request}
                onRequestHandled={props.onRequestHandled}
                readOnly={props.readOnly}
                open={open}
                mode={context.mode}
                setMode={setMode}
                storageError={storageError}
                onStorageError={() => setStorageError(true)}
                onFirstMessage={rename}
                onDelete={() => void remove()}
              />
            )}
          </Dialog>
        </Dialog.Root>
      </div>
    </>
  );
}

type CurrentEditor = React.RefObject<{
  context: AiContext;
  prepare: AssistantProps["prepare"];
  readOnly?: boolean;
  open: boolean;
}>;

function ChatSession({
  thread,
  current,
  context,
  request,
  onRequestHandled,
  readOnly,
  open,
  mode,
  setMode,
  storageError,
  onStorageError,
  onFirstMessage,
  onDelete,
}: {
  thread: string;
  current: CurrentEditor;
  context: AiContext;
  request?: AssistantRequest;
  onRequestHandled?: () => void;
  readOnly?: boolean;
  open: boolean;
  mode: "ask" | "edit";
  setMode: (mode: "ask" | "edit") => void;
  storageError: boolean;
  onStorageError: () => void;
  onFirstMessage: (text: string) => void;
  onDelete: () => void;
}) {
  const [input, setInput] = useState("");
  const [selectedText, setSelectedText] = useState<string | null>();
  const [requestId, setRequestId] = useState<string>();
  useEffect(() => {
    if (!request) return;
    setInput(request.prompt);
    setSelectedText(request.selection);
    setRequestId(request.id);
    onRequestHandled?.();
  }, [request, onRequestHandled]);
  const selection =
    selectedText === undefined
      ? context.selection
      : (selectedText ?? undefined);
  const [attachment, setAttachment] = useState<Attachment>();
  const [uploading, setUploading] = useState(false);
  const [localFiles, setLocalFiles] = useState<Record<string, File>>({});
  const [localFile, setLocalFile] = useState<File>();
  const [documentFailure, setDocumentFailure] = useState("");
  const [questionsStopped, setQuestionsStopped] = useState(false);
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState("");
  const upload = useRef<AbortController | null>(null);
  const pendingFile = useRef<File | undefined>(undefined);
  const feed = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const [away, setAway] = useState(false);
  const bindings = useRef(new Map<string, string>());
  const approved = useRef(new Map<string, PreparedChange>());
  const runRevision = useRef("");
  const active = useRef(true);
  const latest = useRef({ attachment, onStorageError, selection });
  useLayoutEffect(() => {
    latest.current = { attachment, onStorageError, selection };
  }, [attachment, onStorageError, selection]);
  const persistence = useMemo(
    () =>
      conversationPersistence(
        () => latest.current.onStorageError(),
        () =>
          setNotice(
            "This response was interrupted. Retry to use the current draft.",
          ),
      ),
    [],
  );
  const execute = useCallback(
    (_input: Proposal, toolContext?: { toolCallId?: string }) => {
      const id = toolContext?.toolCallId ?? "";
      const change = approved.current.get(id);
      approved.current.delete(id);
      if (
        !active.current ||
        !current.current.open ||
        !change ||
        current.current.readOnly ||
        bindings.current.get(id) !== current.current.context.revision
      )
        return {
          applied: false,
          message:
            "The draft changed or approval is missing. Request a fresh proposal.",
        };
      try {
        flushSync(() => change.apply());
        return {
          applied: true,
          message:
            "Applied to the local draft. It has not been saved or deployed.",
        };
      } catch (error) {
        return {
          applied: false,
          message:
            error instanceof Error
              ? error.message
              : "Could not apply the change.",
        };
      }
    },
    [current],
  );
  const tools = useMemo(
    () =>
      [
        toolDefinition(proposeFormTool).client(execute),
        toolDefinition(proposeContentTool).client(execute),
        toolDefinition(askQuestionsTool).client(),
      ] as const,
    [execute],
  );
  const chat = useChat<typeof tools>({
    threadId: thread,
    tools,
    persistence,
    fetcher: (request, { signal }) => {
      const context = current.current.context;
      runRevision.current = context.revision;
      setQuestionsStopped(false);
      const file = latest.current.attachment;
      return streamChat(
        request,
        {
          ...context,
          selection: latest.current.selection,
          attachments:
            file?.status === "ready"
              ? [{ name: file.name, reference: file.reference }]
              : [],
        },
        signal,
      );
    },
    onChunk(chunk) {
      if (
        chunk.type === "TOOL_CALL_START" &&
        !bindings.current.has(chunk.toolCallId)
      )
        bindings.current.set(chunk.toolCallId, runRevision.current);
    },
  });
  const stop = chat.stop;
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      stop();
      upload.current?.abort();
    };
  }, [stop]);
  useEffect(() => {
    if (!open) {
      approved.current.clear();
      setQuestionsStopped(true);
      stop();
      upload.current?.abort();
    }
  }, [open, stop]);
  useEffect(() => {
    if (follow.current && feed.current)
      feed.current.scrollTop = feed.current.scrollHeight;
  }, [chat.messages, chat.interrupts, uploading]);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(thread + ":document");
      if (saved) setAttachment(JSON.parse(saved));
    } catch {
      latest.current.onStorageError();
    }
  }, [thread]);
  const updateAttachment = (value: Attachment | undefined) => {
    setAttachment(value);
    try {
      if (value)
        localStorage.setItem(thread + ":document", JSON.stringify(value));
      else localStorage.removeItem(thread + ":document");
    } catch {
      onStorageError();
    }
  };
  const extract = async (file?: File) => {
    if (file) {
      const checked = aiUploadSchema.safeParse({
        name: file.name,
        type: file.type,
        size: file.size,
      });
      if (!checked.success) {
        setNotice(
          "Use a PDF up to 20 MB or a PNG/JPEG up to 10 MB, with a matching file extension.",
        );
        return;
      }
      pendingFile.current = file;
      setLocalFile(file);
      updateAttachment(undefined);
    }
    const controller = new AbortController();
    upload.current = controller;
    setUploading(true);
    setDocumentFailure("");
    setNotice("");
    try {
      const value = file
        ? await uploadDocument(file, controller.signal)
        : attachment;
      if (!value) return;
      if (file && value.id)
        setLocalFiles((current) => ({ ...current, [value.id!]: file }));
      pendingFile.current = undefined;
      updateAttachment(value);
      await readDocument(value, controller.signal, updateAttachment);
    } catch (error) {
      setDocumentFailure(
        controller.signal.aborted
          ? "Paused. Retry to continue reading this document."
          : error instanceof Error
            ? error.message
            : "The document could not be read.",
      );
      setNotice(
        controller.signal.aborted
          ? "Stopped. Retry to check the same document."
          : error instanceof Error
            ? error.message
            : "The document could not be read.",
      );
    } finally {
      setUploading(false);
    }
  };
  const busy = chat.isLoading || chat.resuming || uploading;
  const lastUserIndex = chat.messages
    .map((message) => message.role)
    .lastIndexOf("user");
  const unanswered = chat.messages
    .slice(lastUserIndex + 1)
    .flatMap((message) =>
      message.parts.filter(
        (part) =>
          part.type === "tool-call" &&
          part.name === "ask_questions" &&
          part.state === "input-complete" &&
          part.output === undefined,
      ),
    );
  const pending =
    chat.interrupts.length > 0 || (!questionsStopped && unanswered.length > 0);
  const answered = useRef(new Set<string>());
  const answerQuestions = async (id: string, result: AiAnswers) => {
    if (
      !active.current ||
      !current.current.open ||
      questionsStopped ||
      answered.current.has(id)
    )
      return;
    if (
      result.status === "answered" &&
      bindings.current.get(id) !== current.current.context.revision
    )
      throw new Error("The draft changed. Skip these questions and ask again.");
    answered.current.add(id);
    try {
      await chat.addToolResult({
        toolCallId: id,
        tool: "ask_questions",
        output: askQuestionsTool.outputSchema.parse(result),
      });
    } catch (error) {
      answered.current.delete(id);
      throw error;
    }
  };
  const send = async (text: string) => {
    if (
      !text.trim() ||
      busy ||
      pending ||
      !!pendingFile.current ||
      (attachment && attachment.status !== "ready")
    )
      return;
    setInput("");
    setNotice("");
    follow.current = true;
    setAway(false);
    onFirstMessage(text.trim());
    const attached =
      attachment?.status === "ready" && attachment.source
        ? [
            {
              id: attachment.id ?? "document",
              name: attachment.name,
              type: attachment.type,
              size: attachment.size,
            },
          ]
        : [];
    await chat
      .sendMessage(
        attached.length && attachment?.source
          ? {
              metadata: { builderAttachments: attached },
              content: [
                { type: "text", content: text.trim() },
                attachmentPart(attached[0], attachment.source),
              ],
            }
          : text.trim(),
      )
      .catch((error: Error) => setNotice(error.message));
  };
  const prepare = useCallback(
    async (id: string, proposal: Proposal) => {
      const revision = bindings.current.get(id);
      if (
        !active.current ||
        !current.current.open ||
        !revision ||
        revision !== current.current.context.revision ||
        current.current.readOnly
      )
        throw new Error(
          "The draft or editing permission changed. Request a fresh proposal.",
        );
      const change = await current.current.prepare(proposal);
      if (
        !active.current ||
        !current.current.open ||
        revision !== current.current.context.revision ||
        current.current.readOnly
      )
        throw new Error(
          "The draft changed while validation was running. Request a fresh proposal.",
        );
      return change;
    },
    [current],
  );
  return (
    <>
      <div className="flex items-center gap-2 border-b border-ui-hairline px-4 py-2.25 text-[11px] text-ui-default [&_span]:min-inline-0 [&_span]:flex-1 [&_span]:truncate">
        <span>
          {context.kind === "form" ? "Form" : "Content page"} ·{" "}
          {String(context.document.title || "Untitled")}
        </span>
        <Button
          type="button"
          disabled={busy}
          onClick={() => {
            chat.stop();
            updateAttachment(undefined);
            onDelete();
          }}
          variant="ghost"
          size="sm"
        >
          Delete chat
        </Button>
      </div>

      <ScrollArea
        className="min-h-0 flex-1"
        aria-label="Conversation"
        viewportClassName="scroll-fade"
        viewportProps={{
          ref: feed,
          role: "log",
          "aria-live": "off",
          onScroll: () => {
            const element = feed.current;
            if (element) {
              follow.current =
                element.scrollHeight -
                  element.scrollTop -
                  element.clientHeight <
                80;
              setAway(!follow.current);
            }
          },
        }}
      >
        <div className="px-4.5 py-5.5">
          {chat.messages.length === 0 && (
            <div className="mx-auto max-inline-[38ch] pt-8 pb-5 [&_h2]:mt-4 [&_h2]:mb-3 [&_h2]:text-[22px] [&_h2]:font-[550] [&_h2]:tracking-[-0.6px] [&>p]:text-ui-default">
              <AiMagicIcon size={26} />
              <h2>Build with a little help</h2>
              <p>
                Ask a question, refine your draft, or start from an existing
                document. Review every change before applying it.
              </p>
              <div className="mt-6 grid gap-2 [&>button]:h-auto [&>button]:min-h-10 [&>button]:justify-between [&>button]:text-start [&>button]:whitespace-normal">
                {[
                  "Review this draft for clarity",
                  "Make the wording easier to understand",
                  context.kind === "form"
                    ? "Help me build a new form"
                    : "Improve the page structure",
                ].map((text) => (
                  <Button
                    type="button"
                    key={text}
                    onClick={() => void send(text)}
                    variant="ghost"
                    size="sm"
                  >
                    {text}
                    <ArrowRight01Icon size={14} />
                  </Button>
                ))}
              </div>
            </div>
          )}
          {chat.messages.map((message, messageIndex) => {
            const steps: ToolStep[] = message.parts.flatMap((part) => {
              if (part.type !== "tool-call") return [];
              const result = message.parts.find(
                (other) =>
                  other.type === "tool-result" && other.toolCallId === part.id,
              );
              const failed =
                part.state === "error" ||
                (result?.type === "tool-result" && result.state === "error");
              const waiting =
                part.state === "approval-requested" ||
                (part.name === "ask_questions" &&
                  part.state === "input-complete" &&
                  part.output === undefined);
              const running = messageIndex === chat.messages.length - 1 && busy;
              const status = failed
                ? "error"
                : part.output !== undefined
                  ? "done"
                  : waiting
                    ? "waiting"
                    : running
                      ? "running"
                      : "stopped";
              const detail =
                part.input &&
                typeof part.input === "object" &&
                "ref" in part.input
                  ? String(part.input.ref)
                  : status === "done"
                    ? typeof part.output === "object" &&
                      part.output &&
                      "applied" in part.output
                      ? part.output.applied
                        ? "Applied"
                        : "Not applied"
                      : "Complete"
                    : status === "waiting"
                      ? "Your input"
                      : status === "error"
                        ? "Failed"
                        : status === "stopped"
                          ? "Interrupted"
                          : "Working";
              return [
                {
                  id: part.id,
                  label: toolLabels[part.name] ?? "Tool activity",
                  chip: detail,
                  status,
                  input: part.input,
                  output: part.output,
                },
              ];
            });
            return (
              <article
                className="mb-5 min-inline-0 wrap-anywhere motion-safe:animate-ai-message data-[role=user]:ms-auto data-[role=user]:inline-fit data-[role=user]:max-inline-[90%] data-[role=user]:justify-self-end data-[role=user]:rounded-[14px_14px_4px_14px] data-[role=user]:bg-ui-tint data-[role=user]:px-4 data-[role=user]:py-3 data-[role=user]:[&_p]:m-0 data-[role=user]:[&_p]:whitespace-pre-wrap data-[role=assistant]:rounded-xl data-[role=assistant]:border data-[role=assistant]:border-ui-hairline data-[role=assistant]:bg-ui-base data-[role=assistant]:p-3.75"
                data-role={message.role}
                key={message.id}
                aria-label={message.role === "user" ? "You" : "Assistant"}
              >
                {message.role === "user" &&
                  messageAttachments(message.metadata).map((file) => (
                    <AttachmentCard
                      key={file.id}
                      attachment={file}
                      file={localFiles[file.id]}
                    />
                  ))}
                {message.role === "assistant" && (
                  <div className="mb-2.25 text-[11px] font-[650] text-ui-default">
                    Assistant
                  </div>
                )}
                {steps.length > 0 && (
                  <ThinkingState
                    working={steps.some((step) => step.status === "running")}
                    done={
                      steps.some((step) => step.status === "waiting")
                        ? "Waiting for your input"
                        : `${steps.length} ${steps.length === 1 ? "tool call" : "tool calls"}`
                    }
                  >
                    <ToolChips steps={steps} />
                  </ThinkingState>
                )}
                {message.parts.map((part, index) =>
                  part.type === "text" ? (
                    <div
                      className="leading-[1.65] [&>:first-child]:mt-0 [&>:last-child]:mb-0 [&_:where(h1,h2,h3,h4)]:mt-4.5 [&_:where(h1,h2,h3,h4)]:mb-2 [&_:where(h1,h2,h3,h4)]:text-[16px] [&_:where(h1,h2,h3,h4)]:leading-[1.4] [&_:where(ul,ol)]:ps-5.5 [&_:where(pre,table)]:max-inline-full [&_:where(pre,table)]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-ui-recessed [&_pre]:p-3 [&_pre]:whitespace-pre-wrap [&_:where(th,td)]:border [&_:where(th,td)]:border-ui-hairline [&_:where(th,td)]:p-1.5 [&_a]:text-inherit [&_a]:underline"
                      key={index}
                    >
                      {message.role === "user" ? (
                        <p>{part.content}</p>
                      ) : (
                        <Markdown
                          extensions={extensions}
                          frontmatter={false}
                          headingIds={false}
                          allowHtml={false}
                          components={markdownComponents}
                        >
                          {part.content}
                        </Markdown>
                      )}
                    </div>
                  ) : part.type === "image" || part.type === "document" ? (
                    (() => {
                      const file = attachmentMetadata(part);
                      return file &&
                        !messageAttachments(message.metadata).length ? (
                        <AttachmentCard
                          key={file.id}
                          attachment={file}
                          file={localFiles[file.id]}
                        />
                      ) : null;
                    })()
                  ) : part.type === "tool-call" &&
                    part.name === "ask_questions" &&
                    part.state === "input-complete" &&
                    part.output === undefined &&
                    !questionsStopped &&
                    messageIndex > lastUserIndex ? (
                    (() => {
                      const parsed = askQuestionsTool.inputSchema.safeParse(
                        part.input,
                      );
                      return parsed.success ? (
                        <div key={part.id}>
                          {bindings.current.get(part.id) !==
                            context.revision && (
                            <p role="status">
                              The draft changed. Skip these questions and ask
                              again.
                            </p>
                          )}
                          <ApprovalCard
                            questions={parsed.data.questions}
                            disabled={busy}
                            onSubmit={(result) =>
                              answerQuestions(part.id, result)
                            }
                          />
                        </div>
                      ) : (
                        <div key={part.id} role="alert">
                          <p>
                            The assistant sent an invalid question. Skip it to
                            continue.
                          </p>
                          <Button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void answerQuestions(part.id, {
                                status: "skipped",
                                answers: [],
                              })
                            }
                            variant="ghost"
                            size="sm"
                          >
                            Skip question
                          </Button>
                        </div>
                      );
                    })()
                  ) : null,
                )}
                {message.role === "assistant" &&
                  message.parts.some((part) => part.type === "text") && (
                    <Button
                      type="button"
                      className="mt-2"
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(
                            message.parts
                              .filter((part) => part.type === "text")
                              .map((part) => part.content)
                              .join("\n"),
                          )
                          .then(
                            () => setCopied(message.id),
                            () =>
                              setNotice(
                                "Copy failed. Select the text to copy it.",
                              ),
                          );
                      }}
                      variant="ghost"
                      size="sm"
                    >
                      {copied === message.id ? "Copied" : "Copy reply"}
                    </Button>
                  )}
              </article>
            );
          })}
          {chat.interrupts.map((interrupt) =>
            interrupt.kind === "tool-approval" ? (
              <BoundReview
                key={interrupt.id}
                id={interrupt.toolCallId}
                proposal={interrupt.originalArgs}
                prepare={prepare}
                stale={
                  bindings.current.get(interrupt.toolCallId) !==
                    context.revision || !!readOnly
                }
                disabled={!interrupt.canResolve || busy}
                onApprove={(change) => {
                  approved.current.set(interrupt.toolCallId, change);
                  interrupt.resolveInterrupt(true);
                }}
                onReject={() => interrupt.resolveInterrupt(false)}
              />
            ) : null,
          )}
          {busy && (
            <LoadingState
              label={
                uploading
                  ? attachment
                    ? "Reading document"
                    : "Uploading document"
                  : "Assistant is responding"
              }
            />
          )}
          {!busy && pending && (
            <p role="status" className="text-[12px] text-ui-default">
              {unanswered.length
                ? "Answer the questions to continue."
                : "Review the proposed changes to continue."}
            </p>
          )}
        </div>
      </ScrollArea>
      {away && (
        <Button
          className="absolute start-1/2 bottom-55 -translate-x-1/2"
          type="button"
          onClick={() => {
            follow.current = true;
            setAway(false);
            feed.current?.scrollTo({
              top: feed.current.scrollHeight,
              behavior: "instant",
            });
          }}
          variant="ghost"
          size="sm"
        >
          Jump to latest <ArrowDown01Icon size={14} aria-hidden="true" />
        </Button>
      )}

      <div className="grid shrink-0 gap-2.5 px-4 pt-3 pb-2 max-lg:pb-[max(12px,env(safe-area-inset-bottom))]">
        {storageError && (
          <Banner variant="alert" role="status">
            <div className="min-w-0 space-y-2">
              Browser storage is unavailable. This conversation may not survive
              a refresh.
            </div>
          </Banner>
        )}
        {readOnly && (
          <Banner variant="alert">
            <div className="min-w-0 space-y-2">
              This draft is read-only. You can still ask questions.
            </div>
          </Banner>
        )}
        {(notice || chat.error) && (
          <Banner variant="error" role="alert">
            <div className="min-w-0 space-y-2">
              <p>{notice || chat.error?.message}</p>
              {!busy && (
                <Button
                  type="button"
                  onClick={() => {
                    setNotice("");
                    if (pendingFile.current) void extract(pendingFile.current);
                    else if (attachment && attachment.status !== "ready")
                      void extract();
                    else void chat.reload();
                  }}
                  variant="ghost"
                  size="sm"
                >
                  Retry
                </Button>
              )}
            </div>
          </Banner>
        )}
        <PromptBar
          attachments={
            attachment || localFile ? (
              <div className="max-block-[min(240px,25dvh)] overflow-y-auto">
                <AttachmentCard
                  attachment={
                    attachment
                      ? {
                          id: attachment.id ?? "document",
                          name: attachment.name,
                          type: attachment.type,
                          size: attachment.size,
                        }
                      : {
                          id: "uploading",
                          name: localFile!.name,
                          type: localFile!.type as AttachmentMetadata["type"],
                          size: localFile!.size,
                        }
                  }
                  file={attachment?.id ? localFiles[attachment.id] : localFile}
                  status={
                    attachment?.status === "ready"
                      ? "Text extracted"
                      : uploading
                        ? attachment
                          ? "Reading…"
                          : "Uploading…"
                        : documentFailure
                          ? "Needs attention"
                          : "Not ready"
                  }
                  disabled={busy || pending}
                  onRemove={() => {
                    updateAttachment(undefined);
                    pendingFile.current = undefined;
                    setLocalFile(undefined);
                    setDocumentFailure("");
                    setNotice("");
                  }}
                />
                <Collapsible>
                  <Collapsible.Trigger
                    render={
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto min-h-9 w-full justify-start whitespace-normal text-left"
                      />
                    }
                  >
                    {" "}
                    Document activity
                  </Collapsible.Trigger>
                  <Collapsible.Panel>
                    <TaskRows
                      rows={[
                        {
                          id: "upload",
                          label: "Upload document",
                          status: attachment
                            ? "done"
                            : uploading
                              ? "running"
                              : documentFailure
                                ? "error"
                                : "pending",
                          detail: attachment
                            ? "Document uploaded. Text extraction can use the same upload on retry."
                            : documentFailure || "Uploading your PDF or image.",
                          ...(!uploading && !attachment
                            ? {
                                onRetry: () =>
                                  void extract(pendingFile.current),
                              }
                            : {}),
                        },
                        {
                          id: "extract",
                          label: "Read document",
                          status:
                            attachment?.status === "ready"
                              ? "done"
                              : uploading && attachment
                                ? "running"
                                : documentFailure && attachment
                                  ? "stopped"
                                  : "pending",
                          detail:
                            attachment?.status === "ready"
                              ? "Extracted text is ready to use in this conversation."
                              : documentFailure ||
                                "Text is extracted before the assistant uses this document.",
                          ...(!uploading &&
                          attachment &&
                          attachment.status !== "ready"
                            ? { onRetry: () => void extract() }
                            : {}),
                        },
                      ]}
                    />
                  </Collapsible.Panel>
                </Collapsible>
              </div>
            ) : undefined
          }
          onAttachmentError={setNotice}
          value={input}
          onChange={setInput}
          mode={mode}
          onModeChange={setMode}
          busy={busy}
          pending={pending}
          readOnly={readOnly}
          blocked={
            !!pendingFile.current ||
            (!!attachment && attachment.status !== "ready")
          }
          kind={context.kind}
          selection={selection}
          documentName={
            attachment?.status === "ready" ? attachment.name : undefined
          }
          requestId={requestId}
          onClearSelection={() => setSelectedText(null)}
          onSend={() => void send(input)}
          onStop={() => {
            chat.stop();
            setQuestionsStopped(true);
            upload.current?.abort();
            setNotice("Stopped. Retry when you are ready.");
          }}
          onAttach={(file) => void extract(file)}
        />
        <p className="m-0 text-center text-[11px] text-ui-default">
          Saved on this device · Enter to send · Shift + Enter for a new line
        </p>
      </div>
    </>
  );
}

function BoundReview({
  id,
  prepare,
  ...props
}: Omit<React.ComponentProps<typeof ReviewCard>, "prepare"> & {
  id: string;
  prepare: (id: string, proposal: Proposal) => Promise<PreparedChange>;
}) {
  const check = useCallback(
    () => prepare(id, props.proposal),
    [prepare, id, props.proposal],
  );
  return <ReviewCard {...props} prepare={check} />;
}
