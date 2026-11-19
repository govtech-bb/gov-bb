import { Plus, Trash } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import type { Collection, EditorApi, FieldError } from "../../api/client";
import { FIELD_TYPES } from "../../api/field-types";
import { collectionQuery } from "../../api/queries";
import type { Outcome } from "../../api/write-attempt";
import { writes } from "../../api/writes";
import { Button } from "../../ui/button";
import { Field, FieldGroup } from "../../ui/field";
import { FormDialog } from "../../ui/form-dialog";
import { Input } from "../../ui/input";
import { NativeSelect } from "../../ui/native-select";
import { toast } from "../../ui/toast";
import { ApiProblems } from "../api-problems";
import { useWrite } from "../use-write";
import {
  collectionProblems,
  draftKey,
  newCollectionInput,
  type CollectionDraft,
  type FieldRow,
} from "./new-collection";

// A new collection starts with the field most collections name their records by, chosen as its record key
const FIRST_DRAFT: CollectionDraft = {
  title: "",
  fields: [{ id: 0, key: "key", label: "Key", type: "slug" }],
  recordKey: 0,
};

// How api_v2 names the field list, and one part of one of its fields
const FIELD_LIST = "schema.fields";

const fieldPath = (index: number, part: keyof FieldRow) => `${FIELD_LIST}.${index}.${part}`;

/**
 * Adds a data collection: its title, its key, its fields (each a key, a label and a type) and the slug field whose
 * value names each record. A problem shows on its field, the dialog's or the content API's, and the first such field
 * takes the focus. A collection's fields can't be changed once it's added, so the dialog says so. A create whose
 * answer was lost is checked against the content API before it's sent again.
 */
export function AddCollectionDialog({
  api,
  open,
  taken,
  onClose,
  onAdded,
}: {
  api: EditorApi;
  /** Shown; closed, it fades away as it was. Each opening is a new dialog. */
  open: boolean;
  /** The keys the collections already have. */
  taken: readonly string[];
  onClose: () => void;
  /** The collection the content API added, to open. */
  onAdded: (collection: Collection) => void;
}) {
  const client = useQueryClient();
  const [draft, setDraft] = useState(FIRST_DRAFT);
  const nextId = useRef(1);
  const [problems, setProblems] = useState<readonly FieldError[]>([]);
  // Counts the checks that found problems: each puts the focus on the first field with one, and typing doesn't
  const [checks, setChecks] = useState(0);
  // The row just added, whose key takes the focus
  const [added, setAdded] = useState<number>();
  const body = useRef<HTMLDivElement>(null);
  const addField = useRef<HTMLButtonElement>(null);
  const save = useWrite(api, writes.createCollection);
  const working = save.state === "sending" || save.state === "checking";
  const unsettled = save.state === "unsettled";
  const outcome = save.outcome;
  const input = newCollectionInput(draft);

  const landed = useEffectEvent((collection: Collection) => {
    client.setQueryData(collectionQuery(api, collection.key).queryKey, { collection, records: [] });
    toast("Collection added");
    onAdded(collection);
  });

  // The content API's reasons show on their fields like the dialog's own
  const refused = useEffectEvent(() => {
    if (outcome?.kind === "invalid") setProblems(outcome.errors);
    else if (outcome?.kind === "refused" && outcome.code === "collection_exists")
      setProblems([{ field: "key", message: "Another collection already has this key" }]);
    else return;
    setChecks((count) => count + 1);
  });

  useEffect(() => {
    if (outcome?.kind === "landed") landed(outcome.answer);
    else refused();
  }, [outcome]);

  useLayoutEffect(() => {
    if (checks > 0) body.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [checks]);

  useLayoutEffect(() => {
    if (added !== undefined)
      body.current?.querySelector<HTMLElement>(`[data-row="${added}"] input`)?.focus();
  }, [added]);

  const errorOf = (path: string) => problems.find((problem) => problem.field === path)?.message;

  // Changing a value drops the problems found with it: they were about what it was
  const edit = (next: (draft: CollectionDraft) => CollectionDraft, ...paths: string[]) => {
    setDraft(next);
    setProblems((found) => found.filter((problem) => !paths.includes(problem.field)));
  };

  // Adding or removing a field moves the fields after it, so their problems no longer say which field they're about
  const rearrange = (next: (draft: CollectionDraft) => CollectionDraft) => {
    setDraft(next);
    setProblems((found) =>
      found.filter(
        (problem) => !problem.field.startsWith(FIELD_LIST) && problem.field !== "record_key",
      ),
    );
  };

  const editRow = (index: number, part: keyof FieldRow, value: string) =>
    edit(
      (old) => ({
        ...old,
        fields: old.fields.map((row, at) => (at === index ? { ...row, [part]: value } : row)),
      }),
      fieldPath(index, part),
      // The record key is a field's key, and must be a slug field
      ...(part === "label" ? [] : ["record_key"]),
    );

  const addRow = () => {
    const id = nextId.current++;

    rearrange((old) => ({
      ...old,
      fields: [...old.fields, { id, key: "", label: "", type: "text" }],
    }));
    setAdded(id);
  };

  const removeRow = (id: number) => {
    rearrange((old) => ({
      ...old,
      fields: old.fields.filter((row) => row.id !== id),
      recordKey: old.recordKey === id ? undefined : old.recordKey,
    }));
    addField.current?.focus();
  };

  // Problems with no field of their own in the dialog, and what came of sending it
  const shown = new Set([
    "key",
    "title",
    "record_key",
    FIELD_LIST,
    ...draft.fields.flatMap((_, index) =>
      (["key", "label", "type"] as const).map((part) => fieldPath(index, part)),
    ),
  ]);

  const messages = [
    ...problems.filter((problem) => !shown.has(problem.field)).map((problem) => problem.message),
    ...(working ? [] : outcomeMessages(outcome)),
  ];

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Add a collection"
      description="A collection keeps facts many pages show, such as contact details, as records. Its fields can’t be changed once it’s added."
      // While a create or a check is out, the dialog stays: its answer, and what was typed, still need it
      pending={working}
      onSubmit={() => {
        if (working) return;

        if (!unsettled) {
          const found = collectionProblems(input, taken);
          setProblems(found);

          if (found.length > 0) {
            save.forget();
            setChecks((count) => count + 1);

            return;
          }
        }

        void save.press(() => input);
      }}
      actions={
        <Button
          type="submit"
          variant="accent"
          size="md"
          pending={working}
          pendingLabel={
            save.state === "checking" || unsettled ? "Checking collection…" : "Adding collection…"
          }
        >
          {unsettled ? "Check again" : "Add collection"}
        </Button>
      }
    >
      <div ref={body} className="contents">
        <Field label="Title" error={errorOf("title")}>
          <Input
            value={draft.title}
            onChange={(event) => {
              const title = event.target.value;
              edit(
                (old) => ({ ...old, title }),
                "title",
                ...(draft.key === undefined ? ["key"] : []),
              );
            }}
          />
        </Field>
        <Field
          label="Key"
          hint="Its name in addresses and in the blocks that show its records, such as contacts. It can’t be changed later."
          error={errorOf("key")}
        >
          <Input
            value={draftKey(draft)}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            className="font-mono"
            onChange={(event) => {
              const key = event.target.value;
              edit((old) => ({ ...old, key }), "key");
            }}
          />
        </Field>
        <FieldGroup label="Fields" error={errorOf(FIELD_LIST)}>
          <p className="text-14 text-muted">What each record holds, one value per field.</p>
          {draft.fields.map((row, index) => (
            <div
              key={row.id}
              data-row={row.id}
              className="flex flex-col gap-3 rounded border border-line p-3"
            >
              <FieldGroup label={`Field ${index + 1}`}>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Key" error={errorOf(fieldPath(index, "key"))}>
                    <Input
                      value={row.key}
                      spellCheck={false}
                      autoCapitalize="off"
                      autoComplete="off"
                      className="font-mono"
                      onChange={(event) => editRow(index, "key", event.target.value)}
                    />
                  </Field>
                  <Field label="Label" error={errorOf(fieldPath(index, "label"))}>
                    <Input
                      value={row.label}
                      onChange={(event) => editRow(index, "label", event.target.value)}
                    />
                  </Field>
                  <Field label="Type" error={errorOf(fieldPath(index, "type"))}>
                    <NativeSelect
                      value={row.type}
                      onChange={(event) => editRow(index, "type", event.target.value)}
                    >
                      {FIELD_TYPES.map(({ type, name }) => (
                        <option key={type} value={type}>
                          {name}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                </div>
              </FieldGroup>
              <Button
                className="self-start"
                icon={<Trash />}
                aria-label={`Remove field ${index + 1}`}
                onClick={() => removeRow(row.id)}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            ref={addField}
            className="self-start"
            variant="secondary"
            icon={<Plus />}
            onClick={addRow}
          >
            Add field
          </Button>
        </FieldGroup>
        <Field
          label="Record key"
          hint="The slug field whose value names each record in its address, such as barbados-drug-service."
          error={errorOf("record_key")}
        >
          <NativeSelect
            value={draft.recordKey === undefined ? "" : String(draft.recordKey)}
            onChange={(event) => {
              const chosen = event.target.value;
              edit(
                (old) => ({
                  ...old,
                  recordKey: chosen === "" ? undefined : Number(chosen),
                }),
                "record_key",
              );
            }}
          >
            <option value="">Choose a field</option>
            {draft.fields.map((row, index) => (
              <option key={row.id} value={row.id}>
                {fieldName(row, index)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <ApiProblems messages={messages} />
      </div>
    </FormDialog>
  );
}

/** A field as the record key choice names it: its label and key, or its place while it has neither. */
function fieldName(row: FieldRow, index: number) {
  const label = row.label.trim();
  const key = row.key.trim();

  if (label && key) return `${label} (${key})`;

  return label || key || `Field ${index + 1}`;
}

/** What came of sending it, other than a field's problem, in the dialog's words. */
function outcomeMessages(outcome: Outcome<Collection> | undefined) {
  switch (outcome?.kind) {
    case undefined:
    case "landed":
    case "invalid":
      return [];
    case "signed-out":
      return ["Your session has ended. Sign in again, then try again."];
    case "forbidden":
      return [outcome.message ?? "Only admins and approvers can add collections."];
    case "unknown":
      return [
        "We couldn’t tell whether the collection was added. Check your connection, then check again before you try again.",
      ];
    case "refused":
      return outcome.code === "collection_exists"
        ? []
        : [outcome.message ?? "The collection could not be added. Try again."];
    case "conflict":
    case "missing":
      return [outcome.message ?? "The collection could not be added. Try again."];
  }
}
