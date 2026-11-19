import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffectEvent, useLayoutEffect, useRef, useState, type RefObject } from "react";
import {
  addressLock,
  categoryFieldLabel,
  categoryLabel,
  categoryProblems,
  categorySlug,
  categoryUrl,
  deleteBlocker,
  siblingsOf,
  type Category,
  type CategoryBlockers,
  type CategoryFields,
  type CategoryProblem,
} from "../api/categories";
import type { EditorApi } from "../api/client";
import type { Outcome } from "../api/write-attempt";
import { writes } from "../api/writes";
import { useWrite } from "./use-write";
import { Button } from "../ui/button";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { Dialog } from "../ui/dialog";
import { Field } from "../ui/field";
import { FormDialog } from "../ui/form-dialog";
import { Input } from "../ui/input";
import { NativeSelect } from "../ui/native-select";
import { Textarea } from "../ui/textarea";
import { toast } from "../ui/toast";
import { ApiProblems, ApiProblemText } from "./api-problems";
import { ContentDiff } from "./review-screens";
import { download } from "../host/download";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** What the content API says still uses a category, in words. */
function blockerText(title: string, blockers: CategoryBlockers) {
  const uses = [
    blockers.pages > 0 && plural(blockers.pages, "page", "pages"),
    blockers.subcategories > 0 && plural(blockers.subcategories, "subcategory", "subcategories"),
  ].filter((use) => use !== false);

  if (blockers.reserved_route)
    return `A page of the site’s own is at this address, so ${title} stays.`;

  const one = blockers.pages + blockers.subcategories === 1;

  return `${title} still has ${uses.join(" and ") || "something filed under it"}. Move ${one ? "it" : "them"} to another category first.`;
}

/** The dialog keeps its category wording; field reasons stay on their fields. */
function attemptMessages(outcome: Outcome<unknown> | undefined, otherwise: string, noun: string) {
  switch (outcome?.kind) {
    case undefined:
    case "landed":
      return [];
    case "signed-out":
      return ["Your session has ended. Sign in again, then try again."];
    case "forbidden":
      return ["You do not have access to change categories."];
    case "invalid":
      return outcome.errors
        .filter((item) => !FIELDS.has(item.field))
        .map((item) => `${categoryFieldLabel(item.field)}: ${item.message}`);
    case "conflict":
      return [
        `Someone changed this ${noun} after you opened it. Copy your changes or discard them and reload.`,
      ];
    case "missing":
      return [
        `This ${noun} has been deleted since you opened it. What you typed stays here, so you can copy it.`,
      ];
    case "unknown":
      return [
        "We couldn’t tell whether that went through. Check your connection, then check again before you try again.",
      ];
    case "refused":
      return [outcome.message || otherwise];
  }
}

// The fields the dialog has, where a refusal of one of them shows
const FIELDS = new Set(["title", "slug", "parent_id", "description"]);

const refusedFields = (outcome: Outcome<unknown> | undefined) =>
  outcome?.kind === "invalid" ? outcome.errors.filter((item) => FIELDS.has(item.field)) : [];

const addWords = {
  title: "Add a category",
  description: "Services are filed under categories, which people browse on the site.",
  action: "Add category",
  pending: "Adding category…",
  done: "Category added",
  failed: "The category could not be added. Try again.",
};

const editWords = {
  title: "Edit category",
  description: "Changing its slug changes its address on the site.",
  action: "Save category",
  pending: "Saving category…",
  done: "Category saved",
  failed: "The category could not be saved. Try again.",
};

/**
 * Adds a category, or edits one: its name, its slug, the category it sits under and its description. A new
 * category's slug follows its name until the author types one. A problem shows on its field, which takes the focus.
 *
 * An edit keeps the category as it was when the dialog opened, and what the author has typed, whatever the list does
 * meanwhile: a refresh, someone else's change or deletion. Only Load their version takes a newer one. A save whose
 * answer was lost is checked against the list before it can be sent again.
 */
export function CategoryDialog({
  api,
  open,
  category,
  categories,
  onClose,
}: {
  api: EditorApi;
  /** Shown; closed, it fades away as it was. Each opening is a new dialog. */
  open: boolean;
  /** The category to edit, as it was when the dialog opened; without one, a new category. */
  category?: Category;
  /** The list as it is now, to check the fields against. */
  categories: readonly Category[];
  onClose: () => void;
}) {
  const client = useQueryClient();
  // The version this edit saves over: the one the dialog opened with until the author loads a newer one
  const [base, setBase] = useState(category);
  const words = base ? editWords : addWords;
  const [title, setTitle] = useState(category?.title ?? "");
  const [slug, setSlug] = useState(category?.slug);
  const [parentId, setParentId] = useState(category?.parent_id ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [problems, setProblems] = useState<readonly CategoryProblem[]>([]);
  // What the fields held when last checked: a field's problem, the dialog's or the API's, is about that value, so it
  // goes once the author changes the field
  const [checked, setChecked] = useState<CategoryFields>();
  const save = useWrite(api, base ? writes.saveCategory : writes.createCategory);
  const [reading, setReading] = useState(false);
  const [reloadMissing, setReloadMissing] = useState(false);
  const outcome = reloadMissing ? { kind: "missing" as const } : save.outcome;
  // Only a UI snapshot: the attempt owns the request used for every retry.
  const submitted = useRef<string>(undefined);
  const gate = useRef(false);
  const [latest, setLatest] = useState<Category>();
  const currentFields = useRef<CategoryFields>(undefined);
  const titleControl = useRef<HTMLInputElement>(null);
  const slugControl = useRef<HTMLInputElement>(null);
  const parentControl = useRef<HTMLSelectElement>(null);

  const fields: CategoryFields = {
    title,
    slug: slug ?? categorySlug(title),
    parent_id: parentId || null,
    description: description.trim() ? description : null,
  };

  currentFields.current = fields;

  // Only a top-level category can be a parent
  const parents = siblingsOf(categories, null).filter((item) => item.id !== base?.id);
  const parent = categories.find((item) => item.id === parentId);
  const locked = base && addressLock(base, categories);
  const working = reading || save.state === "sending" || save.state === "checking";
  const unsettled = save.state === "unsettled";

  // The refreshed list is only a read-only comparison, never a write token or confirmation.
  const compared =
    latest ??
    (unsettled
      ? categories.find((item) => (base ? item.id === base.id : item.slug === checked?.slug))
      : undefined);

  // A newly created row may not be in the shared list yet.
  const deletedMeanwhile =
    !!base &&
    !working &&
    !unsettled &&
    outcome?.kind !== "landed" &&
    !categories.some((item) => item.id === base.id);

  const saved = useEffectEvent((result: Outcome<Category>) => {
    if (result.kind === "landed") {
      setBase(result.answer);

      if (JSON.stringify(currentFields.current) === submitted.current) {
        toast(words.done);
        onClose();
      }
    } else if (result.kind === "conflict") {
      void client.invalidateQueries({ queryKey: ["content"] });
      void api.categories().then((result) => {
        if (result.ok) setLatest(result.value.find((item) => item.id === base?.id));
      });
    }
  });

  // Adopt the landed baseline before paint, without replacing later typing.
  useLayoutEffect(() => {
    if (save.outcome) saved(save.outcome);
  }, [save.outcome]);

  // Once the list has the row, subsequent removals must show the normal deletion notice.
  useLayoutEffect(() => {
    const result = save.outcome;

    if (result?.kind === "landed" && categories.some((item) => item.id === result.answer.id))
      save.forget();
  }, [categories, save.outcome]);

  // Replace fields and baseline together only after a successful read with no newer typing.
  const loadLatest = async () => {
    if (gate.current || working) return;
    gate.current = true;
    const before = JSON.stringify(currentFields.current);
    setReading(true);
    const result = await api.categories();

    gate.current = false;
    setReading(false);

    if (!result.ok || JSON.stringify(currentFields.current) !== before) return;
    void client.invalidateQueries({ queryKey: ["content"] });
    const latest = result.value.find((item) => item.id === base?.id);

    if (!latest) return setReloadMissing(true);
    setBase(latest);
    setTitle(latest.title);
    setSlug(latest.slug);
    setParentId(latest.parent_id ?? "");
    setDescription(latest.description ?? "");
    setLatest(undefined);
    setReloadMissing(false);
    save.forget();
  };

  // A field the API refused shows its reason like one the dialog found; anything else is said under the fields
  const refused = refusedFields(outcome);

  const errorOf = (field: keyof CategoryFields) =>
    fields[field] === checked?.[field]
      ? [...problems, ...refused].find((item) => item.field === field)?.message
      : undefined;

  const messages = [
    ...(deletedMeanwhile && outcome?.kind !== "missing"
      ? ["Someone has deleted this category since you opened it."]
      : []),
    ...(!working ? attemptMessages(outcome, words.failed, "category") : []),
  ];

  // Once an attempt's reasons show, the first field with one takes the focus, so it's read out with its error
  useLayoutEffect(() => {
    const reasons = [...problems, ...refusedFields(outcome)];

    const controls = new Map<string, RefObject<HTMLElement | null>>([
      ["title", titleControl],
      ["slug", slugControl],
      ["parent_id", parentControl],
    ]);

    const first = [...controls].find(([field]) => reasons.some((reason) => reason.field === field));

    first?.[1].current?.focus();
  }, [problems, outcome]);

  const action =
    outcome?.kind === "conflict" && !reading ? (
      <Button type="button" variant="danger" size="md" onClick={() => void loadLatest()}>
        Discard my changes and reload
      </Button>
    ) : (
      <Button
        type="submit"
        variant="accent"
        size="md"
        pending={working}
        // Checking for a lost answer, which Check again does too; saving otherwise
        pendingLabel={
          reading || save.state === "checking" || unsettled ? "Checking category…" : words.pending
        }
      >
        {unsettled ? (base ? "Retry same save" : "Check again") : words.action}
      </Button>
    );

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={words.title}
      description={words.description}
      // While a save or a check is out, the dialog stays: its answer, and what was typed, still need it
      pending={working}
      onSubmit={() => {
        if (working || outcome?.kind === "conflict") return;

        if (!unsettled) {
          const found = categoryProblems(fields, categories, base?.id);
          setProblems(found);
          setChecked(fields);
          setReloadMissing(false);

          if (found.length > 0) {
            save.forget();

            return;
          }
        }

        void save.press(() => {
          submitted.current = JSON.stringify(fields);

          return { fields, base };
        });
      }}
      actions={action}
    >
      <Field label="Name" error={errorOf("title")}>
        <Input
          ref={titleControl}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </Field>
      <Field
        label="Slug"
        hint={
          <>
            {locked ? `${locked} ` : "Its address on the site: "}
            <span className="font-mono wrap-break-word">
              {categoryUrl(fields.slug || "…", parent)}
            </span>
          </>
        }
        error={errorOf("slug")}
        disabled={!!locked}
      >
        <Input
          ref={slugControl}
          value={fields.slug}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          className="font-mono"
          onChange={(event) => setSlug(event.target.value)}
        />
      </Field>
      <Field label="Parent category" error={errorOf("parent_id")} disabled={!!locked}>
        <NativeSelect
          ref={parentControl}
          value={parentId}
          onChange={(event) => setParentId(event.target.value)}
        >
          <option value="">None (top level)</option>
          {parents.map((item) => (
            <option key={item.id} value={item.id}>
              {categoryLabel(item, categories)}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Description (optional)" error={errorOf("description")}>
        <Textarea
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>
      {compared && (
        <>
          <p className="text-14 text-muted">
            Struck-through lines are only in the latest saved version, shown here read-only.
            Highlighted lines are only in your open copy.
          </p>
          <ContentDiff
            live={JSON.stringify(compared, null, 2)}
            proposed={JSON.stringify(fields, null, 2)}
          />
        </>
      )}
      {(outcome?.kind === "conflict" || unsettled) && (
        <Button
          variant="secondary"
          onClick={() =>
            void navigator.clipboard
              .writeText(JSON.stringify(fields, null, 2))
              .catch(() => download(JSON.stringify(fields, null, 2), "category.json"))
          }
        >
          Copy my version
        </Button>
      )}
      <ApiProblems messages={messages} />
    </FormDialog>
  );
}

/**
 * Deletes a category once its author confirms, at the version the dialog opened with. While services, subcategories
 * or an app route still use it, it says so instead, with a way to those services, and can't be confirmed. A deletion
 * whose answer was lost is checked against the list before it can be sent again.
 */
export function DeleteCategoryDialog({
  api,
  open,
  category,
  categories,
  onClose,
  focusAfter,
}: {
  api: EditorApi;
  /** Shown; closed, it fades away as it was. Each opening is a new dialog. */
  open: boolean;
  /** The category, as it was when the dialog opened. */
  category: Category;
  /** The list as it is now. */
  categories: readonly Category[];
  onClose: () => void;
  /** Where the focus goes once the category has gone, taking its row's buttons with it. */
  focusAfter: RefObject<HTMLElement | null>;
}) {
  const client = useQueryClient();
  const [base] = useState(category);
  const remove = useWrite(api, writes.deleteCategory);
  const outcome = remove.outcome;
  const deleted = useRef(false);
  const blocked = deleteBlocker(base, categories);
  const working = remove.state === "sending" || remove.state === "checking";
  const unsettled = remove.state === "unsettled";

  const removed = useEffectEvent(() => {
    if (outcome?.kind !== "landed" && outcome?.kind !== "missing") return;
    deleted.current = true;

    if (outcome.kind === "missing") void client.invalidateQueries({ queryKey: ["content"] });
    toast(
      outcome.kind === "landed"
        ? outcome.answer.checked
          ? "Category is no longer present"
          : "Category deleted"
        : "Category already deleted",
    );
    onClose();
  });

  useLayoutEffect(() => {
    removed();
  }, [outcome]);

  // Nothing to confirm: why not, and the way to what's in the way
  if (blocked)
    return (
      <Dialog.Root
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      >
        <Dialog.Content size="sm">
          <Dialog.Header>
            <Dialog.Title>{base.title} can’t be deleted yet</Dialog.Title>
            <Dialog.Description>{blocked}</Dialog.Description>
          </Dialog.Header>
          <Dialog.Actions>
            <Button size="md" variant={base.services > 0 ? "ghost" : "accent"} onClick={onClose}>
              Close
            </Button>
            {base.services > 0 && (
              <Button
                size="md"
                variant="accent"
                render={<Link to="/services" search={{ category: base.slug }} />}
              >
                See its services
              </Button>
            )}
          </Dialog.Actions>
        </Dialog.Content>
      </Dialog.Root>
    );

  const refusal =
    outcome?.kind === "refused" && outcome.code === "category_in_use"
      ? // SAFETY: category_in_use retains the category client's validated blockers as refusal detail.
        [blockerText(base.title, outcome.detail as CategoryBlockers)]
      : working
        ? []
        : attemptMessages(outcome, "The category could not be deleted. Try again.", "category");

  const superseded = outcome?.kind === "conflict";

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={`Delete ${base.title}?`}
      description="Services can no longer be filed under it. This can’t be undone."
      confirmLabel={
        superseded
          ? "Cancel and review the category"
          : unsettled
            ? "Check again"
            : "Delete category"
      }
      variant={superseded || unsettled ? "accent" : "danger"}
      // Loading their version and Check again check the list; deleting otherwise
      pendingLabel={
        superseded || unsettled || remove.state === "checking"
          ? "Checking category…"
          : "Deleting category…"
      }
      pending={working}
      error={refusal.length > 0 && <ApiProblemText messages={refusal} />}
      finalFocus={() => (deleted.current ? focusAfter.current : true)}
      onConfirm={() =>
        void (superseded ? onClose() : remove.press(() => ({ id: base.id, version: base.version })))
      }
    />
  );
}
