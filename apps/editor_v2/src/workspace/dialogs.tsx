import { Dialog } from "@base-ui/react/dialog";
import { X } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "../ui/button";
import { govbbFormEditor } from "../presets/govbb-form";
import { newForm, newPage } from "./documents";
import type { Service, WorkspaceDocument, WorkspaceRepository } from "./model";

export const inputClass =
  "w-full rounded-sm border border-line-strong bg-white px-3 py-2 text-16 text-ink focus-visible:outline-2 focus-visible:outline-focus";

export function WorkspaceDialog({
  title,
  description,
  children,
  close,
}: {
  title: string;
  description: string;
  children: ReactNode;
  close: () => void;
}) {
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-ink/40" />
        <Dialog.Popup className="fixed start-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[min(38rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto overscroll-contain rounded-sm bg-white p-6 text-ink shadow-popup outline-none">
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="text-24 font-semibold">{title}</Dialog.Title>
            <Dialog.Close
              render={<Button icon={<X />} aria-label={`Close ${title.toLowerCase()}`} />}
            />
          </div>
          <Dialog.Description className="my-3 text-16 text-muted">{description}</Dialog.Description>
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ServiceDialog({
  repository,
  service,
  close,
  done,
}: {
  repository: WorkspaceRepository;
  service?: Service;
  close: () => void;
  done: (service: Service) => void;
}) {
  const [title, setTitle] = useState(service?.title ?? "");
  const [error, setError] = useState("");
  const id = useId();
  const field = useRef<HTMLInputElement>(null);

  return (
    <WorkspaceDialog
      title={service ? "Rename service" : "Create a service"}
      description={
        service
          ? "The service name helps your team find its pages and form."
          : "Keep the pages and form for a service together. You can add a form or calculator later."
      }
      close={close}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();

          try {
            if (service) {
              repository.renameService(service.id, title);
              done({ ...service, title: title.trim() });
            } else {
              const page = newPage(title.trim(), "entry");
              done(repository.addService(title, page.document, page.source));
            }
          } catch (error) {
            setError(
              error instanceof Error ? error.message : "The service could not be saved. Try again.",
            );
            field.current?.focus();
          }
        }}
      >
        <label htmlFor={id} className="mb-2 block font-semibold">
          Service name
        </label>
        <input
          ref={field}
          id={id}
          name="service-name"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className={inputClass}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        {error && (
          <p id={`${id}-error`} role="alert" className="mt-3 text-error">
            {error}
          </p>
        )}
        <div className="mt-5 flex gap-2">
          <Button type="submit" variant="accent" size="lg">
            {service ? "Save service name" : "Create service"}
          </Button>
          <Button size="lg" onClick={close}>
            Cancel
          </Button>
        </div>
      </form>
    </WorkspaceDialog>
  );
}

export function DocumentDialog({
  repository,
  service,
  close,
  done,
}: {
  repository: WorkspaceRepository;
  service: Service;
  close: () => void;
  done: (document: WorkspaceDocument) => void;
}) {
  const firstRole = service.documents.some((item) => item.kind === "page" && item.role === "entry")
    ? "supporting"
    : "entry";

  const [kind, setKind] = useState<string>(firstRole);
  const [title, setTitle] = useState("");
  const [source, setSource] = useState<string>();
  const [fileName, setFileName] = useState("");
  const [fileStatus, setFileStatus] = useState<"idle" | "reading" | "ready" | "failed">("idle");
  const readVersion = useRef(0);
  const [error, setError] = useState("");
  const id = useId();
  const upload = useRef<HTMLInputElement>(null);
  const form = kind === "application" || kind === "calculator" || kind.startsWith("registry:");
  const hasForm = service.documents.some((item) => item.kind === "form");

  useEffect(
    () => () => {
      readVersion.current++;
    },
    [],
  );

  return (
    <WorkspaceDialog
      title="Add a document"
      description="Pages explain the service. A form collects answers; a calculator uses answers to produce a result."
      close={close}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();

          if (fileStatus === "reading" || fileStatus === "failed") return;

          try {
            const name =
              title.trim() ||
              (form
                ? service.title
                : kind === "entry"
                  ? service.title
                  : kind === "start"
                    ? "Before you start"
                    : "Untitled page");

            const created = form
              ? newForm(
                  name,
                  kind === "calculator" ? "calculator" : "application",
                  source,
                  kind.startsWith("registry:") ? kind.slice(9) : undefined,
                )
              : newPage(name, kind === "entry" || kind === "start" ? kind : "supporting", source);

            repository.addDocument(service.id, created.document, created.source);
            done(created.document);
          } catch (error) {
            setError(
              error instanceof Error
                ? error.message
                : "The document could not be added. Try again.",
            );
          }
        }}
      >
        <label htmlFor={`${id}-kind`} className="mb-2 block font-semibold">
          Document type
        </label>
        <select
          id={`${id}-kind`}
          className={inputClass}
          value={kind}
          onChange={(event) => {
            readVersion.current++;
            setFileStatus("idle");
            setKind(event.target.value);
            setSource(undefined);
            setFileName("");
            setError("");
          }}
        >
          {!service.documents.some((item) => item.kind === "page" && item.role === "entry") && (
            <option value="entry">Entry page</option>
          )}
          {!service.documents.some((item) => item.kind === "page" && item.role === "start") && (
            <option value="start">Start page</option>
          )}
          <option value="supporting">Supporting page</option>
          {!hasForm && (
            <>
              <option value="application">Application form</option>
              <option value="calculator">Calculator</option>
              {govbbFormEditor.registry.flatMap((entry) =>
                entry.scope === "form"
                  ? [
                      <option key={entry.key} value={`registry:${entry.key}`}>
                        {entry.title} — form from registry
                      </option>,
                    ]
                  : [],
              )}
            </>
          )}
        </select>
        <label htmlFor={`${id}-title`} className="mb-2 mt-4 block font-semibold">
          {form ? "Form name (optional)" : "Page title (optional)"}
        </label>
        <input
          id={`${id}-title`}
          className={inputClass}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <div className="mt-4">
          <Button variant="secondary" size="lg" onClick={() => upload.current?.click()}>
            {form ? "Open form JSON" : "Open Markdown file"}
          </Button>
          <input
            ref={upload}
            type="file"
            accept={form ? ".json,application/json" : ".md,.markdown,text/markdown,text/plain"}
            className="sr-only"
            aria-label={form ? "Import form JSON" : "Import page Markdown"}
            tabIndex={-1}
            onChange={async (event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";

              if (!file) return;

              const version = ++readVersion.current;
              setFileStatus("reading");
              setSource(undefined);
              setFileName("");
              setError("");

              try {
                const contents = await file.text();

                if (version !== readVersion.current) return;
                setSource(contents);
                setFileName(file.name);
                setFileStatus("ready");

                setTitle(
                  (current) =>
                    current ||
                    file.name.replace(/\.(?:md|markdown|json)$/i, "").replaceAll("-", " "),
                );
              } catch {
                if (version === readVersion.current) {
                  setFileStatus("failed");
                  setError("The file could not be read. Open it again.");
                }
              }
            }}
          />
        </div>
        {source !== undefined && (
          <details className="mt-4 rounded-sm border border-line p-3">
            <summary className="cursor-pointer font-semibold">Review {fileName}</summary>
            <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-12">
              {source}
            </pre>
          </details>
        )}
        {error && (
          <p role="alert" className="mt-3 text-error">
            {error}
          </p>
        )}
        <div className="mt-5 flex gap-2">
          <Button
            type="submit"
            variant="accent"
            size="lg"
            disabled={fileStatus === "reading" || fileStatus === "failed"}
          >
            Add document
          </Button>
          <Button size="lg" onClick={close}>
            Cancel
          </Button>
        </div>
      </form>
    </WorkspaceDialog>
  );
}
