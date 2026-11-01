import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLayoutEffect, useRef, useState, type Ref, type RefObject } from "react";
import { categoryLabel, categoryRows } from "../api/categories";
import {
  ApiFailure,
  type EditorApi,
  type CreatePageInput,
  type ServiceDetail,
} from "../api/client";
import { apiFailureMessages } from "../api/failure-messages";
import { suggestedUrl, urlProblem, pageFieldLabel } from "../api/page-markdown";
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

/** Create a page in Preview, then hand its id over once the API has it. */
function useCreatePage(api: EditorApi, onDone: (id: string) => void) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (page: CreatePageInput) => api.createPage(page),
    onSuccess: (page) => {
      client.setQueryData(pageQuery(api, page.id).queryKey, page);
      void client.invalidateQueries({ queryKey: ["content"] });
      onDone(page.id);
    },
  });
}

/**
 * A create dialog's problems, each on its field: its own check's, then the API's refusals of the same fields, until
 * that field changes. Once a check or a refusal shows them, the first field with one takes the focus, so it's read out
 * with its error, as CategoryDialog's are. `controls` are its fields by the API's names for them, in order.
 */
function useFieldProblems(
  controls: ReadonlyMap<string, RefObject<HTMLElement | null>>,
  error: Error | null,
) {
  const [found, setFound] = useState<ReadonlyMap<string, string>>(new Map());
  const [changed, setChanged] = useState<ReadonlySet<string>>(new Set());
  const [checks, setChecks] = useState(0);
  const refused = error instanceof ApiFailure ? error.errors : [];

  const errorOf = (field: string) =>
    changed.has(field)
      ? undefined
      : (found.get(field) ?? refused.find((item) => item.field === field)?.message);

  // As problems show, not as each one goes
  useLayoutEffect(() => {
    [...controls].find(([field]) => errorOf(field))?.[1].current?.focus();
  }, [checks, error]);

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
      : apiFailureMessages(error, "The page could not be created. Try again.", pageFieldLabel),
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
  const create = useCreatePage(api, onDone);
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
    create.error,
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

        if (problems.check(found) && category)
          create.mutate({
            url: path,
            title: title.trim(),
            category_id: category.id,
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
          Create service
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
  const create = useCreatePage(api, onDone);
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
    create.error,
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

        if (problems.check(found))
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
          Add page
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
      <ApiProblems messages={problems.unshown} />
    </FormDialog>
  );
}

/** Remove a page from the content API, once its author confirms. */
export function DeleteRemotePageDialog({
  api,
  open,
  page,
  onClose,
  onDone,
  focusAfter,
}: {
  api: EditorApi;
  /** Shown; closed, it fades away as it was. Each opening is a new dialog. */
  open: boolean;
  page: PageDocument;
  onClose: () => void;
  onDone: () => void;
  /** Where the focus goes once the page has gone, as the editor leaves it and its Delete page may go too. */
  focusAfter: RefObject<HTMLElement | null>;
}) {
  const client = useQueryClient();
  const deleted = useRef(false);

  const remove = useMutation({
    mutationFn: () => api.deletePage(page.id),
    onSuccess: () => {
      deleted.current = true;
      void client.invalidateQueries({ queryKey: ["content"] });
      // The editor leaves the page, so say it went
      toast("Page deleted");
      onDone();
    },
  });

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
      confirmLabel={service ? "Delete service" : "Delete page"}
      pendingLabel={service ? "Deleting service…" : "Deleting page…"}
      pending={remove.isPending}
      finalFocus={() => (deleted.current ? focusAfter.current : true)}
      error={
        remove.error && (
          <ApiProblemText
            messages={apiFailureMessages(
              remove.error,
              "The page could not be deleted. Try again.",
              pageFieldLabel,
            )}
          />
        )
      }
      onConfirm={() => remove.mutate()}
    />
  );
}
