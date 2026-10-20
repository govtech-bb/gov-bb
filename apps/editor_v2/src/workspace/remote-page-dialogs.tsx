import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ApiFailure,
  type EditorApi,
  type CreatePageInput,
  type ServiceDetail,
} from "../api/client";
import { suggestedUrl, urlProblem, pageFieldLabel } from "../api/page-markdown";
import { pageQuery, taxonomyQuery } from "../api/queries";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { Field } from "../ui/field";
import { Input } from "../ui/input";
import { NativeSelect } from "../ui/native-select";
import { toast } from "../ui/toast";
import { WorkspaceDialog } from "./workspace-dialog";
import { documentLabel, type PageDocument } from "./model";

/** Create a page in Preview, then hand its id over once the API has it. */
function useCreatePage(api: EditorApi, done: (id: string) => void) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (page: CreatePageInput) => api.createPage(page),
    onSuccess: (page) => {
      client.setQueryData(pageQuery(api, page.id).queryKey, page);
      void client.invalidateQueries({ queryKey: ["content"] });
      done(page.id);
    },
  });
}

/** Why the API refused a change, as messages an author can act on. */
function refusals(error: Error | null, otherwise: string) {
  if (!error) return [];

  if (!(error instanceof ApiFailure) || error.status === 0)
    return ["The content API could not be reached. Try again."];

  if (error.status === 401) return ["Your session has ended. Sign in again, then try again."];

  if (error.errors.length === 0) return [otherwise];

  return error.errors.map((item) => `${pageFieldLabel(item.field)}: ${item.message}`);
}

/** One problem as a sentence, several as a list. */
function problemText(messages: readonly string[]) {
  return messages.length === 1 ? (
    messages[0]
  ) : (
    <ul className="list-disc ps-5">
      {messages.map((message) => (
        <li key={message}>{message}</li>
      ))}
    </ul>
  );
}

/** Everything stopping the dialog, read out as one alert. */
function Problems({ messages }: { messages: readonly string[] }) {
  if (messages.length === 0) return null;

  return (
    <Banner tone="error" className="mt-4">
      {problemText(messages)}
    </Banner>
  );
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
    <Field label="Path" className="mt-4">
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

/** A new service in the content API: a preview-only entry page filed under a category. */
export function CreateRemoteServiceDialog({
  api,
  close,
  done,
}: {
  api: EditorApi;
  close: () => void;
  done: (id: string) => void;
}) {
  const categories = useQuery(taxonomyQuery(api)).data ?? [];
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [edited, setEdited] = useState<string>();
  const [problems, setProblems] = useState<string[]>([]);
  const create = useCreatePage(api, done);
  const category = categories.find((item) => item.id === categoryId);
  const path = edited ?? suggestedUrl(category?.url ?? "", title);

  return (
    <WorkspaceDialog
      title="Create a service"
      description="The service starts in Preview. Add its start page and supporting pages once it exists."
      close={close}
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
          });
      }}
      body={
        <>
          <Field label="Service name">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <Field label="Category" className="mt-4">
            <NativeSelect
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              <option value="">Choose a category</option>
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.parent_id ? `— ${item.title}` : item.title}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <PathField value={path} onChange={setEdited} />
          <Problems
            messages={[
              ...problems,
              ...refusals(create.error, "The page could not be created. Try again."),
            ]}
          />
        </>
      }
      footer={
        <>
          <Button size="md" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" variant="accent" size="md" pending={create.isPending}>
            {create.isPending ? "Creating service…" : "Create service"}
          </Button>
        </>
      }
    />
  );
}

/** A new preview-only page beneath a service's entry page: its start page or a supporting page. */
export function CreateRemotePageDialog({
  api,
  detail,
  close,
  done,
}: {
  api: EditorApi;
  detail: ServiceDetail;
  close: () => void;
  done: (id: string) => void;
}) {
  const entry = detail.service;
  const hasStart = detail.pages.some((page) => page.role === "start");
  const [kind, setKind] = useState(hasStart ? "supporting" : "start");
  const [title, setTitle] = useState("");
  const [edited, setEdited] = useState<string>();
  const [problems, setProblems] = useState<string[]>([]);
  const create = useCreatePage(api, done);
  const start = kind === "start";
  const name = title.trim() || (start ? "Before you start" : "");
  const path = start ? `${entry.url}/start` : (edited ?? suggestedUrl(entry.url, title));

  return (
    <WorkspaceDialog
      title="Add a page"
      description="The page starts in Preview beneath this service's entry page."
      close={close}
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
      body={
        <>
          <Field label="Document type">
            <NativeSelect value={kind} onChange={(event) => setKind(event.target.value)}>
              {!hasStart && <option value="start">Start page</option>}
              <option value="supporting">Supporting page</option>
            </NativeSelect>
          </Field>
          <Field label={start ? "Page title (optional)" : "Page title"} className="mt-4">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <PathField value={path} onChange={setEdited} readOnly={start} />
          <Problems
            messages={[
              ...problems,
              ...refusals(create.error, "The page could not be created. Try again."),
            ]}
          />
        </>
      }
      footer={
        <>
          <Button size="md" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" variant="accent" size="md" pending={create.isPending}>
            {create.isPending ? "Adding page…" : "Add page"}
          </Button>
        </>
      }
    />
  );
}

/** Remove a page from the content API, once its author confirms. */
export function DeleteRemotePageDialog({
  api,
  page,
  close,
  done,
}: {
  api: EditorApi;
  page: PageDocument;
  close: () => void;
  done: () => void;
}) {
  const client = useQueryClient();

  const remove = useMutation({
    mutationFn: () => api.deletePage(page.id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["content"] });
      // The editor leaves the page, so say it went
      toast("Page deleted");
      done();
    },
  });

  // A service is its entry page: deleting that page deletes the service
  const service = page.role === "entry";

  // An alert dialog: a stray click outside doesn't dismiss it, and it can't be closed while the page is going
  return (
    <ConfirmDialog
      open
      onClose={close}
      title={service ? "Delete this service?" : "Delete this page?"}
      description={
        service
          ? `${documentLabel(page)} is this service's entry page, so deleting it deletes the service. It's removed from the content API and, if it's public, from the site. Any unsaved changes will be lost.`
          : `${documentLabel(page)} is removed from the content API and, if it is public, from the site. Any unsaved changes will be lost.`
      }
      confirm={service ? "Delete service" : "Delete page"}
      pendingLabel={service ? "Deleting service…" : "Deleting page…"}
      pending={remove.isPending}
      error={
        remove.error &&
        problemText(refusals(remove.error, "The page could not be deleted. Try again."))
      }
      onConfirm={() => remove.mutate()}
    />
  );
}
