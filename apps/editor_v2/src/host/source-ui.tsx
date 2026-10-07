import { Dialog } from "@base-ui/react/dialog";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ArrowDown, ArrowUp, Check, Code, Copy, X } from "@phosphor-icons/react";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Button } from "../ui/button";
import type { DraftStore } from "../persistence/draft-store";
import { draftEditorConnection } from "./draft-editor";

const DraftContext = createContext<DraftStore | null>(null);

export function DraftProvider({ store, children }: { store: DraftStore; children: ReactNode }) {
  useEffect(() => {
    store.start();
    const external = (event: StorageEvent) => store.externalChange(event.key);

    const visibility = () => {
      if (document.visibilityState === "hidden") store.flush();
    };

    window.addEventListener("storage", external);
    window.addEventListener("pagehide", store.flush);
    document.addEventListener("visibilitychange", visibility);

    return () => {
      window.removeEventListener("storage", external);
      window.removeEventListener("pagehide", store.flush);
      document.removeEventListener("visibilitychange", visibility);
      store.flush();
    };
  }, [store]);

  return <DraftContext value={store}>{children}</DraftContext>;
}

export function DraftEditorBinding() {
  const [editor] = useLexicalComposerContext();
  const store = useContext(DraftContext);

  if (!store) throw new Error("DraftProvider is missing");
  useEffect(() => store.connect(draftEditorConnection(editor)), [editor, store]);

  return null;
}

export function useDraft() {
  const store = useContext(DraftContext);

  if (!store) throw new Error("DraftProvider is missing");
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  return { store, ...snapshot };
}

export function download(text: string, name = "form-source.md") {
  const url = URL.createObjectURL(
    new Blob([text], {
      type: name.endsWith(".json") ? "application/json" : "text/markdown;charset=utf-8",
    }),
  );

  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SourceEditor({
  documentLabel = "form",
  fileName = "form-source.md",
  inline = false,
}: {
  documentLabel?: string;
  fileName?: string;
  inline?: boolean;
}) {
  const draft = useDraft();
  const [requestedOpen, setRequestedOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const field = useId();
  const source = useRef<HTMLTextAreaElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const uploadVersion = useRef(0);
  useEffect(
    () => () => {
      uploadVersion.current++;
    },
    [],
  );

  const forcedOpen =
    (!draft.valid || !!draft.conflict || draft.recovery?.kind === "migration") &&
    !draft.replacement;

  const open = requestedOpen || forcedOpen;
  const fatal = draft.diagnostics.some((issue) => issue.severity === "fatal");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft.source);
      setNotice("Source copied");
    } catch {
      source.current?.focus();
      source.current?.select();
      setNotice("Copy is unavailable. The source is selected so you can copy it.");
    }
  };

  const apply = () => {
    if (draft.store.apply()) {
      setNotice("Changes applied");
      source.current?.focus();
    }
  };

  const content = (
    <>
      {!inline && (
        <div className="flex items-center justify-between gap-3">
          <Dialog.Title className="text-24 font-semibold text-ink">
            {documentLabel[0]?.toUpperCase()}
            {documentLabel.slice(1)} source
          </Dialog.Title>
          <Dialog.Close
            disabled={forcedOpen}
            render={<Button icon={<X />} aria-label="Close source" />}
          />
        </div>
      )}
      <p className="mt-1 text-14 leading-5 text-muted">
        Edit the Markdown and apply it to the {documentLabel}. Unapplied changes pause canvas
        editing.
      </p>
      {draft.error && (
        <p
          role="alert"
          className="mt-3 rounded-sm border-s-4 border-error bg-grey-10 px-3 py-2 text-14 text-ink"
        >
          {draft.error}
        </p>
      )}
      {draft.conflict && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => draft.store.useLocal()}>Keep my version</Button>
          <Button onClick={() => draft.store.useExternal()}>Load other tab’s version</Button>
          <Button
            onClick={() =>
              download(
                draft.conflict?.working ?? draft.conflict?.source ?? "",
                "other-tab-source.md",
              )
            }
          >
            Download other version
          </Button>
        </div>
      )}
      {draft.replacement && (
        <div className="my-3 flex flex-wrap gap-2">
          <Button
            onClick={() => {
              const result = draft.store.recoverReplacement("candidate");
              setNotice(
                result.status === "committed" ? "Applied changes recovered" : result.message,
              );
            }}
          >
            Recover applied changes
          </Button>
          <Button
            onClick={() => {
              const result = draft.store.recoverReplacement("original");
              setNotice(result.status === "committed" ? "Original draft restored" : result.message);
            }}
          >
            Restore original draft
          </Button>
          <Button onClick={() => download(draft.replacement!.bytes, "draft-recovery.json")}>
            Download recovery copy
          </Button>
          {draft.replacement.phase === "cleanup" && (
            <Button onClick={() => draft.store.retryReplacementCleanup()}>Finish saving</Button>
          )}
        </div>
      )}
      <div className="my-3 flex flex-wrap items-center gap-2">
        <Button icon={<Copy />} onClick={copy}>
          Copy source
        </Button>
        <Button icon={<ArrowDown />} onClick={() => download(draft.source, fileName)}>
          Download source
        </Button>
        <Button
          icon={<ArrowUp />}
          disabled={!!draft.replacement}
          onClick={() => upload.current?.click()}
        >
          Open Markdown
        </Button>
        <input
          ref={upload}
          type="file"
          accept=".md,.markdown,text/markdown,text/plain"
          aria-label="Open Markdown file"
          className="sr-only"
          tabIndex={-1}
          onChange={async (event) => {
            const input = event.currentTarget;
            const file = input.files?.[0];
            input.value = "";

            if (!file) return;
            const version = ++uploadVersion.current;
            const initial = draft.store.getSnapshot();

            try {
              const text = await file.text();

              if (version !== uploadVersion.current) return;

              if (draft.store.getSnapshot() !== initial) {
                setNotice(
                  "The source changed while the file was opening. Your changes were kept. Open the file again to replace them.",
                );

                return;
              }

              draft.store.edit(text);
              setNotice(`${file.name} is ready to apply`);
            } catch {
              if (version === uploadVersion.current)
                setNotice("The file could not be read. Open it again or paste its contents.");
            }
          }}
        />
        {draft.recovery && (
          <Button
            onClick={() =>
              download(
                draft.recovery!.original,
                draft.recovery!.kind === "legacy" || draft.recovery!.kind === "canvas"
                  ? "recovered-draft.json"
                  : "recovered-source.md",
              )
            }
          >
            Download original draft
          </Button>
        )}
        {draft.previous !== undefined && (
          <Button onClick={() => download(draft.previous!, "previous-source.md")}>
            Download previous version
          </Button>
        )}
      </div>
      <label htmlFor={field} className="mb-1 text-14 font-semibold text-ink">
        Markdown source
      </label>
      <textarea
        id={field}
        ref={source}
        value={draft.source}
        readOnly={!!draft.replacement}
        onChange={(event) => {
          draft.store.edit(event.target.value);
          setNotice("");
        }}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-invalid={fatal}
        aria-describedby={draft.diagnostics.length ? `${field}-diagnostics` : undefined}
        className="min-h-32 min-w-0 flex-1 resize-none rounded-sm border border-line bg-grey-10 p-3 font-mono text-14 leading-6 text-ink outline-none focus:border-interactive focus:ring-2 focus:ring-focus max-sm:text-16"
      />
      {draft.diagnostics.length > 0 && (
        <ul
          id={`${field}-diagnostics`}
          className="mt-2 max-h-28 overflow-y-auto text-14 leading-5 text-ink"
        >
          {draft.diagnostics.map((issue) => (
            <li
              key={`${issue.code}:${issue.sourceKey ?? ""}:${issue.line}:${issue.column}:${issue.message}`}
            >
              <button
                type="button"
                className="rounded-sm text-start underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
                onClick={() => {
                  const input = source.current;

                  if (!input) return;

                  const start =
                    draft.source
                      .split("\n")
                      .slice(0, Math.max(0, issue.line - 1))
                      .reduce((length, line) => length + line.length + 1, 0) +
                    Math.max(0, issue.column - 1);

                  input.focus();
                  input.setSelectionRange(start, start);
                }}
              >
                Line {issue.line}: {issue.message}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          onClick={apply}
          disabled={!!draft.conflict || !!draft.replacement}
          className="bg-interactive px-4 text-white hover:bg-interactive/90"
        >
          Apply changes
        </Button>
        <Button
          onClick={() => {
            draft.store.discard();
            setNotice("Source changes discarded");
          }}
          disabled={!draft.valid || !draft.dirty || !!draft.conflict || !!draft.replacement}
        >
          Discard changes
        </Button>
        {draft.status === "error" && (
          <Button onClick={() => draft.store.retry()}>Try saving again</Button>
        )}
        <span role="status" className="ms-auto text-14 text-muted">
          {notice ||
            (draft.dirty
              ? "Unapplied changes"
              : draft.status === "saved"
                ? "Saved in this browser"
                : "")}
        </span>
      </div>
    </>
  );

  if (inline)
    return (
      <section aria-label={`${documentLabel} source`} className="flex min-h-120 flex-col p-5">
        {content}
      </section>
    );

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setRequestedOpen(next);

        if (next) setNotice("");
        else uploadVersion.current++;
      }}
    >
      <Dialog.Trigger className="inline-flex h-8 items-center gap-1.5 rounded-sm px-2 text-14 text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
        <Code className="size-4" /> <span className="max-sm:sr-only">Markdown</span>
        {draft.dirty && <span className="sr-only"> — unapplied changes</span>}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-ink/40" />
        <Dialog.Popup className="fixed inset-4 z-50 mx-auto flex max-w-300 flex-col overflow-hidden rounded-sm bg-white p-5 shadow-popup outline-none max-sm:inset-0 max-sm:p-3">
          <Dialog.Description className="sr-only">
            Edit Markdown for this {documentLabel}.
          </Dialog.Description>
          {content}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Where a draft stands against the host's own store, once the browser copy is safe. */
export type ServerSaveStatus = "saved" | "unsaved" | "saving" | "failed";

const serverText = {
  saved: ["Saved", "Saved"],
  unsaved: ["Unsaved changes", "Unsaved"],
  saving: ["Saving…", "Saving…"],
  failed: ["Not saved", "Unsaved"],
} as const;

export function DraftStatus({ server }: { server?: ServerSaveStatus }) {
  const draft = useDraft();

  // A browser-side problem outranks the host's status: it is the one to fix first.
  const hosted = server && (draft.status === "saved" || draft.status === "saving");

  const text = hosted
    ? serverText[server][0]
    : {
        saving: "Saving…",
        saved: "Saved",
        source: "Source changes",
        conflict: "Draft conflict",
        recovery: "Recover draft",
        error: "Not saved",
      }[draft.status];

  const compactText = hosted
    ? serverText[server][1]
    : {
        saving: "Saving…",
        saved: "Saved",
        source: "Edited",
        conflict: "Conflict",
        recovery: "Recover",
        error: "Unsaved",
      }[draft.status];

  return (
    <span
      role="status"
      title={draft.error ?? text}
      className="flex items-center gap-1.5 text-14 whitespace-nowrap text-blue-20 [&>svg]:size-4"
    >
      {(hosted ? server === "saved" : draft.status === "saved") && <Check />}
      <span className="max-sm:sr-only">{text}</span>
      <span aria-hidden="true" className="sm:hidden">
        {compactText}
      </span>
    </span>
  );
}
