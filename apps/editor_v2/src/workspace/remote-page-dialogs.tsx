import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLayoutEffect, useRef, useState, type Ref, type RefObject } from "react";
import { categoryLabel, categoryRows } from "../api/categories";
import type { EditorApi, CreatePageInput, ServiceDetail } from "../api/client";
import type { Outcome } from "../api/write-attempt";
import { writes } from "../api/writes";
import { useWrite } from "./use-write";
import { pageFieldLabel, suggestedUrl, urlProblem } from "../api/page-fields";
import { categoriesQuery, pageQuery } from "../api/queries";
import { Button } from "../ui/button";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { Field } from "../ui/field";
import { FormDialog } from "../ui/form-dialog";
import { Input } from "../ui/input";
import { NativeSelect } from "../ui/native-select";
import { toast } from "../ui/toast";
import { ApiProblems, ApiProblemText } from "./api-problems";
import { documentLabel, type PageDocument } from "./model";

const CHANGED = "This item changed. Cancel and review the latest version before trying again.";

/** Page dialogs retain their refusal wording; unknown writes use the existing recovery explanation. */
function pageAttemptMessages(outcome: Outcome<unknown> | undefined, otherwise: string): string[] {
  switch (outcome?.kind) {
    case undefined:
    case "landed":
      return [];
    case "unknown":
      return [
        "We couldn’t tell whether that went through. Check your connection, then check again before you try again.",
      ];
    case "signed-out":
      return ["Your session has ended. Sign in again, then try again."];
    case "conflict":
      return [outcome.message ?? CHANGED];
    case "forbidden":
      return [outcome.message ?? otherwise];
    case "invalid":
      return outcome.errors.length
        ? outcome.errors.map((item) => `${pageFieldLabel(item.field)}: ${item.message}`)
        : [otherwise];
    case "refused":
      return [outcome.code === "page_dialog_conflict" ? (outcome.message ?? CHANGED) : otherwise];
    case "missing":
      return [otherwise];
  }
}

/** Create a page in Preview, then hand its id over once the API has it. */
function useCreatePage(api: EditorApi, onDone: (id: string) => void, input: string) {
  const client = useQueryClient();
  const create = useWrite(api, writes.createPage);
  // Only the UI snapshot: retries belong to the shared attempt.
  const submitted = useRef<string>(undefined);
  const adopted = useRef(false);
  const created = create.outcome?.kind === "landed" ? create.outcome.answer : undefined;

  useLayoutEffect(() => {
    if (!created || adopted.current) return;
    adopted.current = true;
    client.setQueryData(pageQuery(api, created.id).queryKey, created);

    if (input === submitted.current) onDone(created.id);
  }, [created, api, client, input, onDone]);

  return {
    outcome: create.outcome,
    isPending: create.state === "sending" || create.state === "checking",
    unsettled: create.state === "unsettled",
    mutate: (page: CreatePageInput) => {
      if (created) return;
      void create.press(() => {
        submitted.current = input;

        return page;
      });
    },
    createdNotice: created && (
      <div role="status">
        The page was created. Your newer input is still here and has not been saved. Copy it before
        opening the page.<Button onClick={() => onDone(created.id)}>Open created page</Button>
      </div>
    ),
  };
}

/**
 * A create dialog's problems, each on its field: its own check's, then the API's refusals of the same fields, until
 * that field changes. Once a check or a refusal shows them, the first field with one takes the focus, so it's read out
 * with its error, as CategoryDialog's are. `controls` are its fields by the API's names for them, in order.
 */
function useFieldProblems(
  controls: ReadonlyMap<string, RefObject<HTMLElement | null>>,
  outcome: Outcome<unknown> | undefined,
) {
  const [found, setFound] = useState<ReadonlyMap<string, string>>(new Map());
  const [changed, setChanged] = useState<ReadonlySet<string>>(new Set());
  const [checks, setChecks] = useState(0);
  const refused = outcome?.kind === "invalid" ? outcome.errors : [];

  const errorOf = (field: string) =>
    changed.has(field)
      ? undefined
      : (found.get(field) ?? refused.find((item) => item.field === field)?.message);

  // As problems show, not as each one goes
  useLayoutEffect(() => {
    [...controls].find(([field]) => errorOf(field))?.[1].current?.focus();
  }, [checks, outcome]);

  return {
    errorOf,
    /** Shows a check's problems by field, in place of the last's, and says whether there were none. */
    check: (problems: ReadonlyMap<string, string>) => {
      setFound(problems);
      setChanged(new Set());
      setChecks((count) => count + 1);

      return problems.size === 0;
    },
    /** Each of these fields has changed, so its problem goes. */
    change: (...fields: string[]) => setChanged((old) => new Set([...old, ...fields])),
    /** What no field shows: a refusal of another field, or of the request as a whole. */
    unshown: refused.length
      ? refused
          .filter((item) => !controls.has(item.field))
          .map((item) => `${pageFieldLabel(item.field)}: ${item.message}`)
      : pageAttemptMessages(outcome, "The page could not be created. Try again."),
  };
}

function PathField({
  value,
  onChange,
  readOnly = false,
  error,
  ref,
}: {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  error?: string;
  ref?: Ref<HTMLInputElement>;
}) {
  return (
    <Field label="Path" error={error}>
      <Input
        ref={ref}
        value={value}
        readOnly={readOnly}
        spellCheck={false}
        autoCapitalize="off"
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

/** Creates a preview-only service entry page. Blocks dismissal while the API request is pending. */
export function CreateRemoteServiceDialog({
  api,
  open,
  onClose,
  onDone,
}: {
  api: EditorApi;
  /** Shown; closed, it fades away as it was. Each opening is a new dialog. */
  open: boolean;
  onClose: () => void;
  onDone: (id: string) => void;
}) {
  const categories = useQuery(categoriesQuery(api)).data ?? [];
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [edited, setEdited] = useState<string>();
  const create = useCreatePage(api, onDone, JSON.stringify({ title, categoryId, edited }));
  const category = categories.find((item) => item.id === categoryId);
  const path = edited ?? suggestedUrl(category?.url ?? "", title);
  const titleControl = useRef<HTMLInputElement>(null);
  const categoryControl = useRef<HTMLSelectElement>(null);
  const pathControl = useRef<HTMLInputElement>(null);

  const problems = useFieldProblems(
    new Map<string, RefObject<HTMLElement | null>>([
      ["title", titleControl],
      ["category_id", categoryControl],
      ["url", pathControl],
    ]),
    create.outcome,
  );

  // Until it's edited, the path follows the name and the category, so it changes with them
  const follows = edited === undefined ? ["url"] : [];

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Create a service"
      description="The service starts in Preview. Add its start page and supporting pages once it exists."
      pending={create.isPending}
      onSubmit={() => {
        const found = new Map<string, string>();
        const badPath = urlProblem(path);

        if (!title.trim()) found.set("title", "Enter a service name");

        if (!category) found.set("category_id", "Choose a category");

        if (badPath) found.set("url", badPath);

        if (create.unsettled || (problems.check(found) && category))
          create.mutate({
            url: path,
            title: title.trim(),
            category_id: category?.id,
            visibility: "preview",
            body_markdown: "",
            // /services lists only alpha services (#3244).
            frontmatter: { stage: "alpha" },
          });
      }}
      actions={
        <Button
          type="submit"
          variant="accent"
          size="md"
          pending={create.isPending}
          pendingLabel="Creating service…"
        >
          {create.unsettled ? "Check again" : "Create service"}
        </Button>
      }
    >
      <Field label="Service name" error={problems.errorOf("title")}>
        <Input
          ref={titleControl}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            problems.change("title", ...follows);
          }}
        />
      </Field>
      <Field label="Category" error={problems.errorOf("category_id")}>
        <NativeSelect
          ref={categoryControl}
          value={categoryId}
          onChange={(event) => {
            setCategoryId(event.target.value);
            problems.change("category_id", ...follows);
          }}
        >
          <option value="">Choose a category</option>
          {categoryRows(categories).map((item) => (
            <option key={item.id} value={item.id}>
              {item.parent_id
                ? `- ${categoryLabel(item, categories)}`
                : categoryLabel(item, categories)}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <PathField
        ref={pathControl}
        value={path}
        error={problems.errorOf("url")}
        onChange={(value) => {
          setEdited(value);
          problems.change("url");
        }}
      />
      {create.createdNotice}
      <ApiProblems messages={problems.unshown} />
    </FormDialog>
  );
}

/** Creates a preview-only start or supporting page. Blocks dismissal while the API request is pending. */
export function CreateRemotePageDialog({
  api,
  open,
  detail,
  onClose,
  onDone,
}: {
  api: EditorApi;
  /** Shown; closed, it fades away as it was. Each opening is a new dialog. */
  open: boolean;
  detail: ServiceDetail;
  onClose: () => void;
  onDone: (id: string) => void;
}) {
  const entry = detail.service;
  const hasStart = detail.pages.some((page) => page.role === "start");
  const [kind, setKind] = useState(hasStart ? "supporting" : "start");
  const [title, setTitle] = useState("");
  const [edited, setEdited] = useState<string>();
  const create = useCreatePage(api, onDone, JSON.stringify({ title, kind, edited }));
  const start = kind === "start";
  const name = title.trim() || (start ? "Before you start" : "");
  const path = start ? `${entry.url}/start` : (edited ?? suggestedUrl(entry.url, title));
  const titleControl = useRef<HTMLInputElement>(null);
  const pathControl = useRef<HTMLInputElement>(null);

  const problems = useFieldProblems(
    new Map([
      ["title", titleControl],
      ["url", pathControl],
    ]),
    create.outcome,
  );

  // Until it's edited, the path follows the title and the page's type, so it changes with them
  const follows = start || edited === undefined ? ["url"] : [];

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Add a page"
      description="The page starts in Preview beneath this service’s entry page."
      pending={create.isPending}
      onSubmit={() => {
        const found = new Map<string, string>();
        const badPath = urlProblem(path);

        if (!name) found.set("title", "Enter a page title");

        if (badPath) found.set("url", badPath);

        if (create.unsettled || problems.check(found))
          create.mutate({
            url: path,
            title: name,
            parent_id: entry.id,
            visibility: "preview",
            body_markdown: "",
          });
      }}
      actions={
        <Button
          type="submit"
          variant="accent"
          size="md"
          pending={create.isPending}
          pendingLabel="Adding page…"
        >
          {create.unsettled ? "Check again" : "Add page"}
        </Button>
      }
    >
      <Field label="Document type">
        <NativeSelect
          value={kind}
          onChange={(event) => {
            setKind(event.target.value);
            problems.change("title", "url");
          }}
        >
          {!hasStart && <option value="start">Start page</option>}
          <option value="supporting">Supporting page</option>
        </NativeSelect>
      </Field>
      <Field
        label={start ? "Page title (optional)" : "Page title"}
        error={problems.errorOf("title")}
      >
        <Input
          ref={titleControl}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            problems.change("title", ...follows);
          }}
        />
      </Field>
      <PathField
        ref={pathControl}
        value={path}
        readOnly={start}
        error={problems.errorOf("url")}
        onChange={(value) => {
          setEdited(value);
          problems.change("url");
        }}
      />
      {create.createdNotice}
      <ApiProblems messages={problems.unshown} />
    </FormDialog>
  );
}

/** Remove a page from the content API, once its author confirms. */
export function DeleteRemotePageDialog({
  api,
  open,
  page: initialPage,
  onClose,
  onDone,
  focusAfter,
}: {
  api: EditorApi;
  /** Shown; closed, it fades away as it was. Each opening is a new dialog. */
  open: boolean;
  page: PageDocument & { version: number };
  onClose: () => void;
  onDone: () => void;
  /** Where the focus goes once the page has gone, as the editor leaves it and its Delete page may go too. */
  focusAfter: RefObject<HTMLElement | null>;
}) {
  const [page] = useState(initialPage);
  const deleted = useRef(false);
  const remove = useWrite(api, writes.deletePage);

  useLayoutEffect(() => {
    if (remove.outcome?.kind !== "landed" || deleted.current) return;
    deleted.current = true;
    // The editor leaves the page, so say it went
    toast("Page deleted");
    onDone();
  }, [remove.outcome, onDone]);

  const messages = pageAttemptMessages(remove.outcome, "The page could not be deleted. Try again.");

  // A service is its entry page: deleting that page deletes the service
  const service = page.role === "entry";

  // An alert dialog: a stray click outside doesn't dismiss it, and it can't be closed while the page is going
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={service ? "Delete this service?" : "Delete this page?"}
      description={
        service
          ? `${documentLabel(page)} is this service’s entry page, so deleting it deletes the service. It’s removed from the content API and, if it’s public, from the site. Any unsaved changes will be lost.`
          : `${documentLabel(page)} is removed from the content API and, if it is public, from the site. Any unsaved changes will be lost.`
      }
      confirmLabel={
        remove.state === "unsettled" ? "Check again" : service ? "Delete service" : "Delete page"
      }
      pendingLabel={service ? "Deleting service…" : "Deleting page…"}
      pending={remove.state === "sending" || remove.state === "checking"}
      finalFocus={() => (deleted.current ? focusAfter.current : true)}
      error={messages.length > 0 && <ApiProblemText messages={messages} />}
      onConfirm={() => {
        if (!deleted.current) void remove.press(() => ({ id: page.id, version: page.version }));
      }}
    />
  );
}
