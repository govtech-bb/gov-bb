import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { categoryLabel, categoryRows } from "../api/categories";
import type { EditorApi, CreatePageInput, ServiceDetail } from "../api/client";
import { suggestedUrl, urlProblem, pageFieldLabel } from "../api/page-markdown";
import { categoriesQuery, pageQuery } from "../api/queries";
import type { PageApiFailure, PageEditLockToken } from "../api/page-schemas";
import type { ApiPage } from "../api/client";
import type { PageSession } from "./page-sync";
import { Button } from "../ui/button";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { Field } from "../ui/field";
import { Input } from "../ui/input";
import { NativeSelect } from "../ui/native-select";
import { toast } from "../ui/toast";
import { WorkspaceDialog } from "./workspace-dialog";
import { ApiProblems, ApiProblemText } from "./api-problems";
import { documentLabel, type PageDocument } from "./model";

/** Create a page as a draft, then hand its id over once the API has it. */
function useCreatePage(api: EditorApi, done: (id: string) => void) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (page: CreatePageInput) => api.createPage(page),
    onSuccess: (result) => {
      if (!result.ok) return;
      const page = result.value;
      client.setQueryData(pageQuery(api, page.id).queryKey, page);
      void client.invalidateQueries({ queryKey: ["content"] });
      done(page.id);
    },
  });
}

/** Why the API refused a change, as messages an author can act on. */
function refusals(error: PageApiFailure | undefined, otherwise: string) {
  if (!error) return [];

  switch (error.kind) {
    case "invalid":
      return error.errors.length
        ? error.errors.map((item) => `${pageFieldLabel(item.field)}: ${item.message}`)
        : [otherwise];
    case "signed-out":
      return ["Your session has ended. Sign in again, then try again."];
    case "forbidden":
      return ["You no longer have permission to change this page."];
    case "missing":
      return ["This page is no longer available."];
    case "version-conflict":
      return [
        "This page changed after you reviewed it. Cancel, reload the page, then confirm again.",
      ];
    case "lock-required":
    case "lock-lost":
    case "lock-conflict":
      return [
        "Editing ownership changed. Cancel and confirm your editing lock before trying again.",
      ];
    case "outcome-unknown":
      return [
        "The server may have completed this request. Cancel and check the saved pages before trying again. Your open working copy is unchanged.",
      ];
    case "unavailable":
    case "invalid-response":
      return [otherwise];
    default: {
      const unexpected: never = error;
      throw unexpected;
    }
  }
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

/** A new service in the content API: a draft entry page filed under a category. */
export function CreateRemoteServiceDialog({
  api,
  close,
  done,
}: {
  api: EditorApi;
  close: () => void;
  done: (id: string) => void;
}) {
  const categories = useQuery(categoriesQuery(api)).data ?? [];
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [edited, setEdited] = useState<string>();
  const [problems, setProblems] = useState<string[]>([]);
  const create = useCreatePage(api, done);

  const creationUncertain =
    create.data?.ok === false && create.data.error.kind === "outcome-unknown";

  const category = categories.find((item) => item.id === categoryId);
  const path = edited ?? suggestedUrl(category?.url ?? "", title);

  return (
    <WorkspaceDialog
      title="Create a service"
      description="The service starts as a draft entry page. Add its start page and supporting pages once it exists."
      close={close}
      onSubmit={() => {
        if (create.isPending || creationUncertain) return;
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
              ...refusals(
                create.data?.ok === false ? create.data.error : undefined,
                "The page could not be created. Try again.",
              ),
            ]}
          />
        </>
      }
      footer={
        <>
          <Button size="md" onClick={close}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="accent"
            size="md"
            pending={create.isPending}
            disabled={creationUncertain}
          >
            {create.isPending ? "Creating service…" : "Create service"}
          </Button>
        </>
      }
    />
  );
}

/** A new draft page beneath a service's entry page: its start page or a supporting page. */
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

  const creationUncertain =
    create.data?.ok === false && create.data.error.kind === "outcome-unknown";

  const start = kind === "start";
  const name = title.trim() || (start ? "Before you start" : "");
  const path = start ? `${entry.url}/start` : (edited ?? suggestedUrl(entry.url, title));

  return (
    <WorkspaceDialog
      title="Add a page"
      description="The page starts as a draft beneath this service's entry page."
      close={close}
      onSubmit={() => {
        if (create.isPending || creationUncertain) return;
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
          <ApiProblems
            messages={[
              ...problems,
              ...refusals(
                create.data?.ok === false ? create.data.error : undefined,
                "The page could not be created. Try again.",
              ),
            ]}
          />
        </>
      }
      footer={
        <>
          <Button size="md" onClick={close}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="accent"
            size="md"
            pending={create.isPending}
            disabled={creationUncertain}
          >
            {create.isPending ? "Adding page…" : "Add page"}
          </Button>
        </>
      }
    />
  );
}

/** Confirm deletion against the active editor's reviewed version and acquisition, not sidebar metadata. */
export function DeleteRemotePageDialog({
  api,
  page,
  session,
  close,
  done,
}: {
  api: EditorApi;
  page: PageDocument;
  session: PageSession;
  close: () => void;
  done: () => void;
}) {
  const client = useQueryClient();

  const [reviewed] = useState(() => {
    const token = session.getEditLockToken();

    return token ? { page: session.getBaseline().page, token } : undefined;
  });

  const remove = useMutation({
    mutationFn: (selection: { page: ApiPage; token: PageEditLockToken }) =>
      api.deletePage(selection.page.id, selection.page.version, selection.token),
    onSuccess: (result) => {
      if (!result.ok) {
        if (result.error.kind === "version-conflict")
          void client.invalidateQueries({ queryKey: pageQuery(api, page.id).queryKey });

        return;
      }

      void client.invalidateQueries({ queryKey: ["content"] });
      toast("Page deleted");
      done();
    },
  });

  const failure = remove.data?.ok === false ? remove.data.error : undefined;
  const requiresReview = failure && failure.kind !== "invalid";

  const canDelete =
    reviewed &&
    reviewed.page.id === page.id &&
    !session.isSaving() &&
    reviewed.page.version === session.getBaseline().page.version &&
    reviewed.token === session.getEditLockToken() &&
    !requiresReview;

  const service = page.role === "entry";
  const title = reviewed?.page.title ?? documentLabel(page);

  return (
    <ConfirmDialog
      open
      onClose={close}
      title={service ? "Delete this service?" : "Delete this page?"}
      description={
        service
          ? `${title} is this service's entry page, so deleting it deletes the service. It's removed from the content API and, if it's public, from the site. Any unsaved changes will be lost.`
          : `${title} is removed from the content API and, if it is public, from the site. Any unsaved changes will be lost.`
      }
      confirm={service ? "Delete service" : "Delete page"}
      confirmDisabled={!canDelete}
      pendingLabel={service ? "Deleting service…" : "Deleting page…"}
      pending={remove.isPending}
      error={
        failure && (
          <ApiProblemText
            messages={refusals(failure, "The page could not be deleted. Try again.")}
          />
        )
      }
      onConfirm={() => {
        if (canDelete && reviewed && !remove.isPending) remove.mutate(reviewed);
      }}
    />
  );
}
