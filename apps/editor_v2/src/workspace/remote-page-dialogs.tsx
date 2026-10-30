import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { categoryLabel, categoryRows } from "../api/categories";
import type { EditorApi, CreatePageInput, ServiceDetail } from "../api/client";
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

function PathField({
  value,
  onChange,
  readOnly = false,
}: {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}) {
  return (
    <Field label="Path">
      <Input
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
  const [problems, setProblems] = useState<string[]>([]);
  const create = useCreatePage(api, onDone);
  const category = categories.find((item) => item.id === categoryId);
  const path = edited ?? suggestedUrl(category?.url ?? "", title);

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
        const badPath = urlProblem(path);

        const found = [
          ...(title.trim() ? [] : ["Enter a service name"]),
          ...(category ? [] : ["Choose a category"]),
          ...(badPath ? [badPath] : []),
        ];

        setProblems(found);

        if (found.length === 0 && category)
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
      <Field label="Service name">
        <Input value={title} onChange={(event) => setTitle(event.target.value)} />
      </Field>
      <Field label="Category">
        <NativeSelect value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
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
      <PathField value={path} onChange={setEdited} />
      <ApiProblems
        messages={[
          ...problems,
          ...apiFailureMessages(
            create.error,
            "The page could not be created. Try again.",
            pageFieldLabel,
          ),
        ]}
      />
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
  const [problems, setProblems] = useState<string[]>([]);
  const create = useCreatePage(api, onDone);
  const start = kind === "start";
  const name = title.trim() || (start ? "Before you start" : "");
  const path = start ? `${entry.url}/start` : (edited ?? suggestedUrl(entry.url, title));

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
        const badPath = urlProblem(path);
        const found = [...(name ? [] : ["Enter a page title"]), ...(badPath ? [badPath] : [])];

        setProblems(found);

        if (found.length === 0)
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
        <NativeSelect value={kind} onChange={(event) => setKind(event.target.value)}>
          {!hasStart && <option value="start">Start page</option>}
          <option value="supporting">Supporting page</option>
        </NativeSelect>
      </Field>
      <Field label={start ? "Page title (optional)" : "Page title"}>
        <Input value={title} onChange={(event) => setTitle(event.target.value)} />
      </Field>
      <PathField value={path} onChange={setEdited} readOnly={start} />
      <ApiProblems
        messages={[
          ...problems,
          ...apiFailureMessages(
            create.error,
            "The page could not be created. Try again.",
            pageFieldLabel,
          ),
        ]}
      />
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
}: {
  api: EditorApi;
  /** Shown; closed, it fades away as it was. Each opening is a new dialog. */
  open: boolean;
  page: PageDocument;
  onClose: () => void;
  onDone: () => void;
}) {
  const client = useQueryClient();

  const remove = useMutation({
    mutationFn: () => api.deletePage(page.id),
    onSuccess: () => {
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
