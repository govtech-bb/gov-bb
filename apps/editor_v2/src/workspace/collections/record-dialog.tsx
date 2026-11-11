import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useRef, useState, type RefObject } from "react";
import {
  ApiFailure,
  type Collection,
  type CollectionRecord,
  type EditorApi,
  type RecordDetail,
} from "../../api/client";
import { apiFailureMessages } from "../../api/failure-messages";
import { collectionQuery, recordQuery } from "../../api/queries";
import type { Outcome } from "../../api/write-attempt";
import { writes } from "../../api/writes";
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
import { useWrite } from "../use-write";
import {
  droppedFields,
  keyProblem,
  recordData,
  recordValues,
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

function recordOutcomeMessages(
  outcome: Outcome<RecordDetail | undefined> | undefined,
  otherwise: string,
) {
  if (!outcome || outcome.kind === "landed") return [];

  if (outcome.kind === "signed-out")
    return ["Your session has ended. Sign in again, then try again."];

  if (outcome.kind === "forbidden") return [outcome.message ?? otherwise];

  if (outcome.kind === "invalid")
    return outcome.errors.map((item) => `${item.field}: ${item.message}`);

  if (outcome.kind === "conflict") return ["This record has changed since you opened it."];

  if (outcome.kind === "unknown") return ["The content API could not be reached. Try again."];

  return [otherwise];
}

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
  const [base, setBase] = useState<
    { collection: Collection; record?: RecordDetail["record"] } | undefined
  >(record ? undefined : { collection });

  const [values, setValues] = useState<RecordValues>({});
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const [keyError, setKeyError] = useState<string>();
  const [checked, setChecked] = useState<RecordValues>();
  const [message, setMessage] = useState("");
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

  const latest = current.data;
  const query = collectionQuery(api, collection.key);

  const save = useWrite(api, base?.record ? writes.saveRecord : writes.createRecord);
  const pending = save.state === "sending" || save.state === "checking";

  const saved = useEffectEvent((answer: RecordDetail) => {
    const wasEditing = !!base?.record;
    setBase(answer);
    client.setQueryData(
      recordQuery(api, answer.collection.key, answer.record.record_key).queryKey,
      answer,
    );
    client.setQueryData(
      query.queryKey,
      (old) => old && { ...old, records: withRecord(old.records, answer.record) },
    );
    toast(wasEditing ? "Record saved" : "Record added");

    if (JSON.stringify(valuesRef.current) === JSON.stringify(checked)) close();
  });

  useEffect(() => {
    if (save.outcome?.kind === "landed") saved(save.outcome.answer);
  }, [save.outcome]);

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
  const outcome = save.outcome;
  const conflict = outcome?.kind === "conflict";

  const gone =
    outcome?.kind === "missing" ||
    (base.record && current.error instanceof ApiFailure && current.error.status === 404);

  const unknown = outcome?.kind === "unknown";

  const stale =
    conflict ||
    (!unknown && !!base.record && !!latest && latest.record.version !== base.record.version);

  const rejected = outcome?.kind === "invalid";

  const fieldErrors = new Map(
    rejected ? outcome.errors.map((item) => [item.field, item.message]) : [],
  );

  const taken =
    outcome?.kind === "refused" && outcome.code === "record_exists"
      ? "Another record already has this key"
      : undefined;

  const downloadMine = () =>
    download(JSON.stringify(valuesRef.current, null, 2), `${recordKey || definition.key}.json`);

  const reload = async () => {
    if (pending || reading) return;
    setReading(true);
    const before = valuesRef.current;

    try {
      const key =
        unknown && !base.record ? (checked?.[definition.record_key] ?? "").trim() : recordKey;

      const latest = await api.record(definition.key, key);

      if (valuesRef.current !== before)
        throw new Error("Your values changed while reloading. Check them before discarding.");
      setBase(latest);
      setValues(recordValues(latest.collection, latest.record));
      setFilled((value) => value + 1);
      save.forget();
      setMessage("");
      client.setQueryData(
        recordQuery(api, definition.key, latest.record.record_key).queryKey,
        latest,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not reload. Your values are unchanged.",
      );
    } finally {
      setReading(false);
    }
  };

  const submit = () => {
    if (readOnly || pending || reading || stale || gone) return;

    if (save.state !== "unsettled") {
      const problem = base.record ? undefined : keyProblem(recordKey);
      setKeyError(problem);
      setChecked(values);

      if (problem) return;
    }

    setMessage("");
    void save.press(() => ({
      ...base,
      key: recordKey,
      data: recordData(definition, values),
    }));
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
        readOnly={
          readOnly || (key === definition.record_key && (!!base.record || pending || unknown))
        }
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
    ? outcome.errors
        .filter((item) => !fields.some((field) => field.key === item.field))
        .map((item) => item.message)
    : taken || stale || gone
      ? []
      : unknown
        ? [
            "We couldn’t confirm whether this record was saved. Retry the same request or copy your values before reloading.",
          ]
        : recordOutcomeMessages(outcome, "The record could not be saved. Try again.");

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      finalFocus={finalFocus}
      title={title}
      description={`${definition.title}. Saving changes every page that shows this record.`}
      pending={pending || reading}
      cancelLabel={readOnly ? "Close" : undefined}
      onSubmit={() => void submit()}
      actions={
        !readOnly && (
          <Button
            type="submit"
            variant="accent"
            size="md"
            pending={pending || reading}
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
        {(stale || gone || unknown) && (
          <Banner
            tone="warning"
            role="alert"
            actions={
              <>
                {!gone && (
                  <Button
                    variant="danger"
                    disabled={pending || reading}
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
  const deleted = useRef(false);
  const remove = useWrite(api, writes.deleteRecord);

  const removed = useEffectEvent(() => {
    deleted.current = true;
    toast("Record deleted");
    close();
  });

  useEffect(() => {
    if (remove.outcome?.kind === "landed") removed();
  }, [remove.outcome]);

  const otherwise = "The record could not be deleted. Retry uses the same displayed version.";

  const messages = remove.outcome
    ? recordOutcomeMessages(remove.outcome, otherwise)
    : apiFailureMessages(current.error, otherwise, (field) => field);

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
      pending={remove.state === "sending" || remove.state === "checking"}
      confirmDisabled={!snapshot}
      finalFocus={() => (deleted.current ? focusAfter.current : true)}
      error={messages.length > 0 && <ApiProblemText messages={messages} />}
      onConfirm={() => {
        if (!snapshot) return;
        void remove.press(() => ({
          collection: collection.key,
          key: snapshot.record.record_key,
          version: snapshot.record.version,
        }));
      }}
    >
      {snapshot && (
        <pre className="whitespace-pre-wrap">{JSON.stringify(snapshot.record.data, null, 2)}</pre>
      )}
    </ConfirmDialog>
  );
}
