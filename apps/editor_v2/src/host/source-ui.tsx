import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ArrowDown, ArrowUp, Code, Copy } from "@phosphor-icons/react";
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
import { Banner, type BannerTone } from "../ui/banner";
import { Bar } from "../ui/bar";
import { Button } from "../ui/button";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { Dialog } from "../ui/dialog";
import { Field } from "../ui/field";
import { SaveState, type SaveStateProps } from "../ui/save-state";
import { Textarea } from "../ui/textarea";
import type { DraftStore } from "../persistence/draft-store";
import { draftEditorConnection } from "./draft-editor";

const DraftContext = createContext<DraftStore | null>(null);

const DraftReadOnlyContext = createContext(false);

type SourceOpen = { open: boolean; setOpen: (open: boolean) => void };

// Whether the document's Markdown is open: its tool in the bar opens it, and so does the notice that editing is paused
const SourceOpenContext = createContext<SourceOpen>({ open: false, setOpen: () => {} });

/** Host read-only gates source controls as well as the canvas, without changing the working copy. */
export function DraftProvider({
  store,
  readOnly = false,
  children,
}: {
  store: DraftStore;
  readOnly?: boolean;
  children: ReactNode;
}): ReactNode {
  const [open, setOpen] = useState(false);

  return (
    <DraftContext value={store}>
      <DraftReadOnlyContext value={readOnly}>
        <SourceOpenContext value={{ open, setOpen }}>{children}</SourceOpenContext>
      </DraftReadOnlyContext>
    </DraftContext>
  );
}

/** Opens and closes the document's Markdown from outside its dialog. */
export const useSourceOpen = () => useContext(SourceOpenContext);

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

/** What came of acting in a dialog, shown in its body in the outcome's tone (Banner). */
export type DialogOutcome = { tone: BannerTone; text: string };

/** Read-only ownership preserves source selection and recovery downloads while refusing source mutations. */
export function SourceEditor({
  documentLabel = "form",
  fileName = "form-source.md",
  inline = false,
}: {
  documentLabel?: string;
  fileName?: string;
  inline?: boolean;
}): ReactNode {
  const draft = useDraft();
  const save = useDraftSave(fileName);
  const readOnly = useContext(DraftReadOnlyContext);
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const { open: requestedOpen, setOpen: setRequestedOpen } = useSourceOpen();
  const [discarding, setDiscarding] = useState(false);
  const [outcome, setOutcome] = useState<DialogOutcome>();
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

  const forcedOpen = !draft.valid;

  const open = requestedOpen || forcedOpen;
  const fatal = draft.diagnostics.some((issue) => issue.severity === "fatal");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft.source);
      setOutcome({ tone: "success", text: "Source copied" });
    } catch {
      source.current?.focus();
      source.current?.select();
      setOutcome({
        tone: "info",
        text: "Copy is unavailable. The source is selected so you can copy it.",
      });
    }
  };

  const apply = () => {
    if (!readOnlyRef.current && draft.store.apply()) {
      setOutcome({ tone: "success", text: "Changes applied" });
      source.current?.focus();
    }
  };

  const intro = (
    <>
      Edit the Markdown and apply it to the {documentLabel}. Unapplied changes pause canvas editing.
    </>
  );

  const body = (
    <>
      {/* A failed save shows why, with its way out; any other problem, as it is */}
      {save.status === "failed" ? (
        <div className="mt-3">
          <SaveState.Failure layout="box" {...save} />
        </div>
      ) : (
        draft.error && (
          <Banner tone="error" className="mt-3">
            {draft.error}
          </Banner>
        )
      )}
      <div className="my-3 flex flex-wrap items-center gap-2">
        <Button icon={<Copy />} onClick={copy}>
          Copy source
        </Button>
        <Button icon={<ArrowDown />} onClick={() => download(draft.source, fileName)}>
          Download source
        </Button>
        <Button icon={<ArrowUp />} disabled={readOnly} onClick={() => upload.current?.click()}>
          Replace from file
        </Button>
        <input
          ref={upload}
          type="file"
          accept=".md,.markdown,text/markdown,text/plain"
          aria-label="Markdown file to replace from"
          className="sr-only"
          tabIndex={-1}
          onChange={async (event) => {
            const input = event.currentTarget;
            const file = input.files?.[0];
            input.value = "";

            if (!file || readOnlyRef.current) return;
            const version = ++uploadVersion.current;
            const initial = draft.store.getSnapshot();

            try {
              const text = await file.text();

              if (version !== uploadVersion.current || readOnlyRef.current) return;

              if (draft.store.getSnapshot() !== initial) {
                setOutcome({
                  tone: "warning",
                  text: "The source changed while the file was opening. Your changes were kept. Choose the file again to replace them.",
                });

                return;
              }

              draft.store.edit(text);
              setOutcome({ tone: "info", text: `${file.name} is ready to apply` });
            } catch {
              if (version === uploadVersion.current)
                setOutcome({
                  tone: "error",
                  text: "The file could not be read. Choose it again, or paste its contents.",
                });
            }
          }}
        />
        {draft.recovery && (
          <Button
            onClick={() =>
              download(
                draft.recovery!.original,
                draft.recovery!.kind === "canvas" ? "recovered-draft.json" : "recovered-source.md",
              )
            }
          >
            Download original input
          </Button>
        )}
      </div>
      <Field label="Markdown source" className="flex-1">
        <Textarea
          ref={source}
          value={draft.source}
          readOnly={readOnly}
          onChange={(event) => {
            if (readOnlyRef.current) return;
            draft.store.edit(event.target.value);
            setOutcome(undefined);
          }}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-invalid={fatal}
          aria-describedby={draft.diagnostics.length ? `${field}-diagnostics` : undefined}
          className="min-h-32 flex-1 resize-none bg-grey-10 p-3 font-mono leading-6"
        />
      </Field>
      {draft.diagnostics.length > 0 && (
        <ul
          id={`${field}-diagnostics`}
          className="mt-2 max-h-28 overflow-y-auto text-14 leading-5 text-ink"
        >
          {draft.diagnostics.map((issue) => (
            <li
              key={`${issue.code}:${issue.sourceKey ?? ""}:${issue.line}:${issue.column}:${issue.message}`}
            >
              <Button
                variant="link"
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
              </Button>
            </li>
          ))}
        </ul>
      )}
      {outcome && (
        <Banner tone={outcome.tone} className="mt-3">
          {outcome.text}
        </Banner>
      )}
    </>
  );

  const actions = (
    <>
      {/* Whether it's saved shows in the document's bar, and what came of acting here in the body */}
      <span role="status" className="me-auto text-14 text-muted">
        {draft.dirty ? "Unapplied changes" : ""}
      </span>
      <Button
        size="md"
        onClick={() => setDiscarding(true)}
        disabled={readOnly || !draft.valid || !draft.dirty}
      >
        Discard changes
      </Button>
      {/* The Markdown can't be had back once discarded, so ask; the focus then goes back to it */}
      <ConfirmDialog
        open={discarding}
        onClose={() => setDiscarding(false)}
        title="Discard your changes?"
        description={`Your changes to the Markdown haven't been applied, and they'll be lost. The ${documentLabel} stays as it is.`}
        confirm="Discard changes"
        finalFocus={source}
        confirmDisabled={readOnly}
        onConfirm={() => {
          if (readOnlyRef.current) return;
          draft.store.discard();
          setOutcome({ tone: "success", text: "Source changes discarded" });
          setDiscarding(false);
        }}
      />
      <Button variant="accent" size="md" disabled={readOnly} onClick={apply}>
        Apply changes
      </Button>
    </>
  );

  if (inline)
    return (
      <section aria-label={`${documentLabel} source`} className="flex min-h-120 flex-col p-5">
        <p className="mt-1 text-14 leading-5 text-muted">{intro}</p>
        {body}
        <div className="mt-3 flex flex-wrap items-center gap-2">{actions}</div>
      </section>
    );

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setRequestedOpen(next);

        if (!next) uploadVersion.current++;
      }}
      // However it closed, by the author or once nothing holds it open, it opens next time without the last outcome
      onOpenChangeComplete={(next) => {
        if (!next) setOutcome(undefined);
      }}
    >
      <Dialog.Trigger
        render={
          <Bar.Tool icon={<Code />} label="Markdown">
            {draft.dirty && <span className="sr-only"> — unapplied changes</span>}
          </Bar.Tool>
        }
      />
      <Dialog.Content size="full" close={!forcedOpen} closeLabel="Close source">
        <Dialog.Header>
          <Dialog.Title>
            {documentLabel[0]?.toUpperCase()}
            {documentLabel.slice(1)} source
          </Dialog.Title>
          <Dialog.Description>{intro}</Dialog.Description>
        </Dialog.Header>
        {/* The body's sections bring their own top margins */}
        <Dialog.Body className="flex flex-col pt-1">{body}</Dialog.Body>
        <Dialog.Actions>{actions}</Dialog.Actions>
      </Dialog.Content>
    </Dialog.Root>
  );
}

/** Source errors outrank server save feedback; an applied local edit is never a durable save. */
export function useDraftSave(fileName: string, server?: SaveStateProps): SaveStateProps {
  const draft = useDraft();
  const readOnly = useContext(DraftReadOnlyContext);

  if (draft.status === "error")
    return {
      status: "failed",
      error: draft.error,
      conflict: server?.conflict,
      onRetry: !readOnly && draft.recovery?.kind === "canvas" ? draft.store.retry : undefined,
      onDownload: () =>
        download(
          draft.recovery?.kind === "canvas" ? draft.recovery.original : draft.source,
          draft.recovery?.kind === "canvas" ? "editor-state.json" : fileName,
        ),
    };

  if (!draft.valid || draft.dirty) return { status: "paused", conflict: server?.conflict };

  return server ?? { status: "unsaved" };
}

/** The draft's save state, for a host that shows it without a document bar. */
export function DraftStatus({ fileName = "form-source.md" }: { fileName?: string }) {
  return <SaveState.Status {...useDraftSave(fileName)} />;
}
