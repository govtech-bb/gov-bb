import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ArrowDown, ArrowUp, BracketsCurly } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { useEditorDefinition } from "../editor/react/composer";
import { formDefinition } from "../forms/definition";
import { createFormRuntime } from "../forms/editor/runtime";
import { createFormDraftCodec } from "../forms/editor/codec";
import { nativeDiagnosticPath, type NativeDiagnostic } from "../forms/schema";
import type { DraftReplacementToken } from "../persistence/types";
import { Banner } from "../ui/banner";
import { Bar } from "../ui/bar";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Field } from "../ui/field";
import { Textarea } from "../ui/textarea";
import { useDraft, type DialogOutcome } from "./source-ui";
import {
  applyNativeImport,
  beginNativeImport,
  exportNativeForm,
  nativeIOUnavailable,
  prepareNativeImport,
  type PendingNativeImport,
} from "./native-form-io";

function downloadJson(source: string, name: string) {
  const url = URL.createObjectURL(new Blob([source], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function FormJsonDialog() {
  const [editor] = useLexicalComposerContext();
  const definition = formDefinition(useEditorDefinition());
  const draft = useDraft();
  const [open, setOpen] = useState(false);

  const [staged, setStaged] = useState<{
    pending: PendingNativeImport;
    token?: DraftReplacementToken;
  }>();

  const [diagnostics, setDiagnostics] = useState<NativeDiagnostic[]>([]);
  const [outcome, setOutcome] = useState<DialogOutcome>();
  const sequence = useRef(0);
  const upload = useRef<HTMLInputElement>(null);
  const pending = staged?.pending;
  const unavailable = nativeIOUnavailable(draft.store, editor);
  const forced = !!draft.replacement;
  useEffect(
    () => () => {
      sequence.current++;
    },
    [],
  );

  return (
    <Dialog.Root open={open || forced} onOpenChange={setOpen}>
      <Dialog.Trigger render={<Bar.Tool icon={<BracketsCurly />} label="JSON" />} />
      <Dialog.Content size="full" close={!forced} closeLabel="Close form JSON">
        <Dialog.Header>
          <Dialog.Title>Form JSON</Dialog.Title>
          <Dialog.Description>
            Download this form or open a v2 form definition. Review an opened file before applying
            it.
          </Dialog.Description>
        </Dialog.Header>
        <Dialog.Body className="flex flex-col">
          {unavailable && (
            <p role="status" className="mb-3 text-14 text-muted">
              {unavailable}
            </p>
          )}
          <div className="mb-3 flex flex-wrap gap-2">
            <Button
              icon={<ArrowDown />}
              onClick={() => {
                const result = exportNativeForm(draft.store, editor, definition);
                setDiagnostics(result.diagnostics);

                if (result.source) {
                  downloadJson(result.source, "form.json");
                  setOutcome({ tone: "success", text: "Form JSON downloaded" });
                }
              }}
            >
              Download JSON
            </Button>
            <Button icon={<ArrowUp />} onClick={() => upload.current?.click()}>
              Open JSON
            </Button>
            <input
              ref={upload}
              type="file"
              accept=".json,application/json"
              aria-label="Open form JSON file"
              className="sr-only"
              tabIndex={-1}
              onChange={async (event) => {
                const input = event.currentTarget,
                  file = input.files?.[0];

                input.value = "";

                if (!file) return;
                const request = ++sequence.current;
                const begun = beginNativeImport(draft.store, editor);
                setStaged(undefined);
                setDiagnostics([]);
                setOutcome(
                  begun.error
                    ? { tone: "error", text: begun.error }
                    : { tone: "info", text: "Reading form JSON…" },
                );

                try {
                  const source = await file.text();

                  if (sequence.current !== request) return;

                  const next = prepareNativeImport(
                    source,
                    definition,
                    createFormDraftCodec(createFormRuntime(definition)),
                  );

                  setStaged({ pending: next, token: begun.token });
                  setDiagnostics(next.diagnostics);
                  setOutcome(
                    begun.error
                      ? { tone: "error", text: begun.error }
                      : next.status === "ready"
                        ? { tone: "info", text: "Ready to review and apply" }
                        : {
                            tone: "error",
                            text: "The file was retained. Correct its errors before importing it.",
                          },
                  );
                } catch {
                  if (sequence.current === request) {
                    setStaged(undefined);
                    setOutcome({
                      tone: "error",
                      text: "The file could not be read. Open it again.",
                    });
                  }
                }
              }}
            />
            {pending && (
              <Button onClick={() => downloadJson(pending.source, "original-form.json")}>
                Download opened file
              </Button>
            )}
          </div>
          {pending?.summary && (
            <p className="mb-3 text-16 font-semibold">
              {pending.summary.title} · {pending.summary.pages} pages · {pending.summary.questions}{" "}
              questions
            </p>
          )}
          {pending && (
            <Field label="Opened form JSON" className="flex-1">
              <Textarea
                readOnly
                value={pending.source}
                spellCheck={false}
                className="min-h-32 flex-1 resize-none bg-grey-10 p-3 font-mono leading-6"
              />
            </Field>
          )}
          {diagnostics.length > 0 && (
            <ul
              aria-label="JSON diagnostics"
              className="my-3 max-h-48 overflow-y-auto text-14 text-error"
            >
              {diagnostics.map((issue, index) => (
                <li key={`${issue.code}:${index}`}>
                  {nativeDiagnosticPath(issue.path)}: {issue.message}
                </li>
              ))}
            </ul>
          )}
          {draft.replacement && (
            <div className="my-3 flex flex-wrap gap-2">
              <p role="alert" className="w-full text-14 text-error">
                {draft.error ?? "Recover this interrupted import before editing."}
              </p>
              <Button
                onClick={() => {
                  const result = draft.store.recoverReplacement("candidate");
                  setOutcome(
                    result.status === "committed"
                      ? { tone: "success", text: "Imported form recovered" }
                      : { tone: "error", text: result.message },
                  );
                }}
              >
                Recover imported form
              </Button>
              <Button
                onClick={() => {
                  const result = draft.store.recoverReplacement("original");
                  setOutcome(
                    result.status === "committed"
                      ? { tone: "success", text: "Original form restored" }
                      : { tone: "error", text: result.message },
                  );
                }}
              >
                Restore original form
              </Button>
              <Button
                onClick={() =>
                  downloadJson(
                    draft.replacement!.journal.original ??
                      JSON.stringify(draft.replacement!.journal, null, 2),
                    "import-recovery.json",
                  )
                }
              >
                Download recovery copy
              </Button>
              {draft.replacement.phase === "cleanup" && (
                <Button onClick={() => draft.store.retryReplacementCleanup()}>Finish saving</Button>
              )}
            </div>
          )}
          {/* What came of it, done or failed, each in its own tone */}
          {outcome && (
            <Banner tone={outcome.tone} className="mt-3">
              {outcome.text}
            </Banner>
          )}
        </Dialog.Body>
        <Dialog.Actions>
          <Button
            variant="accent"
            size="md"
            disabled={pending?.status !== "ready" || !staged?.token || !!unavailable}
            onClick={() => {
              if (!staged?.token) return;
              const result = applyNativeImport(staged.pending, staged.token, draft.store, editor);
              setOutcome(
                result.status !== "committed"
                  ? { tone: "error", text: result.message }
                  : result.cleanupPending
                    ? {
                        tone: "warning",
                        text: "Form imported. Finish saving to clear recovery data.",
                      }
                    : {
                        tone: "success",
                        text: "Form imported. Undo returns to your previous form.",
                      },
              );

              if (result.status === "committed") setStaged(undefined);
            }}
          >
            Apply import
          </Button>
        </Dialog.Actions>
      </Dialog.Content>
    </Dialog.Root>
  );
}
