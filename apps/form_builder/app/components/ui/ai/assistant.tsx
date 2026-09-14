import { ScrollArea } from "../scroll-area";
import { Collapsible } from "../collapsible";
import { Banner } from "../banner";
import { Dialog } from "../dialog";
import { Select } from "../select";
import { Button } from "../button";
import { DropdownMenu } from "../dropdown";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useLayoutEffect,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useChat } from "@tanstack/ai-react";
import type { ServiceSnapshot } from "@govtech-bb/form-types";
import { flushSync } from "react-dom";
import { toolDefinition } from "@tanstack/ai/client";
import {
  AiMagicIcon,
  ArrowRight01Icon,
  Add01Icon,
  ArrowExpand01Icon,
  ArrowShrink01Icon,
  Cancel01Icon,
  ArrowDown01Icon,
  MoreHorizontalIcon,
  ViewIcon,
  Copy01Icon,
  CheckmarkCircle02Icon,
} from "hugeicons-react";
import {
  proposeFormTool,
  proposeContentTool,
  askQuestionsTool,
  readServiceTool,
  readPageTool,
  readFormTool,
  updateServiceDetailsTool,
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
  type Permission,
} from "./history";
import { AppliedCard } from "./applied-card";
import { ArtifactPane } from "./artifact-pane";
import { useServiceIndex } from "../../services/service-state";
import {
  readService,
  readPage,
  readForm,
  prepareServiceEdit,
} from "./service-tools";
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
import { StreamingText } from "./streaming-text";

const toolLabels: Record<string, { active: string; done: string }> = {
  lookup_component: {
    active: "Looking up component",
    done: "Looked up component",
  },
  validate_form: { active: "Checking form", done: "Checked form" },
  apply_form_draft: { active: "Draft proposal", done: "Draft proposal" },
  apply_content_patch: { active: "Page proposal", done: "Page proposal" },
  update_service_details: {
    active: "Service proposal",
    done: "Service proposal",
  },
  read_service: { active: "Reading service", done: "Read service" },
  read_page: { active: "Reading page", done: "Read page" },
  read_form: { active: "Reading form", done: "Read form" },
  ask_questions: {
    active: "Clarifying questions",
    done: "Clarified questions",
  },
};
const AUTO_APPLY_TOOLS = new Set([
  "apply_form_draft",
  "apply_content_patch",
  "update_service_details",
]);
type Approval = {
  kind: "tool-approval";
  id: string;
  toolCallId: string;
  toolName: string;
  originalArgs: Proposal;
  status: string;
  canResolve: boolean;
  resolveInterrupt: (approved: boolean) => void;
};
export type AssistantProps = {
  user: string;
  documentId: string;
  conversationScope?: string;
  kind: AiContext["kind"];
  document: Record<string, unknown>;
  revisionSource: unknown;
  selection?: string;
  request?: AssistantRequest;
  onRequestHandled?: () => void;
  readOnly?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  harness?: boolean;
  onHarnessChange?: (harness: boolean) => void;
  target?: { serviceId: string; pagePath?: string };
  artifact?: { snapshot: ServiceSnapshot; pageId?: string; stepId?: string };
  transport?: typeof streamChat;
  prepare: (proposal: Proposal) => Promise<PreparedChange>;
};

export function Assistant(props: AssistantProps) {
  const [internalOpen, setInternalOpen] = useState(true);
  const open = props.open ?? internalOpen;
  const setOpen = props.onOpenChange ?? setInternalOpen;
  const [internalHarness, setInternalHarness] = useState(false);
  const harness = props.harness ?? internalHarness;
  const setHarness = props.onHarnessChange ?? setInternalHarness;
  const [width, setWidth] = useState(450);
  const [compact, setCompact] = useState(false);
  const full = harness && !compact;
  const { entries } = useServiceIndex();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [thread, setThread] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [dock, setDock] = useState<HTMLDivElement | null>(null);
  const scope = props.conversationScope
    ? historyKey(props.user, "workspace", props.conversationScope)
    : historyKey(props.user, props.kind, props.documentId);
  const source = JSON.stringify(props.revisionSource);
  const revision = useMemo(
    () => crypto.randomUUID(),
    [source, props.user, props.kind, props.documentId],
  );
  const permission =
    conversations.find((item) => item.id === thread)?.permission ?? "ask";
  const context: AiContext = {
    kind: props.kind,
    documentId: props.documentId,
    document: redactAiData(props.document) as Record<string, unknown>,
    revision,
    mode: props.readOnly ? "ask" : "edit",
    services: entries.slice(0, 50).map(({ manifest, revision }) => ({
      serviceId: manifest.serviceId,
      title: manifest.title,
      category: manifest.category,
      formId: manifest.formId,
      revision,
      pages: manifest.pages.map(({ path, title, kind }) => ({
        path,
        title,
        kind,
      })),
    })),
    selection: props.selection,
    attachments: [],
  };
  const current = useRef({
    context,
    prepare: props.prepare,
    transport: props.transport,
    target: props.target,
    readOnly: props.readOnly,
    open,
  });
  useLayoutEffect(() => {
    current.current = {
      context,
      prepare: props.prepare,
      transport: props.transport,
      target: props.target,
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
  const setPermission = (permission: Permission) =>
    saveIndex(
      conversations.map((item) =>
        item.id === thread ? { ...item, permission } : item,
      ),
    );
  const select = (id: string) => {
    setThread(id);
    saveIndex([
      ...conversations.filter((item) => item.id === id),
      ...conversations.filter((item) => item.id !== id),
    ]);
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
        className="relative min-inline-0 flex-[0_0_var(--ai-width)] transition-[flex-basis] duration-(--ui-enter) ease-out data-[open=false]:basis-0 data-[open=false]:duration-(--ui-moderate) motion-reduce:transition-none max-lg:basis-0"
        data-open={open}
        style={
          {
            "--ai-width": full ? "100%" : `min(${width}px,55cqi)`,
          } as CSSProperties
        }
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
            className="absolute inset-0 m-0 flex h-full max-h-none w-screen max-w-none translate-none scale-100! flex-col overflow-hidden rounded-none border-0 border-s border-ui-hairline bg-ui-base shadow-none p-0 font-sans text-[14px] text-ui-default sm:w-screen lg:w-(--ai-width) max-lg:fixed max-lg:h-dvh max-lg:w-screen max-lg:border-0 [:where(&)_p]:mt-0 [:where(&)_p]:mb-3 [:where(&)_p]:leading-[1.6]"
            aria-label={
              props.conversationScope
                ? "Workspace assistant"
                : props.kind === "form"
                  ? "Form assistant"
                  : "Content assistant"
            }
            showCloseButton={false}
          >
            {!harness && (
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
            )}
            <div className="flex min-h-0 flex-1 flex-col">
              {thread && (
                <ChatSession
                  conversation={
                    <Select
                      aria-label="Conversation"
                      value={thread}
                      size="sm"
                      className="border-0 bg-transparent shadow-none ring-0 font-medium"
                      onValueChange={(id) => {
                        if (id !== null) select(id);
                      }}
                      items={conversations.map((item) => ({
                        value: item.id,
                        label: item.title,
                      }))}
                    />
                  }
                  controls={
                    <>
                      <Button
                        type="button"
                        aria-label="New conversation"
                        title="New conversation"
                        disabled={conversations.length >= 50}
                        onClick={newConversation}
                        variant="ghost"
                        size="sm"
                        shape="square"
                      >
                        <Add01Icon size={16} aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        className="max-lg:hidden"
                        aria-label={
                          harness ? "Narrow assistant" : "Expand assistant"
                        }
                        title={
                          harness ? "Narrow assistant" : "Expand assistant"
                        }
                        onClick={() => setHarness(!harness)}
                        variant="ghost"
                        size="sm"
                        shape="square"
                      >
                        {harness ? (
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
                        shape="square"
                      >
                        <Cancel01Icon size={16} aria-hidden="true" />
                      </Button>
                    </>
                  }
                  key={thread}
                  thread={thread}
                  current={current}
                  context={context}
                  request={props.request}
                  onRequestHandled={props.onRequestHandled}
                  readOnly={props.readOnly}
                  open={open}
                  permission={permission}
                  setPermission={setPermission}
                  full={full}
                  artifact={props.artifact}
                  storageError={storageError}
                  onStorageError={() => setStorageError(true)}
                  onFirstMessage={rename}
                  onDelete={() => void remove()}
                />
              )}
            </div>
          </Dialog>
        </Dialog.Root>
      </div>
    </>
  );
}

type CurrentEditor = React.RefObject<{
  context: AiContext;
  prepare: AssistantProps["prepare"];
  transport?: AssistantProps["transport"];
  target?: AssistantProps["target"];
  readOnly?: boolean;
  open: boolean;
}>;

function ChatSession({
  conversation,
  controls,
  thread,
  current,
  context,
  request,
  onRequestHandled,
  readOnly,
  open,
  permission,
  setPermission,
  full,
  artifact,
  storageError,
  onStorageError,
  onFirstMessage,
  onDelete,
}: {
  conversation: ReactNode;
  controls: ReactNode;
  thread: string;
  current: CurrentEditor;
  context: AiContext;
  request?: AssistantRequest;
  onRequestHandled?: () => void;
  readOnly?: boolean;
  open: boolean;
  permission: Permission;
  setPermission: (permission: Permission) => void;
  full: boolean;
  artifact?: AssistantProps["artifact"];
  storageError: boolean;
  onStorageError: () => void;
  onFirstMessage: (text: string) => void;
  onDelete: () => void;
}) {
  const [input, setInput] = useState("");
  const artifactSource = JSON.stringify(artifact?.snapshot);
  const artifactRevision = useMemo(
    () => crypto.randomUUID(),
    [artifactSource, context.revision],
  );
  const [selectedText, setSelectedText] = useState<string | null>();
  const [requestId, setRequestId] = useState<string>();
  useEffect(() => {
    setSelectedText(undefined);
    setRequestId(undefined);
  }, [context.kind, context.documentId]);
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
  const composer = useRef<HTMLDivElement>(null);
  const threadSurface = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const [away, setAway] = useState(false);
  const bindings = useRef(new Map<string, string>());
  const approved = useRef(new Map<string, PreparedChange>());
  const applied = useRef(new Map<string, Omit<PreparedChange, "apply">>());
  const autoHandled = useRef(new Set<string>());
  const [pendingEdits, setPendingEdits] = useState(new Set<string>());
  const finishEdit = useCallback((id: string) => {
    setPendingEdits((pending) => {
      const next = new Set(pending);
      next.delete(id);
      return next;
    });
  }, []);
  const generation = useRef(0);
  const [activity, setActivity] = useState<{
    id: string;
    change?: Omit<PreparedChange, "apply">;
    validating: boolean;
  }>();
  const [paneChoice, setPaneChoice] = useState<{
    proposal?: string;
    open: boolean;
  }>();
  const [paneTab, setPaneTab] = useState<{
    id: number;
    value: "preview" | "changes";
    proposal?: string;
  }>();
  const paneOpen =
    full &&
    (paneChoice && paneChoice.proposal === activity?.id
      ? paneChoice.open
      : !!activity);
  const showPane = (value: "preview" | "changes") => {
    setPaneChoice({ proposal: activity?.id, open: true });
    setPaneTab((previous) => ({
      id: (previous?.id ?? 0) + 1,
      value,
      proposal: activity?.id,
    }));
  };
  const viewChanges = paneOpen ? () => showPane("changes") : undefined;
  const runRevision = useRef("");
  const active = useRef(true);
  const latest = useRef({ attachment, onStorageError, selection, permission });
  useLayoutEffect(() => {
    latest.current = { attachment, onStorageError, selection, permission };
  }, [attachment, onStorageError, selection, permission]);
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
    async (_input: Proposal, toolContext?: { toolCallId?: string }) => {
      const id = toolContext?.toolCallId ?? "";
      const change = approved.current.get(id);
      approved.current.delete(id);
      if (
        !active.current ||
        !current.current.open ||
        !change ||
        current.current.readOnly ||
        !bindings.current.has(id) ||
        (!change.external &&
          bindings.current.get(id) !== current.current.context.revision)
      ) {
        finishEdit(id);
        return {
          applied: false,
          message:
            "The draft changed or approval is missing. Request a fresh proposal.",
        };
      }
      try {
        let result: void | Promise<void>;
        flushSync(() => {
          result = change.apply();
        });
        await result!;
        const { apply: _apply, ...diff } = change;
        applied.current.set(id, diff);
        setActivity({ id, change: diff, validating: false });
        return {
          applied: true,
          message: [
            change.appliedMessage ??
              "Applied to the local draft. It has not been saved or deployed.",
            ...change.warnings,
          ].join("\n"),
        };
      } catch (error) {
        return {
          applied: false,
          message:
            error instanceof Error
              ? error.message
              : "Could not apply the change.",
        };
      } finally {
        finishEdit(id);
      }
    },
    [current, finishEdit],
  );
  const externalTarget = useCallback(
    (toolName: string, proposal: Proposal) => {
      if (toolName === "update_service_details") return true;
      if (!proposal.target) return false;
      const editor = current.current;
      return (
        proposal.target.serviceId !== editor.target?.serviceId ||
        (toolName === "apply_content_patch"
          ? editor.context.kind !== "content" ||
            proposal.target.pagePath !== editor.target?.pagePath
          : editor.context.kind !== "form")
      );
    },
    [current],
  );
  const prepare = useCallback(
    async (id: string, toolName: string, proposal: Proposal) => {
      const revision = bindings.current.get(id);
      const external = externalTarget(toolName, proposal);
      const started = generation.current;
      if (
        !active.current ||
        !current.current.open ||
        !revision ||
        (!external && revision !== current.current.context.revision) ||
        current.current.readOnly
      )
        throw new Error(
          "The draft or editing permission changed. Request a fresh proposal.",
        );
      setActivity({ id, validating: true });
      try {
        const change = external
          ? await prepareServiceEdit(toolName, proposal)
          : await current.current.prepare(proposal);
        if (
          !active.current ||
          !current.current.open ||
          started !== generation.current ||
          (!change.external && revision !== current.current.context.revision) ||
          current.current.readOnly
        )
          throw new Error(
            "The draft changed while validation was running. Request a fresh proposal.",
          );
        const { apply: _apply, ...diff } = change;
        setActivity({ id, change: diff, validating: false });
        return change;
      } catch (error) {
        if (active.current)
          setActivity((value) =>
            value?.id === id ? { id, validating: false } : value,
          );
        throw error;
      }
    },
    [current, externalTarget],
  );
  const autoApply = async (interrupt: Approval) => {
    if (
      latest.current.permission !== "auto" ||
      current.current.readOnly ||
      !current.current.open ||
      !active.current ||
      interrupt.status !== "pending" ||
      !interrupt.canResolve ||
      !AUTO_APPLY_TOOLS.has(interrupt.toolName) ||
      autoHandled.current.has(interrupt.id)
    )
      return;
    autoHandled.current.add(interrupt.id);
    setPendingEdits((pending) => new Set(pending).add(interrupt.toolCallId));
    const started = generation.current;
    let change: PreparedChange;
    try {
      change = await prepare(
        interrupt.toolCallId,
        interrupt.toolName,
        interrupt.originalArgs,
      );
    } catch (error) {
      change = {
        before: {},
        after: {},
        warnings: [],
        external: externalTarget(interrupt.toolName, interrupt.originalArgs),
        apply: () => {
          throw error;
        },
      };
    }
    if (latest.current.permission !== "auto") {
      autoHandled.current.delete(interrupt.id);
      finishEdit(interrupt.toolCallId);
      return;
    }
    if (
      !active.current ||
      !current.current.open ||
      current.current.readOnly ||
      started !== generation.current
    ) {
      finishEdit(interrupt.toolCallId);
      return;
    }
    approved.current.set(interrupt.toolCallId, change);
    try {
      interrupt.resolveInterrupt(true);
    } catch {
      approved.current.delete(interrupt.toolCallId);
      autoHandled.current.delete(interrupt.id);
      finishEdit(interrupt.toolCallId);
    }
  };
  const tools = useMemo(
    () =>
      [
        toolDefinition(proposeFormTool).client(execute),
        toolDefinition(proposeContentTool).client(execute),
        toolDefinition(askQuestionsTool).client(),
        toolDefinition(updateServiceDetailsTool).client(execute),
        toolDefinition(readServiceTool).client(readService),
        toolDefinition(readPageTool).client(readPage),
        toolDefinition(readFormTool).client(readForm),
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
      return (current.current.transport ?? streamChat)(
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
      ) {
        bindings.current.set(chunk.toolCallId, runRevision.current);
        if (chunk.toolName && AUTO_APPLY_TOOLS.has(chunk.toolName))
          setActivity({ id: chunk.toolCallId, validating: true });
      }
    },
    onInterruptStateChange(state, { source }) {
      if (source !== "live") return;
      for (const interrupt of state.interrupts) {
        if (interrupt.kind !== "tool-approval") continue;
        if (interrupt.status === "error") {
          approved.current.delete(interrupt.toolCallId);
          finishEdit(interrupt.toolCallId);
          setActivity((value) =>
            value?.id === interrupt.toolCallId
              ? { ...value, validating: false }
              : value,
          );
          setNotice("Could not apply the change. Retry when you are ready.");
        } else if (latest.current.permission === "auto")
          void autoApply(interrupt);
      }
    },
  });
  const stop = chat.stop;
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      generation.current++;
      approved.current.clear();
      stop();
      upload.current?.abort();
    };
  }, [stop]);
  useEffect(() => {
    if (!open) {
      approved.current.clear();
      autoHandled.current.clear();
      setPendingEdits(new Set());
      setActivity(undefined);
      generation.current++;
      setQuestionsStopped(true);
      stop();
      upload.current?.abort();
    }
  }, [open, stop]);
  useEffect(() => {
    const viewport = feed.current;
    const content = viewport?.firstElementChild;
    if (!viewport || !content) return;
    const observer = new ResizeObserver(() => {
      if (follow.current) viewport.scrollTop = viewport.scrollHeight;
    });
    observer.observe(content);
    const prompt = composer.current;
    const measure = () => {
      threadSurface.current?.style.setProperty(
        "--composer-height",
        `${prompt?.offsetHeight ?? 0}px`,
      );
      if (follow.current) viewport.scrollTop = viewport.scrollHeight;
    };
    const promptObserver = new ResizeObserver(measure);
    if (prompt) promptObserver.observe(prompt);
    measure();
    return () => {
      observer.disconnect();
      promptObserver.disconnect();
    };
  }, []);
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
  const responding = chat.isLoading || chat.resuming || uploading;
  const busy = responding || pendingEdits.size > 0;
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
  const review = (interrupt: Approval) => {
    const automatic =
      permission === "auto" &&
      !readOnly &&
      AUTO_APPLY_TOOLS.has(interrupt.toolName);
    if (automatic)
      return (
        <AppliedCard
          key={interrupt.toolCallId}
          summary={interrupt.originalArgs.summary}
          state={interrupt.status === "error" ? "failed" : "validating"}
        />
      );
    return (
      <BoundReview
        key={interrupt.toolCallId}
        id={interrupt.toolCallId}
        toolName={interrupt.toolName}
        proposal={interrupt.originalArgs}
        onViewChanges={
          activity?.id === interrupt.toolCallId ? viewChanges : undefined
        }
        prepare={prepare}
        stale={
          !bindings.current.has(interrupt.toolCallId) ||
          !!readOnly ||
          (!externalTarget(interrupt.toolName, interrupt.originalArgs) &&
            bindings.current.get(interrupt.toolCallId) !== context.revision)
        }
        disabled={
          !interrupt.canResolve ||
          responding ||
          pendingEdits.has(interrupt.toolCallId)
        }
        onApprove={(change) => {
          setPendingEdits((pending) =>
            new Set(pending).add(interrupt.toolCallId),
          );
          approved.current.set(interrupt.toolCallId, change);
          try {
            interrupt.resolveInterrupt(true);
          } catch {
            approved.current.delete(interrupt.toolCallId);
            finishEdit(interrupt.toolCallId);
          }
        }}
        onReject={() => {
          interrupt.resolveInterrupt(false);
          setActivity((value) =>
            value?.id === interrupt.toolCallId ? undefined : value,
          );
        }}
      />
    );
  };
  const empty = chat.messages.length === 0 && !pending && !activity;
  const latestMessage = chat.messages.at(-1);
  const hasActiveTool = latestMessage?.parts.some(
    (part) => part.type === "tool-call" && part.output === undefined,
  );
  const hasStreamingText =
    latestMessage?.role === "assistant" &&
    latestMessage.parts.some((part) => part.type === "text" && part.content);
  return (
    <>
      <header className="flex min-h-12 shrink-0 items-center gap-0.5 border-b border-ui-hairline px-3">
        <div className="min-w-0 flex-1 max-w-sm">{conversation}</div>
        <div className="flex-1" />
        {full && artifact && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Open preview"
            onClick={() => showPane("preview")}
          >
            <ViewIcon size={16} aria-hidden="true" /> Preview
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenu.Trigger aria-label="Conversation actions">
            <Button
              variant="ghost"
              size="sm"
              shape="square"
              aria-label="Conversation actions"
            >
              <MoreHorizontalIcon size={16} aria-hidden="true" />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end">
            <DropdownMenu.Item
              disabled={busy}
              variant="danger"
              onClick={() => {
                chat.stop();
                updateAttachment(undefined);
                onDelete();
              }}
            >
              Delete chat
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu>
        {controls}
      </header>
      <div
        className={`flex min-h-0 flex-1 ${full ? "gap-2.5 bg-ui-canvas p-2.5" : ""}`}
      >
        <div
          ref={threadSurface}
          className={`@container/thread relative flex min-h-0 min-w-0 flex-1 flex-col bg-ui-base ${full ? "rounded-xl" : ""}`}
        >
          <ScrollArea
            className={empty ? "hidden" : "min-h-0 flex-1"}
            aria-label="Conversation"
            viewportClassName="overscroll-contain"
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
            <div className="mx-auto flex w-full max-w-[calc(45rem+4rem)] flex-col gap-8 px-4 pt-8 pb-[calc(var(--composer-height,12rem)+1rem)] @xl/thread:px-8">
              {chat.messages.map((message, messageIndex) => {
                const steps: ToolStep[] = message.parts.flatMap((part) => {
                  if (part.type !== "tool-call") return [];
                  if (
                    AUTO_APPLY_TOOLS.has(part.name) &&
                    part.state !== "input-streaming"
                  )
                    return [];
                  const result = message.parts.find(
                    (other) =>
                      other.type === "tool-result" &&
                      other.toolCallId === part.id,
                  );
                  const failed =
                    part.state === "error" ||
                    (result?.type === "tool-result" &&
                      result.state === "error");
                  const waiting =
                    part.state === "approval-requested" ||
                    (part.name === "ask_questions" &&
                      part.state === "input-complete" &&
                      part.output === undefined);
                  const running =
                    messageIndex === chat.messages.length - 1 && busy;
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
                      label:
                        toolLabels[part.name]?.[
                          status === "done" ? "done" : "active"
                        ] ?? "Tool activity",
                      chip: detail,
                      status,
                      input: part.input,
                      output: part.output,
                    },
                  ];
                });
                return (
                  <article
                    className="group/message min-inline-0 wrap-anywhere motion-safe:animate-ai-message data-[role=user]:ms-auto data-[role=user]:max-w-[90%] data-[role=user]:rounded-xl data-[role=user]:bg-ui-tint data-[role=user]:px-3.5 data-[role=user]:py-2.5 data-[role=user]:[&_p]:m-0 data-[role=user]:[&_p]:whitespace-pre-wrap"
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
                    {steps.length > 0 && (
                      <ThinkingState
                        working={steps.some(
                          (step) => step.status === "running",
                        )}
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
                        message.role === "user" ? (
                          <p key={index}>{part.content}</p>
                        ) : (
                          <StreamingText
                            key={index}
                            content={part.content}
                            streaming={
                              chat.isLoading &&
                              messageIndex === chat.messages.length - 1 &&
                              index === message.parts.length - 1
                            }
                          />
                        )
                      ) : part.type === "tool-call" &&
                        AUTO_APPLY_TOOLS.has(part.name) &&
                        part.state !== "input-streaming" ? (
                        (() => {
                          const interrupt = chat.interrupts.find(
                            (item) =>
                              item.kind === "tool-approval" &&
                              item.toolCallId === part.id,
                          );
                          if (interrupt?.kind === "tool-approval")
                            return review(interrupt);
                          const output = part.output as
                            | { applied?: boolean; message?: string }
                            | undefined;
                          if (typeof output?.applied !== "boolean")
                            return pendingEdits.has(part.id) ? (
                              <AppliedCard
                                key={part.id}
                                summary={String(
                                  (part.input as Proposal | undefined)
                                    ?.summary ?? "Proposed changes",
                                )}
                                state="validating"
                              />
                            ) : null;
                          return (
                            <AppliedCard
                              key={part.id}
                              summary={String(
                                (part.input as Proposal | undefined)?.summary ??
                                  "Proposed changes",
                              )}
                              state={output.applied ? "applied" : "failed"}
                              change={applied.current.get(part.id)}
                              onViewChanges={
                                activity?.id === part.id
                                  ? viewChanges
                                  : undefined
                              }
                              message={output.message}
                            />
                          );
                        })()
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
                                  The draft changed. Skip these questions and
                                  ask again.
                                </p>
                              )}
                              <ApprovalCard
                                questions={parsed.data.questions}
                                disabled={responding}
                                onSubmit={(result) =>
                                  answerQuestions(part.id, result)
                                }
                              />
                            </div>
                          ) : (
                            <div key={part.id} role="alert">
                              <p>
                                The assistant sent an invalid question. Skip it
                                to continue.
                              </p>
                              <Button
                                type="button"
                                disabled={responding}
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
                      message.parts.some((part) => part.type === "text") &&
                      !(
                        responding && messageIndex === chat.messages.length - 1
                      ) && (
                        <Button
                          type="button"
                          className="mt-2 text-ui-subtle [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/message:opacity-100 focus-visible:opacity-100"
                          aria-label={
                            copied === message.id
                              ? "Copied reply"
                              : "Copy reply"
                          }
                          title={
                            copied === message.id ? "Copied" : "Copy reply"
                          }
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
                          {copied === message.id ? (
                            <CheckmarkCircle02Icon
                              size={15}
                              aria-hidden="true"
                            />
                          ) : (
                            <Copy01Icon size={15} aria-hidden="true" />
                          )}
                        </Button>
                      )}
                  </article>
                );
              })}
              {chat.interrupts.map((interrupt) =>
                interrupt.kind === "tool-approval" &&
                !chat.messages.some((message) =>
                  message.parts.some(
                    (part) =>
                      part.type === "tool-call" &&
                      part.id === interrupt.toolCallId &&
                      AUTO_APPLY_TOOLS.has(part.name) &&
                      part.state !== "input-streaming",
                  ),
                )
                  ? review(interrupt)
                  : null,
              )}
              {busy && !hasActiveTool && !hasStreamingText && (
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
            </div>
          </ScrollArea>
          {away && (
            <Button
              className="absolute start-1/2 bottom-[calc(var(--composer-height,12rem)+0.5rem)] z-1 -translate-x-1/2 rounded-full bg-ui-base shadow-sm"
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

          <div
            ref={composer}
            className={`grid w-full max-w-[calc(45rem+4rem)] gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] @xl/thread:px-8 ${empty ? "m-auto overflow-y-auto pt-8" : "absolute inset-x-0 bottom-0 mx-auto max-h-full overflow-y-auto bg-linear-to-t from-ui-base via-ui-base via-80% to-transparent pt-8 @xl/thread:pb-6"}`}
          >
            {empty && (
              <div className="pb-3">
                <p className="mb-1! text-[26px] leading-tight! font-normal tracking-tight text-ui-subtle">
                  Let’s work on your draft
                </p>
                <h2 className="text-[26px] leading-tight font-normal tracking-tight text-balance">
                  What can I help you with?
                </h2>
              </div>
            )}
            {storageError && (
              <Banner variant="alert" role="status">
                <div className="min-w-0 space-y-2">
                  Browser storage is unavailable. This conversation may not
                  survive a refresh.
                </div>
              </Banner>
            )}
            {readOnly && !context.document.workspace && (
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
                        if (pendingFile.current)
                          void extract(pendingFile.current);
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
                              type: localFile!
                                .type as AttachmentMetadata["type"],
                              size: localFile!.size,
                            }
                      }
                      file={
                        attachment?.id ? localFiles[attachment.id] : localFile
                      }
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
                                : documentFailure ||
                                  "Uploading your PDF or image.",
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
              permission={permission}
              onPermissionChange={(value) => {
                latest.current.permission = value;
                setPermission(value);
                if (value === "auto")
                  for (const interrupt of chat.interrupts) {
                    if (interrupt.kind === "tool-approval")
                      void autoApply(interrupt);
                  }
              }}
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
                generation.current++;
                approved.current.clear();
                autoHandled.current.clear();
                setPendingEdits(new Set());
                setActivity(undefined);
                chat.stop();
                setQuestionsStopped(true);
                upload.current?.abort();
                setNotice("Stopped. Retry when you are ready.");
              }}
              onAttach={(file) => void extract(file)}
            />
            {empty && (
              <div className="mt-3 grid gap-1">
                {(context.document.workspace
                  ? [
                      "Help me plan a service",
                      "How should I structure the guidance pages?",
                      "What makes a good application form?",
                    ]
                  : [
                      "Review this draft for clarity",
                      "Make the wording easier to understand",
                      context.kind === "form"
                        ? "Help me build a new form"
                        : "Improve the page structure",
                    ]
                ).map((text) => (
                  <Button
                    type="button"
                    key={text}
                    onClick={() => void send(text)}
                    variant="ghost"
                    size="sm"
                    className="h-auto min-h-10 justify-between text-start font-normal whitespace-normal text-ui-subtle"
                  >
                    {text}
                    <ArrowRight01Icon size={14} aria-hidden="true" />
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>
        {paneOpen ? (
          <ArtifactPane
            artifact={artifact}
            change={activity?.change}
            validating={activity?.validating ?? false}
            revision={artifactRevision}
            proposalId={activity?.id}
            onClose={() =>
              setPaneChoice({ proposal: activity?.id, open: false })
            }
            requestedTab={
              paneTab?.proposal === activity?.id ? paneTab : undefined
            }
          />
        ) : null}
      </div>
    </>
  );
}

function BoundReview({
  id,
  toolName,
  prepare,
  ...props
}: Omit<React.ComponentProps<typeof ReviewCard>, "prepare"> & {
  id: string;
  toolName: string;
  prepare: (
    id: string,
    toolName: string,
    proposal: Proposal,
  ) => Promise<PreparedChange>;
}) {
  const check = useCallback(
    () => prepare(id, toolName, props.proposal),
    [prepare, id, toolName, props.proposal],
  );
  return <ReviewCard {...props} prepare={check} />;
}
