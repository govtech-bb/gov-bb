import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import {
  categoryFieldLabel,
  categoryProblems,
  categorySlug,
  categoryUrl,
  deleteBlocker,
  siblingsOf,
  type Category,
  type CategoryFields,
  type CategoryProblem,
} from "../api/categories";
import { ApiFailure, type EditorApi } from "../api/client";
import { apiFailureMessages } from "../api/failure-messages";
import { categoriesQuery } from "../api/queries";
import { Button } from "../ui/button";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { Field } from "../ui/field";
import { Input } from "../ui/input";
import { NativeSelect } from "../ui/native-select";
import { TextLink } from "../ui/text-link";
import { Textarea } from "../ui/textarea";
import { toast } from "../ui/toast";
import { ApiProblems, ApiProblemText } from "./api-problems";
import { WorkspaceDialog } from "./workspace-dialog";

/**
 * Why the content API refused a category change, in words an author can act on: a conflict as the API put it, when it
 * did, and a refused field under the name the dialog gives it.
 */
function categoryRefusals(error: Error | null, otherwise: string) {
  // A conflict's message is the API's own sentence; without one, it's only the status
  if (error instanceof ApiFailure && error.status === 409)
    return [error.message === `HTTP ${error.status}` ? otherwise : error.message];

  return apiFailureMessages(error, otherwise, categoryFieldLabel);
}

// The fields the dialog has, where a refusal of one of them shows
const FIELDS = new Set(["title", "slug", "parent_id", "description"]);

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
 */
export function CategoryDialog({
  api,
  category,
  categories,
  close,
}: {
  api: EditorApi;
  /** The category to edit; without one, a new category. */
  category?: Category;
  categories: readonly Category[];
  close: () => void;
}) {
  const client = useQueryClient();
  const words = category ? editWords : addWords;
  const [title, setTitle] = useState(category?.title ?? "");
  const [slug, setSlug] = useState(category?.slug);
  const [parentId, setParentId] = useState(category?.parent_id ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [problems, setProblems] = useState<readonly CategoryProblem[]>([]);
  const titleControl = useRef<HTMLInputElement>(null);
  const slugControl = useRef<HTMLInputElement>(null);
  const parentControl = useRef<HTMLSelectElement>(null);

  const fields: CategoryFields = {
    title,
    slug: slug ?? categorySlug(title),
    parent_id: parentId || null,
    description,
  };

  // Only a top-level category can be a parent, and a category with subcategories stays at the top level itself
  const parents = siblingsOf(categories, null).filter((item) => item.id !== category?.id);
  const parent = parents.find((item) => item.id === parentId);
  const keepsTop = !!category && categories.some((item) => item.parent_id === category.id);

  const save = useMutation({
    mutationFn: (values: CategoryFields) =>
      category ? api.updateCategory(category.id, values) : api.createCategory(values),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: categoriesQuery(api).queryKey });
      toast(words.done);
      close();
    },
  });

  // A field the API refused shows its reason like one the dialog found; anything else is said under the fields
  const failure = save.error instanceof ApiFailure ? save.error : undefined;
  const refused = failure?.errors.filter((item) => FIELDS.has(item.field)) ?? [];
  const elsewhere = failure?.errors.filter((item) => !FIELDS.has(item.field)) ?? [];

  const errorOf = (field: keyof CategoryFields) =>
    [...problems, ...refused].find((item) => item.field === field)?.message;

  const messages =
    failure && failure.errors.length > 0
      ? elsewhere.map((item) => `${categoryFieldLabel(item.field)}: ${item.message}`)
      : categoryRefusals(save.error, words.failed);

  // Once an attempt's reasons show, the first field with one takes the focus, so it's read out with its error
  useLayoutEffect(() => {
    const reasons = [...problems, ...(save.error instanceof ApiFailure ? save.error.errors : [])];

    const controls = new Map<string, RefObject<HTMLElement | null>>([
      ["title", titleControl],
      ["slug", slugControl],
      ["parent_id", parentControl],
    ]);

    const first = [...controls].find(([field]) => reasons.some((reason) => reason.field === field));

    first?.[1].current?.focus();
  }, [problems, save.error]);

  return (
    <WorkspaceDialog
      title={words.title}
      description={words.description}
      close={close}
      onSubmit={() => {
        const found = categoryProblems(fields, categories, category?.id);

        save.reset();
        setProblems(found);

        if (found.length === 0) save.mutate(fields);
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
                Its address on the site:{" "}
                <span className="font-mono wrap-break-word">
                  {categoryUrl(fields.slug || "…", parent)}
                </span>
              </>
            }
            error={errorOf("slug")}
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
            hint={keepsTop ? "It has subcategories, so it stays at the top level." : undefined}
            error={errorOf("parent_id")}
            disabled={keepsTop}
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
                  {item.title}
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
          <Button size="md" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" variant="accent" size="md" pending={save.isPending}>
            {save.isPending ? words.pending : words.action}
          </Button>
        </>
      }
    />
  );
}

/**
 * Deletes a category once its author confirms. While services or subcategories are still filed under it, it says so
 * instead, with a way to those services, and can't be confirmed.
 */
export function DeleteCategoryDialog({
  api,
  category,
  categories,
  close,
  focusAfter,
}: {
  api: EditorApi;
  category: Category;
  categories: readonly Category[];
  close: () => void;
  /** Where the focus goes once the category has gone, taking its row's buttons with it. */
  focusAfter: RefObject<HTMLElement | null>;
}) {
  const client = useQueryClient();
  const deleted = useRef(false);
  const blocked = deleteBlocker(category, categories);

  const remove = useMutation({
    mutationFn: () => api.deleteCategory(category.id),
    onSuccess: () => {
      deleted.current = true;
      void client.invalidateQueries({ queryKey: categoriesQuery(api).queryKey });
      toast("Category deleted");
      close();
    },
  });

  return (
    <ConfirmDialog
      open
      onClose={close}
      title={blocked ? `${category.title} can't be deleted yet` : `Delete ${category.title}?`}
      description={
        blocked ? (
          <>
            {blocked}
            {category.services > 0 && (
              <>
                {" "}
                <TextLink
                  render={
                    <Link to="/services" search={{ category: category.serviceCategoryTitle }} />
                  }
                >
                  See its services
                </TextLink>
              </>
            )}
          </>
        ) : (
          "Services can no longer be filed under it. This can't be undone."
        )
      }
      confirm="Delete category"
      pendingLabel="Deleting category…"
      confirmDisabled={!!blocked}
      pending={remove.isPending}
      error={
        remove.error && (
          <ApiProblemText
            messages={categoryRefusals(
              remove.error,
              "The category could not be deleted. Try again.",
            )}
          />
        )
      }
      finalFocus={() => (deleted.current ? focusAfter.current : true)}
      onConfirm={() => remove.mutate()}
    />
  );
}
