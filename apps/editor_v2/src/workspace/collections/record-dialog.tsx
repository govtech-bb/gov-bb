import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type RefObject } from "react";
import {
  ApiFailure,
  outcomeUnknown,
  type Collection,
  type CollectionRecord,
  type EditorApi,
  type RecordDetail,
} from "../../api/client";
import { apiFailureMessages } from "../../api/failure-messages";
import { collectionQuery, recordQuery } from "../../api/queries";
import { download } from "../../host/download";
import { Banner } from "../../ui/banner";
import { Button } from "../../ui/button";
import { ConfirmDialog } from "../../ui/confirm-dialog";
import { Field } from "../../ui/field";
import { FormDialog } from "../../ui/form-dialog";
import { Input } from "../../ui/input";
import { toast } from "../../ui/toast";
import { pressedByTouch } from "../../ui/focus";
import { ApiProblems, ApiProblemText } from "../api-problems";
import { ContentDiff } from "../review-screens";
import {
  droppedFields,
  keyProblem,
  recordData,
  recordValues,
  valuesDiffer,
  withRecord,
  type RecordValues,
} from "./records";

type RecordDialogProps = {
  open?: boolean;
  finalFocus?: Parameters<typeof FormDialog>[0]["finalFocus"];
  api: EditorApi;
  collection: Collection;
  record?: CollectionRecord;
  readOnly?: boolean;
  close: () => void;
};

type RecordAttempt = {
  collection: RecordDetail["collection"];
  record?: RecordDetail["record"];
  key: string;
  data: ReturnType<typeof recordData>;
  values: RecordValues;
};

/** Whether a read shows the save landed: the record moved past the version it was sent over, holding what it sent. */
const saveLanded = (latest: RecordDetail, sent: RecordAttempt) =>
  !!sent.record &&
  latest.record.version !== sent.record.version &&
  !valuesDiffer(latest.collection, sent.values, latest.record);

/**
 * Public list rows are navigation only; editing starts from a private versioned snapshot. One dialog stays open
 * while that loads, so its focus and its way back to the record's row hold from opening to closing.
 */
export function RecordDialog({
  open = true,
  api,
  collection,
  record,
  readOnly = false,
  close,
  finalFocus,
}: RecordDialogProps) {
  const client = useQueryClient();

  // Adding starts from the definition the screen holds; editing waits for the record's version
  const [base, setBase] = useState<Pick<RecordAttempt, "collection" | "record"> | undefined>(
    record ? undefined : { collection },
  );

  const [values, setValues] = useState<RecordValues>({});
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const [keyError, setKeyError] = useState<string>();
  const [checked, setChecked] = useState<RecordValues>();
  const [message, setMessage] = useState("");
  const [observed, setObserved] = useState<RecordDetail>();
  const gate = useRef(false);
  const attempt = useRef<RecordAttempt>(undefined);
  const [reading, setReading] = useState(false);
  // Each time api_v2's copy fills the form, the focus goes to its first field
  const [filled, setFilled] = useState(0);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (filled && !pressedByTouch()) body.current?.querySelector("input")?.focus();
  }, [filled]);
  const shown = base ? base.record : record;
  const title = shown ? `Edit ${shown.record_key}` : "Add a record";

  const current = useQuery({
    ...recordQuery(api, collection.key, shown?.record_key ?? ""),
    enabled: !!shown,
  });

  if (!base && current.data) {
    setBase(current.data);
    setValues(recordValues(current.data.collection, current.data.record));

    // Opened before its record arrived, the dialog has only Cancel to focus
    if (open) setFilled((value) => value + 1);
  }

  const latest = observed ?? current.data;
  const query = collectionQuery(api, collection.key);

  const save = useMutation({
    mutationFn: async (sent: RecordAttempt & { retry?: true }): Promise<RecordDetail> => {
      if (!sent.record)
        return {
          collection: sent.collection,
          record: await api.createRecord(sent.collection.key, sent.key, sent.data),
        };

      // A retried save that landed meanwhile is confirmed, rather than refused as someone else's change
      if (sent.retry) {
        const latest = await api.record(sent.collection.key, sent.key).catch(() => undefined);

        if (latest && saveLanded(latest, sent)) return latest;
      }

      return api.saveRecord(sent.collection.key, sent.key, sent.data, sent.record.version);
    },
    onSuccess: (saved, sent) => {
      setBase(saved);
      setObserved(undefined);
      attempt.current = undefined;
      client.setQueryData(
        recordQuery(api, saved.collection.key, saved.record.record_key).queryKey,
        saved,
      );
      client.setQueryData(
        query.queryKey,
        (old) => old && { ...old, records: withRecord(old.records, saved.record) },
      );
      void client.invalidateQueries({ queryKey: ["content"] });
      toast(sent.record ? "Record saved" : "Record added");

      if (JSON.stringify(valuesRef.current) === JSON.stringify(sent.values)) close();
    },
    onError: (error) => {
      if (!outcomeUnknown(error)) attempt.current = undefined;
      void client.invalidateQueries({ queryKey: ["content"] });
    },
    onSettled: () => {
      gate.current = false;
    },
  });

  if (!base)
    return (
      <FormDialog
        open={open}
        onOpenChange={(next) => {
          if (!next) close();
        }}
        finalFocus={finalFocus}
        title={title}
        description={
          current.error
            ? "The record could not be loaded. It has not been changed."
            : "Loading the record…"
        }
        cancelLabel={readOnly ? "Close" : undefined}
        onSubmit={() => {}}
        actions={current.error && <Button onClick={() => void current.refetch()}>Try again</Button>}
      >
        {null}
      </FormDialog>
    );

  const definition = base.collection;
  const fields = definition.schema.fields;
  const recordKey = base.record?.record_key ?? (values[definition.record_key] ?? "").trim();
  const failure = save.error instanceof ApiFailure ? save.error : undefined;
  const conflict = failure?.status === 409 && failure.code === "version_conflict";

  const gone =
    failure?.status === 404 ||
    (base.record && current.error instanceof ApiFailure && current.error.status === 404);

  const unknown = outcomeUnknown(save.error);

  // While the answer is lost, a newer version holding exactly what was sent is that save landing, not someone else's
  // change: retrying it confirms it
  const stale =
    conflict ||
    (!!base.record &&
      !!latest &&
      latest.record.version !== base.record.version &&
      !(unknown && attempt.current && saveLanded(latest, attempt.current)));

  const rejected = failure?.status === 400 && failure.code === "validation_failed";

  const fieldErrors = new Map(
    rejected ? failure.errors.map((item) => [item.field, item.message]) : [],
  );

  const taken =
    failure?.status === 409 && failure.code === "record_exists"
      ? "Another record already has this key"
      : undefined;

  const downloadMine = () =>
    download(JSON.stringify(valuesRef.current, null, 2), `${recordKey || definition.key}.json`);

  const reload = async () => {
    if (gate.current) return;
    gate.current = true;
    setReading(true);
    const before = valuesRef.current;

    try {
      const latest = await api.record(definition.key, attempt.current?.key ?? recordKey);

      if (valuesRef.current !== before)
        throw new Error("Your values changed while reloading. Check them before discarding.");
      setBase(latest);
      setValues(recordValues(latest.collection, latest.record));
      setFilled((value) => value + 1);
      setObserved(undefined);
      attempt.current = undefined;
      save.reset();
      setMessage("");
      client.setQueryData(recordQuery(api, definition.key, recordKey).queryKey, latest);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not reload. Your values are unchanged.",
      );
    } finally {
      gate.current = false;
      setReading(false);
    }
  };

  const submit = async () => {
    if (readOnly || gate.current || stale || gone) return;

    if (unknown && attempt.current && !attempt.current.record) {
      gate.current = true;
      setReading(true);

      try {
        setObserved(await api.record(attempt.current.collection.key, attempt.current.key));
        setMessage(
          "A record exists at the submitted key. Copy your values, or discard them and reload to inspect it.",
        );
      } catch (error) {
        if (error instanceof ApiFailure && error.status === 404) {
          attempt.current = undefined;
          save.reset();
          setMessage(
            "The submitted record is not present. Check the key before creating it again.",
          );
        } else
          setMessage(
            "Could not check whether the record exists. Keep your values and check again.",
          );
      } finally {
        gate.current = false;
        setReading(false);
      }

      return;
    }

    if (!attempt.current) {
      const problem = base.record ? undefined : keyProblem(recordKey);
      setKeyError(problem);
      setChecked(values);

      if (problem) return;
      attempt.current = structuredClone({
        ...base,
        key: recordKey,
        data: recordData(definition, values),
        values,
      });
    }

    gate.current = true;
    setMessage("");
    save.mutate(unknown ? { ...attempt.current, retry: true } : attempt.current);
  };

  const keyListed = fields.some((field) => field.key === definition.record_key);
  const dropped = droppedFields(definition, base.record);

  const input = (
    key: string,
    label: string,
    kind: Collection["schema"]["fields"][number]["type"],
    hint?: string,
    error?: string,
  ) => (
    <Field
      key={key}
      label={label}
      hint={hint}
      error={values[key] === checked?.[key] ? error : undefined}
    >
      <Input
        value={values[key] ?? ""}
        readOnly={readOnly || (key === definition.record_key && (!!base.record || save.isPending))}
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

  const keyHint = base.record
    ? "A record keeps its key."
    : "Lower-case letters, numbers and hyphens, such as barbados-drug-service. It can’t be changed later.";

  const otherProblems = rejected
    ? failure.errors
        .filter((item) => !fields.some((field) => field.key === item.field))
        .map((item) => item.message)
    : taken || stale || gone
      ? []
      : unknown
        ? [
            "We couldn’t confirm whether this record was saved. Retry the same request or copy your values before reloading.",
          ]
        : apiFailureMessages(
            save.error,
            "The record could not be saved. Try again.",
            (field) => field,
          );

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      finalFocus={finalFocus}
      title={title}
      description={`${definition.title}. Saving changes every page that shows this record.`}
      pending={save.isPending || reading}
      cancelLabel={readOnly ? "Close" : undefined}
      onSubmit={() => void submit()}
      actions={
        !readOnly && (
          <Button
            type="submit"
            variant="accent"
            size="md"
            pending={save.isPending || reading}
            aria-disabled={stale || gone || undefined}
          >
            {unknown
              ? base.record
                ? "Retry same save"
                : "Check records"
              : base.record
                ? "Save changes"
                : "Add record"}
          </Button>
        )
      }
    >
      <div ref={body} className="flex flex-col gap-4">
        {(stale || gone || observed || unknown) && (
          <Banner
            tone="warning"
            role="alert"
            actions={
              <>
                {!gone && (
                  <Button
                    variant="danger"
                    disabled={save.isPending || reading}
                    onClick={() => void reload()}
                  >
                    Discard my changes and reload
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(JSON.stringify(valuesRef.current, null, 2))
                      .catch(downloadMine)
                  }
                >
                  Copy my version
                </Button>
                <Button onClick={downloadMine}>Download my version</Button>
              </>
            }
          >
            {gone
              ? "This record has been deleted. Your values are still here."
              : stale
                ? "The record changed since you opened it."
                : "Check the saved version before making another change."}
            {latest && (
              <>
                <p className="text-14 text-muted">
                  Struck-through lines are only in the latest saved version, shown here read-only.
                  Highlighted lines are only in your open copy.
                </p>
                <ContentDiff
                  live={JSON.stringify(latest, null, 2)}
                  proposed={JSON.stringify(values, null, 2)}
                />
              </>
            )}
          </Banner>
        )}
        {dropped.length > 0 && !readOnly && (
          <Banner tone="info">
            Saving removes values for fields this collection no longer has: {dropped.join(", ")}.
          </Banner>
        )}
        {!keyListed && input(definition.record_key, "Key", "slug", keyHint, keyError ?? taken)}
        {fields.map((field) => {
          const isKey = field.key === definition.record_key;

          return input(
            field.key,
            isKey ? field.label : `${field.label} (optional)`,
            field.type,
            isKey ? keyHint : undefined,
            (isKey ? (keyError ?? taken) : undefined) ?? fieldErrors.get(field.key),
          );
        })}
        <ApiProblems messages={[...otherProblems, ...(message ? [message] : [])]} />
      </div>
    </FormDialog>
  );
}

/** Load the private displayed snapshot before allowing a record deletion. */
export function DeleteRecordDialog({
  open = true,
  api,
  collection,
  record,
  close,
  focusAfter,
}: {
  open?: boolean;
  api: EditorApi;
  collection: Collection;
  record: CollectionRecord;
  close: () => void;
  focusAfter: RefObject<HTMLElement | null>;
}) {
  const current = useQuery(recordQuery(api, collection.key, record.record_key));
  const [snapshot, setSnapshot] = useState<RecordDetail>();

  if (!snapshot && current.data) setSnapshot(current.data);
  const client = useQueryClient();
  const deleted = useRef(false);
  const gate = useRef(false);

  const remove = useMutation({
    mutationFn: async () => {
      if (!snapshot) throw new Error("Load the record before deleting it.");
      await api.deleteRecord(collection.key, snapshot.record.record_key, snapshot.record.version);
    },
    onSuccess: () => {
      deleted.current = true;
      void client.invalidateQueries({ queryKey: ["content"] });
      toast("Record deleted");
      close();
    },
    onSettled: () => {
      gate.current = false;
    },
  });

  const messages = apiFailureMessages(
    remove.error ?? current.error,
    "The record could not be deleted. Retry uses the same displayed version.",
    (field) => field,
  );

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title={`Delete ${record.record_key}?`}
      description={`It’s removed from ${snapshot?.collection.title ?? collection.title}, and from every page that shows it. This can’t be undone.`}
      confirmLabel="Delete record"
      pendingLabel="Deleting record…"
      pending={remove.isPending}
      confirmDisabled={!snapshot}
      finalFocus={() => (deleted.current ? focusAfter.current : true)}
      error={messages.length > 0 && <ApiProblemText messages={messages} />}
      onConfirm={() => {
        if (!snapshot || gate.current) return;
        gate.current = true;
        remove.mutate();
      }}
    >
      {snapshot && (
        <pre className="whitespace-pre-wrap">{JSON.stringify(snapshot.record.data, null, 2)}</pre>
      )}
    </ConfirmDialog>
  );
}
