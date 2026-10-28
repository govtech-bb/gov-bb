import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import {
  addressLock,
  categoryFieldLabel,
  categoryLabel,
  categoryProblems,
  categorySlug,
  categoryUrl,
  deleteBlocker,
  holdsFields,
  siblingsOf,
  type Category,
  type CategoryBlockers,
  type CategoryFields,
  type CategoryProblem,
} from "../api/categories";
import type { CategoryRefusal, EditorApi } from "../api/client";
import { button, Button } from "../ui/button";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { Dialog } from "../ui/dialog";
import { Field } from "../ui/field";
import { Input } from "../ui/input";
import { NativeSelect } from "../ui/native-select";
import { Textarea } from "../ui/textarea";
import { toast } from "../ui/toast";
import { ApiProblems, ApiProblemText } from "./api-problems";
import { WorkspaceDialog } from "./workspace-dialog";

/**
 * Where a category change stands once it has been sent, short of done: refused for a reason the author can act on,
 * changed or deleted by someone else since the dialog opened, or sent without an answer, so the list is read again to
 * find out whether it took before it may be sent again. Checks read directly, outside the shared query's request,
 * cancellation and retry lifecycle.
 */
type Attempt =
  | { readonly _tag: "Refused"; readonly error: CategoryRefusal }
  | { readonly _tag: "Superseded" }
  | { readonly _tag: "Gone" }
  | { readonly _tag: "Saving" }
  | { readonly _tag: "Checking" }
  | { readonly _tag: "Unclear" }
  | { readonly _tag: "Unconfirmed" };

const CHECKING: Attempt = { _tag: "Checking" };

const UNCLEAR: Attempt = { _tag: "Unclear" };

/** Every content read again: page settings, Create service and the Services list file under categories too. */
function useContentChanged() {
  const client = useQueryClient();

  return () => void client.invalidateQueries({ queryKey: ["content"] });
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** What the content API says still uses a category, in words. */
function blockerText(title: string, blockers: CategoryBlockers) {
  const uses = [
    blockers.pages > 0 && plural(blockers.pages, "page", "pages"),
    blockers.subcategories > 0 && plural(blockers.subcategories, "subcategory", "subcategories"),
  ].filter((use) => use !== false);

  if (blockers.reserved_route)
    return `A page of the site's own is at this address, so ${title} stays.`;

  const one = blockers.pages + blockers.subcategories === 1;

  return `${title} still has ${uses.join(" and ") || "something filed under it"}. Move ${one ? "it" : "them"} to another category first.`;
}

/** Why a category change was refused, in words an author can act on; field reasons show on their fields instead. */
function refusalMessages(error: CategoryRefusal, otherwise: string) {
  switch (error._tag) {
    case "CategoryAccessDenied":
      return [
        error.status === 401
          ? "Your session has ended. Sign in again, then try again."
          : "You do not have access to change categories.",
      ];
    case "CategoryRejected":
      return error.errors
        .filter((item) => !FIELDS.has(item.field))
        .map((item) => `${categoryFieldLabel(item.field)}: ${item.message}`);
    case "CategoryInUse":
    case "CategoryConflict":
    case "CategoryNotFound":
    case "CategoryRefused":
      return [error.status === 400 || error.status >= 500 ? otherwise : error.message];
    default: {
      const unexpected: never = error;

      return unexpected;
    }
  }
}

/** What the dialog says about an attempt that didn't finish, and what its main button does next. */
function attemptMessages(attempt: Attempt | undefined, otherwise: string, noun: string) {
  switch (attempt?._tag) {
    case undefined:
    case "Saving":
    case "Checking":
      return [];
    case "Refused":
      return refusalMessages(attempt.error, otherwise);
    case "Superseded":
      return [
        `Someone changed this ${noun} after you opened it. Load their version, then try again: what you typed stays.`,
      ];
    case "Gone":
      return [
        `This ${noun} has been deleted since you opened it. What you typed stays here, so you can copy it.`,
      ];
    case "Unclear":
      return [
        "We couldn’t tell whether that went through. Check your connection, then check again before you try again.",
      ];
    case "Unconfirmed":
      return [
        "We couldn’t find that change in the categories yet. It may still arrive, so check the list before you try again.",
      ];
    default: {
      const unexpected: never = attempt;

      return unexpected;
    }
  }
}

// The fields the dialog has, where a refusal of one of them shows
const FIELDS = new Set(["title", "slug", "parent_id", "description"]);

// The refused fields the dialog shows on the fields themselves
const refusedFields = (attempt: Attempt | undefined) =>
  attempt?._tag === "Refused" && attempt.error._tag === "CategoryRejected"
    ? attempt.error.errors.filter((item) => FIELDS.has(item.field))
    : [];

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
  category,
  categories,
  close,
}: {
  api: EditorApi;
  /** The category to edit, as it was when the dialog opened; without one, a new category. */
  category?: Category;
  /** The list as it is now, to check the fields against. */
  categories: readonly Category[];
  close: () => void;
}) {
  const contentChanged = useContentChanged();
  const words = category ? editWords : addWords;
  // The version this edit saves over: the one the dialog opened with until the author loads a newer one
  const [base, setBase] = useState(category);
  const [title, setTitle] = useState(category?.title ?? "");
  const [slug, setSlug] = useState(category?.slug);
  const [parentId, setParentId] = useState(category?.parent_id ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [problems, setProblems] = useState<readonly CategoryProblem[]>([]);
  const [attempt, setAttempt] = useState<Attempt>();
  // What was last sent, to recognise it in the list when its answer was lost
  const sent = useRef<CategoryFields>(undefined);
  const titleControl = useRef<HTMLInputElement>(null);
  const slugControl = useRef<HTMLInputElement>(null);
  const parentControl = useRef<HTMLSelectElement>(null);

  const fields: CategoryFields = {
    title,
    slug: slug ?? categorySlug(title),
    parent_id: parentId || null,
    description: description.trim() ? description : null,
  };

  // Only a top-level category can be a parent
  const parents = siblingsOf(categories, null).filter((item) => item.id !== base?.id);
  const parent = categories.find((item) => item.id === parentId);
  const locked = base && addressLock(base, categories);
  const deletedMeanwhile = !!base && !categories.some((item) => item.id === base.id);
  const working = attempt?._tag === "Saving" || attempt?._tag === "Checking";

  const done = () => {
    contentChanged();
    toast(words.done);
    close();
  };

  // A save whose answer was lost: done if the list now holds what was sent, else it may be sent again
  const reconcile = async () => {
    const values = sent.current;

    if (!values) return;
    setAttempt(CHECKING);
    const result = await api.categories();

    if (!result.ok) return setAttempt(UNCLEAR);

    const saved = base
      ? result.value.find((item) => item.id === base.id)
      : result.value.find((item) => item.slug === values.slug);

    if (saved && holdsFields(saved, values)) return done();
    contentChanged();

    if (base && !saved) return setAttempt({ _tag: "Gone" });

    // Someone else's version, where this one was saved over
    if (base && saved && saved.updated_at !== base.updated_at)
      return setAttempt({ _tag: "Superseded" });
    setAttempt({ _tag: "Unconfirmed" });
  };

  const save = async (values: CategoryFields) => {
    sent.current = values;
    setAttempt({ _tag: "Saving" });

    const result = base
      ? await api.updateCategory(base.id, values, base.updated_at)
      : await api.createCategory(values);

    if (result.ok) return done();

    switch (result.error._tag) {
      case "CategoryOutcomeUnknown":
        return reconcile();
      case "CategoryConflict":
        return setAttempt({ _tag: "Superseded" });
      case "CategoryNotFound":
        return setAttempt({ _tag: "Gone" });
      default:
        return setAttempt({ _tag: "Refused", error: result.error });
    }
  };

  // Takes the newer version to save over, keeping what the author typed
  const loadLatest = async () => {
    setAttempt(CHECKING);
    const result = await api.categories();

    if (!result.ok) return setAttempt(UNCLEAR);
    contentChanged();
    const latest = result.value.find((item) => item.id === base?.id);

    if (!latest) return setAttempt({ _tag: "Gone" });
    setBase(latest);
    setAttempt(undefined);
  };

  // A field the API refused shows its reason like one the dialog found; anything else is said under the fields
  const refused = refusedFields(attempt);

  const errorOf = (field: keyof CategoryFields) =>
    [...problems, ...refused].find((item) => item.field === field)?.message;

  const messages = [
    ...(deletedMeanwhile && attempt?._tag !== "Gone"
      ? ["Someone has deleted this category since you opened it."]
      : []),
    ...attemptMessages(attempt, words.failed, "category"),
  ];

  // Once an attempt's reasons show, the first field with one takes the focus, so it's read out with its error
  useLayoutEffect(() => {
    const reasons = [...problems, ...refusedFields(attempt)];

    const controls = new Map<string, RefObject<HTMLElement | null>>([
      ["title", titleControl],
      ["slug", slugControl],
      ["parent_id", parentControl],
    ]);

    const first = [...controls].find(([field]) => reasons.some((reason) => reason.field === field));

    first?.[1].current?.focus();
  }, [problems, attempt]);

  // Until a lost answer is settled, the main button finds out whether it took instead of sending it again
  const unsettled = attempt?._tag === "Unclear";

  const action =
    attempt?._tag === "Superseded" ? (
      <Button type="button" variant="accent" size="md" onClick={() => void loadLatest()}>
        Load their version
      </Button>
    ) : (
      <Button type="submit" variant="accent" size="md" pending={working}>
        {attempt?._tag === "Saving"
          ? words.pending
          : working
            ? "Checking category…"
            : unsettled
              ? "Check again"
              : words.action}
      </Button>
    );

  // While a save or a check is out, the dialog stays: its answer, and what was typed, still need it
  const dismiss = () => {
    if (!working) close();
  };

  return (
    <WorkspaceDialog
      title={words.title}
      description={words.description}
      close={dismiss}
      onSubmit={() => {
        if (working || attempt?._tag === "Superseded") return;

        if (unsettled) return void reconcile();
        const found = categoryProblems(fields, categories, base?.id);

        setProblems(found);
        setAttempt(undefined);

        if (found.length === 0) void save(fields);
      }}
      body={
        <>
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
            className="mt-4"
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
          <Field
            label="Parent category"
            error={errorOf("parent_id")}
            disabled={!!locked}
            className="mt-4"
          >
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
          <Field label="Description (optional)" error={errorOf("description")} className="mt-4">
            <Textarea
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          <ApiProblems messages={messages} />
        </>
      }
      footer={
        <>
          <Button size="md" disabled={working} onClick={dismiss}>
            Cancel
          </Button>
          {action}
        </>
      }
    />
  );
}

/**
 * Deletes a category once its author confirms, at the version the dialog opened with. While services, subcategories
 * or an app route still use it, it says so instead, with a way to those services, and can't be confirmed. A deletion
 * whose answer was lost is checked against the list before it can be sent again.
 */
export function DeleteCategoryDialog({
  api,
  category,
  categories,
  close,
  focusAfter,
}: {
  api: EditorApi;
  /** The category, as it was when the dialog opened. */
  category: Category;
  /** The list as it is now. */
  categories: readonly Category[];
  close: () => void;
  /** Where the focus goes once the category has gone, taking its row's buttons with it. */
  focusAfter: RefObject<HTMLElement | null>;
}) {
  const contentChanged = useContentChanged();
  const [base, setBase] = useState(category);
  const [attempt, setAttempt] = useState<Attempt>();
  const deleted = useRef(false);
  const blocked = deleteBlocker(base, categories);
  const working = attempt?._tag === "Saving" || attempt?._tag === "Checking";
  const unsettled = attempt?._tag === "Unclear";

  const done = (words: string) => {
    deleted.current = true;
    contentChanged();
    toast(words);
    close();
  };

  // A deletion whose answer was lost: done once the category is gone from the list
  const reconcile = async () => {
    setAttempt(CHECKING);
    const result = await api.categories();

    if (!result.ok) return setAttempt(UNCLEAR);
    const still = result.value.find((item) => item.id === base.id);

    if (!still) return done("Category deleted");
    contentChanged();
    setAttempt(
      still.updated_at === base.updated_at ? { _tag: "Unconfirmed" } : { _tag: "Superseded" },
    );
  };

  const remove = async () => {
    setAttempt({ _tag: "Saving" });
    const result = await api.deleteCategory(base.id, base.updated_at);

    if (result.ok) return done("Category deleted");

    switch (result.error._tag) {
      case "CategoryOutcomeUnknown":
        return reconcile();
      case "CategoryNotFound":
        return done("Category already deleted");
      case "CategoryConflict":
        return setAttempt({ _tag: "Superseded" });
      default:
        return setAttempt({ _tag: "Refused", error: result.error });
    }
  };

  const loadLatest = async () => {
    setAttempt(CHECKING);
    const result = await api.categories();

    if (!result.ok) return setAttempt(UNCLEAR);
    const latest = result.value.find((item) => item.id === base.id);

    if (!latest) return done("Category already deleted");
    contentChanged();
    setBase(latest);
    setAttempt(undefined);
  };

  // Nothing to confirm: why not, and the way to what's in the way
  if (blocked)
    return (
      <Dialog.Root
        open
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <Dialog.Content size="sm">
          <Dialog.Header>
            <Dialog.Title>{base.title} can't be deleted yet</Dialog.Title>
            <Dialog.Description>{blocked}</Dialog.Description>
          </Dialog.Header>
          <Dialog.Actions>
            <Button size="md" variant={base.services > 0 ? "ghost" : "accent"} onClick={close}>
              Close
            </Button>
            {base.services > 0 && (
              <Link
                to="/services"
                search={{ category: base.slug }}
                className={button("md", "accent")}
              >
                See its services
              </Link>
            )}
          </Dialog.Actions>
        </Dialog.Content>
      </Dialog.Root>
    );

  const refusal =
    attempt?._tag === "Refused" && attempt.error._tag === "CategoryInUse"
      ? [blockerText(base.title, attempt.error.blockers)]
      : attemptMessages(attempt, "The category could not be deleted. Try again.", "category");

  const superseded = attempt?._tag === "Superseded";

  return (
    <ConfirmDialog
      open
      onClose={close}
      title={`Delete ${base.title}?`}
      description="Services can no longer be filed under it. This can't be undone."
      confirm={superseded ? "Load their version" : unsettled ? "Check again" : "Delete category"}
      tone={superseded || unsettled ? "accent" : "danger"}
      pendingLabel={attempt?._tag === "Saving" ? "Deleting category…" : "Checking category…"}
      pending={working}
      error={refusal.length > 0 && <ApiProblemText messages={refusal} />}
      finalFocus={() => (deleted.current ? focusAfter.current : true)}
      onConfirm={() => void (superseded ? loadLatest() : unsettled ? reconcile() : remove())}
    />
  );
}
