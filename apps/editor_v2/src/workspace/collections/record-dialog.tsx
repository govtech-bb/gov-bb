import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type RefObject } from "react";
import {
  ApiFailure,
  type Collection,
  type CollectionRecord,
  type EditorApi,
} from "../../api/client";
import { apiFailureMessages } from "../../api/failure-messages";
import { collectionQuery } from "../../api/queries";
import { download } from "../../host/source-ui";
import { Banner } from "../../ui/banner";
import { Button } from "../../ui/button";
import { ConfirmDialog } from "../../ui/confirm-dialog";
import { Field } from "../../ui/field";
import { Input } from "../../ui/input";
import { toast } from "../../ui/toast";
import { ApiProblems, ApiProblemText } from "../api-problems";
import { WorkspaceDialog } from "../workspace-dialog";
import {
  keyProblem,
  recordData,
  recordValues,
  valuesDiffer,
  withRecord,
  type RecordValues,
} from "./records";

type FieldKind = Collection["schema"]["fields"][number]["type"];

const NEWER = "A newer version of this record has been saved since you opened it.";

const GONE =
  "This record has been deleted, so your changes can't be saved. Download a copy to keep them.";

/** A refusal the content API answered with its `error`, such as `conflict`. */
const refusedWith = (error: Error | null, status: number, code?: string) =>
  error instanceof ApiFailure && error.status === status && (!code || error.code === code);

/**
 * Add a record to a collection, or change one: a field per entry in the collection's field list, under its label.
 * Saving is explicit and replaces the whole record. The dialog keeps what was typed through every failure: a field the
 * content API refuses shows its reason under it, and a newer version saved meanwhile offers to keep this version,
 * load the saved one or download this one, as a page does.
 */
export function RecordDialog({
  api,
  collection,
  record,
  readOnly = false,
  close,
}: {
  api: EditorApi;
  collection: Collection;
  /** The record as it was read when the dialog opened; none to add one. */
  record?: CollectionRecord;
  /** Someone without the editor role can read the record but not save it. */
  readOnly?: boolean;
  close: () => void;
}) {
  const client = useQueryClient();
  const query = collectionQuery(api, collection.key);
  const current = useQuery(query);
  // The version a save is sent over: the one opened, until the author keeps theirs over a newer one or loads it
  const [base, setBase] = useState(record);
  const [values, setValues] = useState<RecordValues>(() => recordValues(collection, record));
  const [keyError, setKeyError] = useState<string>();
  const fields = collection.schema.fields;
  const keyListed = fields.some((field) => field.key === collection.record_key);
  const recordKey = base?.record_key ?? (values[collection.record_key] ?? "").trim();

  const save = useMutation({
    mutationFn: (data: ReturnType<typeof recordData>) =>
      base
        ? api.saveRecord(collection.key, base.record_key, data, base.updated_at)
        : api.createRecord(collection.key, recordKey, data),
    onSuccess: (saved) => {
      client.setQueryData(
        query.queryKey,
        (old) => old && { ...old, records: withRecord(old.records, saved) },
      );
      void client.invalidateQueries({ queryKey: ["content"] });
      toast(base ? "Record saved" : "Record added");
      close();
    },
    onError: (error) => {
      // Someone else changed or deleted it: read it again, so the dialog can say which
      if (refusedWith(error, 409, "conflict") || refusedWith(error, 404))
        void client.invalidateQueries({ queryKey: query.queryKey });
    },
  });

  // The saved version now, from the collection as last read
  const latest = base && current.data?.records.find((item) => item.record_key === base.record_key);

  const gone =
    !!base && ((!!current.data && !current.isFetching && !latest) || refusedWith(save.error, 404));

  const stale =
    !gone &&
    !!base &&
    ((!!latest && latest.updated_at !== base.updated_at) ||
      refusedWith(save.error, 409, "conflict"));

  const unsaved = !base || valuesDiffer(collection, values, base);
  const failure = save.error instanceof ApiFailure ? save.error : undefined;
  // Fastify's own 400s, for a request it couldn't read, are not a field's refusal
  const rejected = failure?.status === 400 && failure.code === "validation_failed";

  const fieldErrors = new Map(
    rejected ? failure.errors.map((item) => [item.field, item.message]) : [],
  );

  const taken = refusedWith(save.error, 409, "record_exists")
    ? "Another record already has this key"
    : undefined;

  // Refusals about a value the dialog doesn't show, such as a field the collection no longer lists
  const unshown = rejected
    ? failure.errors
        .filter((item) => !fields.some((field) => field.key === item.field))
        .map((item) => item.message)
    : [];

  const otherProblems =
    rejected || taken || gone || stale
      ? []
      : apiFailureMessages(
          save.error,
          "The record could not be saved. Try again.",
          (field) => field,
        );

  const downloadMine = () =>
    download(
      JSON.stringify(recordData(collection, values, base), null, 2),
      `${recordKey || collection.key}.json`,
    );

  // Save the next change over the saved version, keeping what's typed
  const keepMine = () => {
    if (!latest) return;
    setBase(latest);
    save.reset();
  };

  const loadSaved = () => {
    if (!latest) return;
    setBase(latest);
    setValues(recordValues(collection, latest));
    save.reset();
  };

  const submit = () => {
    if (readOnly || stale || gone || save.isPending) return;
    const problem = base ? undefined : keyProblem(recordKey);

    setKeyError(problem);

    if (!problem) save.mutate(recordData(collection, values, base));
  };

  const keyHint = base
    ? "A record keeps its key."
    : "Lower-case letters, numbers and hyphens, such as barbados-drug-service. It can't be changed later.";

  // An email address is checked by api_v2, whose reason shows under the field, not by the browser's own bubble
  const input = (
    key: string,
    label: string,
    kind: FieldKind,
    hint: string | undefined,
    error: string | undefined,
  ) => (
    <Field key={key} label={label} hint={hint} error={error}>
      <Input
        value={values[key] ?? ""}
        readOnly={readOnly || (key === collection.record_key && !!base)}
        inputMode={kind === "email" ? "email" : undefined}
        spellCheck={kind === "text" ? undefined : false}
        autoCapitalize={kind === "text" ? undefined : "off"}
        onChange={(event) => {
          const value = event.target.value;

          setValues((old) => ({ ...old, [key]: value }));
        }}
      />
    </Field>
  );

  return (
    <WorkspaceDialog
      title={base ? `Edit ${base.record_key}` : "Add a record"}
      description={`${collection.title}. Saving changes every page that shows this record.`}
      close={close}
      onSubmit={submit}
      body={
        <div className="flex flex-col gap-4">
          {gone ? (
            <Banner
              tone="error"
              role="alert"
              actions={<Button onClick={downloadMine}>Download my version</Button>}
            >
              {GONE}
            </Banner>
          ) : (
            stale && (
              <Banner
                tone="warning"
                role="alert"
                actions={
                  <>
                    {unsaved && (
                      <Button
                        variant="secondary"
                        disabled={!latest || current.isFetching}
                        onClick={keepMine}
                      >
                        Keep my version
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      disabled={!latest || current.isFetching}
                      onClick={loadSaved}
                    >
                      Load saved version
                    </Button>
                    {unsaved && <Button onClick={downloadMine}>Download my version</Button>}
                  </>
                }
              >
                {NEWER}
              </Banner>
            )
          )}
          {!keyListed && input(collection.record_key, "Key", "slug", keyHint, keyError ?? taken)}
          {fields.map((field) => {
            const isKey = field.key === collection.record_key;

            return input(
              field.key,
              isKey ? field.label : `${field.label} (optional)`,
              field.type,
              isKey ? keyHint : undefined,
              (isKey ? (keyError ?? taken) : undefined) ?? fieldErrors.get(field.key),
            );
          })}
          <ApiProblems messages={[...unshown, ...otherProblems]} />
        </div>
      }
      footer={
        <>
          <Button size="md" onClick={close}>
            Cancel
          </Button>
          {!readOnly && (
            <Button
              type="submit"
              variant="accent"
              size="md"
              pending={save.isPending}
              disabled={stale || gone}
            >
              {save.isPending ? "Saving…" : base ? "Save changes" : "Add record"}
            </Button>
          )}
        </>
      }
    />
  );
}

/** Delete a record, once its author confirms, at the version they read. */
export function DeleteRecordDialog({
  api,
  collection,
  record,
  close,
  focusAfter,
}: {
  api: EditorApi;
  collection: Collection;
  record: CollectionRecord;
  close: () => void;
  /** Where the focus goes once the record, and the button that opened this, has gone. */
  focusAfter: RefObject<HTMLElement | null>;
}) {
  const client = useQueryClient();
  const query = collectionQuery(api, collection.key);
  const deleted = useRef(false);

  const remove = useMutation({
    mutationFn: () => api.deleteRecord(collection.key, record.record_key, record.updated_at),
    onSuccess: () => {
      client.setQueryData(
        query.queryKey,
        (old) =>
          old && {
            ...old,
            records: old.records.filter((item) => item.record_key !== record.record_key),
          },
      );
      void client.invalidateQueries({ queryKey: ["content"] });
      toast("Record deleted");
      deleted.current = true;
      close();
    },
    onError: () => void client.invalidateQueries({ queryKey: query.queryKey }),
  });

  const error = remove.error;

  const messages = refusedWith(error, 409, "conflict")
    ? [
        "This record has changed since you opened it. Cancel, check its values, then delete it again.",
      ]
    : refusedWith(error, 404)
      ? ["This record has already been deleted."]
      : apiFailureMessages(error, "The record could not be deleted. Try again.", (field) => field);

  return (
    <ConfirmDialog
      open
      onClose={close}
      title={`Delete ${record.record_key}?`}
      description={`It's removed from ${collection.title}, and from every page that shows it. This can't be undone.`}
      confirm="Delete record"
      pendingLabel="Deleting record…"
      pending={remove.isPending}
      // Cancelled, the focus goes back to the row's Delete; deleted, that row has gone
      finalFocus={() => (deleted.current ? focusAfter.current : true)}
      error={error && <ApiProblemText messages={messages} />}
      onConfirm={() => remove.mutate()}
    />
  );
}
