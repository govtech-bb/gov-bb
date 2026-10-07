import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { ApiFailure, type EditorApi, type NewPage, type ServiceDetail } from "../api/client";
import { suggestedUrl, urlProblem } from "../api/page-markdown";
import { pageQuery, taxonomyQuery } from "../api/queries";
import { Button } from "../ui/button";
import { fieldLabel } from "./api-pages";
import { inputClass, WorkspaceDialog } from "./dialogs";
import { documentLabel, type PageDocument } from "./model";

/** Create a page as a draft, then hand its id over once the API has it. */
function useCreatePage(api: EditorApi, done: (id: string) => void) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (page: NewPage) => api.createPage(page),
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

  return error.errors.map((item) => `${fieldLabel(item.field)}: ${item.message}`);
}

function Problems({ messages }: { messages: readonly string[] }) {
  return messages.map((message) => (
    <p key={message} role="alert" className="mt-3 text-error">
      {message}
    </p>
  ));
}

function PathField({
  id,
  value,
  onChange,
  readOnly = false,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}) {
  return (
    <>
      <label htmlFor={id} className="mb-2 mt-4 block font-semibold">
        Path
      </label>
      <input
        id={id}
        className={inputClass}
        value={value}
        readOnly={readOnly}
        spellCheck={false}
        autoCapitalize="off"
        onChange={(event) => onChange(event.target.value)}
      />
    </>
  );
}

/** A new service in the content API: a draft entry page filed under a category. */
export function ApiServiceDialog({
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
  const id = useId();
  const category = categories.find((item) => item.id === categoryId);
  const path = edited ?? suggestedUrl(category?.url ?? "", title);

  return (
    <WorkspaceDialog
      title="Create a service"
      description="The service starts as a draft entry page. Add its start page and supporting pages once it exists."
      close={close}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();

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
              visibility: "draft",
              body_markdown: "",
            });
        }}
      >
        <label htmlFor={`${id}-title`} className="mb-2 block font-semibold">
          Service name
        </label>
        <input
          id={`${id}-title`}
          className={inputClass}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <label htmlFor={`${id}-category`} className="mb-2 mt-4 block font-semibold">
          Category
        </label>
        <select
          id={`${id}-category`}
          className={inputClass}
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
        >
          <option value="">Choose a category</option>
          {categories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.parent_id ? `— ${item.title}` : item.title}
            </option>
          ))}
        </select>
        <PathField id={`${id}-path`} value={path} onChange={setEdited} />
        <Problems
          messages={[
            ...problems,
            ...refusals(create.error, "The page could not be created. Try again."),
          ]}
        />
        <div className="mt-5 flex gap-2">
          <Button type="submit" variant="accent" size="lg" disabled={create.isPending}>
            Create service
          </Button>
          <Button size="lg" onClick={close}>
            Cancel
          </Button>
        </div>
      </form>
    </WorkspaceDialog>
  );
}

/** A new draft page beneath a service's entry page: its start page or a supporting page. */
export function ApiPageDialog({
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
  const id = useId();
  const start = kind === "start";
  const name = title.trim() || (start ? "Before you start" : "");
  const path = start ? `${entry.url}/start` : (edited ?? suggestedUrl(entry.url, title));

  return (
    <WorkspaceDialog
      title="Add a page"
      description="The page starts as a draft beneath this service's entry page. Forms stay in this browser's drafts."
      close={close}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();

          const badPath = urlProblem(path);
          const found = [...(name ? [] : ["Enter a page title"]), ...(badPath ? [badPath] : [])];

          setProblems(found);

          if (found.length === 0)
            create.mutate({
              url: path,
              title: name,
              parent_id: entry.id,
              visibility: "draft",
              body_markdown: "",
            });
        }}
      >
        <label htmlFor={`${id}-kind`} className="mb-2 block font-semibold">
          Document type
        </label>
        <select
          id={`${id}-kind`}
          className={inputClass}
          value={kind}
          onChange={(event) => setKind(event.target.value)}
        >
          {!hasStart && <option value="start">Start page</option>}
          <option value="supporting">Supporting page</option>
        </select>
        <label htmlFor={`${id}-title`} className="mb-2 mt-4 block font-semibold">
          {start ? "Page title (optional)" : "Page title"}
        </label>
        <input
          id={`${id}-title`}
          className={inputClass}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <PathField id={`${id}-path`} value={path} onChange={setEdited} readOnly={start} />
        <Problems
          messages={[
            ...problems,
            ...refusals(create.error, "The page could not be created. Try again."),
          ]}
        />
        <div className="mt-5 flex gap-2">
          <Button type="submit" variant="accent" size="lg" disabled={create.isPending}>
            Add page
          </Button>
          <Button size="lg" onClick={close}>
            Cancel
          </Button>
        </div>
      </form>
    </WorkspaceDialog>
  );
}

/** Remove a page from the content API, once its author confirms. */
export function DeletePageDialog({
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
      done();
    },
  });

  return (
    <WorkspaceDialog
      title="Delete this page"
      description={`${documentLabel(page)} is removed from the content API and, if it is public, from the site. Its draft in this browser is kept.`}
      close={close}
    >
      <Problems messages={refusals(remove.error, "The page could not be deleted. Try again.")} />
      <div className="mt-5 flex gap-2">
        <Button
          variant="accent"
          size="lg"
          disabled={remove.isPending}
          onClick={() => remove.mutate()}
        >
          Delete page
        </Button>
        <Button size="lg" onClick={close}>
          Cancel
        </Button>
      </div>
    </WorkspaceDialog>
  );
}
