import { Dialog } from "@base-ui/react/dialog";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ArrowDown, ArrowUp, X } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import { useEditorDefinition } from "../editor/react/composer";
import { formDefinition } from "../forms/definition";
import { createFormRuntime } from "../forms/editor/runtime";
import { createDraftCodec } from "../forms/editor/codec";
import { nativeDiagnosticPath, type NativeDiagnostic } from "../forms/schema";
import type { DraftReplacementToken } from "../persistence/types";
import { Button } from "../ui/button";
import { useDraft } from "./source-ui";
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

export function FormSchemaEditor() {
  const [editor] = useLexicalComposerContext();
  const definition = formDefinition(useEditorDefinition());
  const draft = useDraft();
  const [open, setOpen] = useState(false);

  const [staged, setStaged] = useState<{
    pending: PendingNativeImport;
    token?: DraftReplacementToken;
  }>();

  const [diagnostics, setDiagnostics] = useState<NativeDiagnostic[]>([]);
  const [notice, setNotice] = useState("");
  const sequence = useRef(0);
  const upload = useRef<HTMLInputElement>(null);
  const pending = staged?.pending;
  const field = useId();
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
      <Dialog.Trigger className="inline-flex h-8 items-center gap-1.5 rounded-sm px-2 text-14 text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
        JSON
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-ink/40" />
        <Dialog.Popup className="fixed inset-4 z-50 mx-auto flex max-w-300 flex-col overflow-hidden rounded-sm bg-white p-5 shadow-popup outline-none max-sm:inset-0 max-sm:p-3">
          <div className="flex items-center justify-between gap-3">
            <Dialog.Title className="text-24 font-semibold text-ink">Form JSON</Dialog.Title>
            <Dialog.Close
              disabled={forced}
              render={<Button icon={<X />} aria-label="Close form JSON" />}
            />
          </div>
          <Dialog.Description className="mt-1 text-14 text-muted">
            Download this form or open a v2 form definition. Review an opened file before applying
            it.
          </Dialog.Description>
          {unavailable && (
            <p role="status" className="mt-3 text-14 text-muted">
              {unavailable}
            </p>
          )}
          <div className="my-3 flex flex-wrap gap-2">
            <Button
              icon={<ArrowDown />}
              onClick={() => {
                const result = exportNativeForm(draft.store, editor, definition);
                setDiagnostics(result.diagnostics);

                if (result.source) {
                  downloadJson(result.source, "form.json");
                  setNotice("Form JSON downloaded");
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
                setNotice(begun.error ?? "Reading form JSON…");

                try {
                  const source = await file.text();

                  if (sequence.current !== request) return;

                  const next = prepareNativeImport(
                    source,
                    definition,
                    createDraftCodec(createFormRuntime(definition)),
                  );

                  setStaged({ pending: next, token: begun.token });
                  setDiagnostics(next.diagnostics);
                  setNotice(
                    begun.error ??
                      (next.status === "ready"
                        ? "Ready to review and apply"
                        : "The file was retained. Correct its errors before importing it."),
                  );
                } catch {
                  if (sequence.current === request) {
                    setStaged(undefined);
                    setNotice("The file could not be read. Open it again.");
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
            <>
              <label htmlFor={field} className="mb-1 text-14 font-semibold">
                Opened form JSON
              </label>
              <textarea
                id={field}
                readOnly
                value={pending.source}
                spellCheck={false}
                className="min-h-32 min-w-0 flex-1 resize-none rounded-sm border border-line bg-grey-10 p-3 font-mono text-14 leading-6 text-ink"
              />
            </>
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
                  setNotice(
                    result.status === "committed" ? "Imported form recovered" : result.message,
                  );
                }}
              >
                Recover imported form
              </Button>
              <Button
                onClick={() => {
                  const result = draft.store.recoverReplacement("original");
                  setNotice(
                    result.status === "committed" ? "Original form restored" : result.message,
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
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              disabled={pending?.status !== "ready" || !staged?.token || !!unavailable}
              onClick={() => {
                if (!staged?.token) return;
                const result = applyNativeImport(staged.pending, staged.token, draft.store, editor);
                setNotice(
                  result.status === "committed"
                    ? result.cleanupPending
                      ? "Form imported. Finish saving to clear recovery data."
                      : "Form imported. Undo returns to your previous form."
                    : result.message,
                );

                if (result.status === "committed") setStaged(undefined);
              }}
            >
              Apply import
            </Button>
            <span role="status" className="ms-auto text-14 text-muted">
              {notice}
            </span>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
