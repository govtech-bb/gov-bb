import { CaretDown, CaretUp, DotsThree, PencilSimple, Trash } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState } from "react";
import { categoryRows, reordered, type CategoryRow } from "../api/categories";
import { ApiFailure, type EditorApi } from "../api/client";
import { categoriesQuery } from "../api/queries";
import { cn } from "../cn";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { Menu } from "../ui/menu";
import { ScreenHeader } from "../ui/screen-header";
import { createAppColumnHelper, useAppTable } from "../ui/table/table-hooks";
import { toast } from "../ui/toast";
import { Tip } from "../ui/tooltip";
import { CategoryDialog, DeleteCategoryDialog } from "./category-dialogs";
import { LoadFailure } from "./load-failure";

/** Up the list, or down it. */
type Direction = -1 | 1;

/** What a row's controls do: a move says which control asked, so that control gets the focus back. */
type RowActions = {
  move: (row: CategoryRow, by: Direction, from: "button" | "menu") => void;
  edit: (row: CategoryRow) => void;
  remove: (row: CategoryRow) => void;
};

const Actions = createContext<RowActions>({ move: () => {}, edit: () => {}, remove: () => {} });

/** Its name and address, a subcategory indented under its parent; narrow, its count too, where its column was. */
function CategoryCell({ row }: { row: CategoryRow }) {
  return (
    <div className={cn("min-w-0 py-0.5", row.depth > 0 && "ps-6")}>
      <span className="text-14 font-semibold">{row.title}</span>
      <span className="mt-0.5 block font-mono text-12 wrap-break-word text-muted">{row.url}</span>
      <span className="mt-1 hidden text-12 text-muted @max-3xl:block">
        {row.services} {row.services === 1 ? "service" : "services"}
      </span>
    </div>
  );
}

/** Sibling moves, edit and delete: labelled icon buttons that collapse into a menu on narrow screens. */
function CategoryActions({ row }: { row: CategoryRow }) {
  const actions = useContext(Actions);
  const first = row.place === 1;
  const last = row.place === row.siblings;

  return (
    <>
      <div className="flex justify-end gap-1 @max-xl:hidden">
        <Tip content="Move up">
          <Button
            icon={<CaretUp />}
            aria-label={`Move ${row.title} up`}
            data-move={row.id}
            data-by={-1}
            disabled={first}
            onClick={() => actions.move(row, -1, "button")}
          />
        </Tip>
        <Tip content="Move down">
          <Button
            icon={<CaretDown />}
            aria-label={`Move ${row.title} down`}
            data-move={row.id}
            data-by={1}
            disabled={last}
            onClick={() => actions.move(row, 1, "button")}
          />
        </Tip>
        <Tip content="Edit">
          <Button
            icon={<PencilSimple />}
            aria-label={`Edit ${row.title}`}
            onClick={() => actions.edit(row)}
          />
        </Tip>
        <Tip content="Delete">
          <Button
            icon={<Trash />}
            aria-label={`Delete ${row.title}`}
            onClick={() => actions.remove(row)}
          />
        </Tip>
      </div>
      <Menu.Root>
        <Menu.Trigger
          render={
            <Button
              icon={<DotsThree />}
              aria-label={`Actions for ${row.title}`}
              data-row-menu={row.id}
              className="ms-auto hidden @max-xl:flex"
            />
          }
        />
        <Menu.Content aria-label={`Actions for ${row.title}`} align="end">
          <Menu.Item
            icon={<CaretUp />}
            disabled={first}
            onClick={() => actions.move(row, -1, "menu")}
          >
            Move up
          </Menu.Item>
          <Menu.Item
            icon={<CaretDown />}
            disabled={last}
            onClick={() => actions.move(row, 1, "menu")}
          >
            Move down
          </Menu.Item>
          <Menu.Item icon={<PencilSimple />} onClick={() => actions.edit(row)}>
            Edit
          </Menu.Item>
          <Menu.Item icon={<Trash />} variant="danger" onClick={() => actions.remove(row)}>
            Delete
          </Menu.Item>
        </Menu.Content>
      </Menu.Root>
    </>
  );
}

const column = createAppColumnHelper<CategoryRow>();

const columns = column.columns([
  column.accessor("title", {
    header: "Name",
    enableHiding: false,
    cell: ({ row }) => <CategoryCell row={row.original} />,
  }),
  // Narrow, the count rides under the name instead
  column.accessor("services", {
    header: () => <span className="block text-end">Services</span>,
    meta: { secondary: true },
    cell: ({ row }) => (
      <span className="block text-end text-14 tabular-nums">{row.original.services}</span>
    ),
  }),
  column.display({
    id: "actions",
    header: () => <span className="block text-end">Actions</span>,
    cell: ({ row }) => <CategoryActions row={row.original} />,
  }),
]);

/** Category preview with local edits, sibling moves, and real API service counts. */
export function CategoriesScreen({ api }: { api: EditorApi }) {
  const client = useQueryClient();
  const categories = useQuery(categoriesQuery(api));
  const status = categories.error instanceof ApiFailure ? categories.error.status : undefined;

  const refreshFailed =
    categories.isError &&
    !!categories.data &&
    (status === 0 || (status !== undefined && status >= 500));

  const blocked = categories.isError && !refreshFailed;
  const rows = useMemo(() => categoryRows(categories.data ?? []), [categories.data]);
  const [dialog, setDialog] = useState<{ kind: "add" | "edit" | "delete"; id?: string }>();
  const [moved, setMoved] = useState("");
  const add = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  // The control a move came from, to have the focus back once its row is in its new place
  const refocus = useRef<{ id: string; by: Direction; from: "button" | "menu" }>(undefined);

  const { mutate: move } = useMutation({
    mutationFn: ({ row, by }: { row: CategoryRow; by: Direction; from: "button" | "menu" }) =>
      api.moveCategory(row.id, by),
    onSuccess: (ids, { row, by, from }) => {
      refocus.current = { id: row.id, by, from };

      const list = client.setQueryData(categoriesQuery(api).queryKey, (current) =>
        reordered(current ?? [], ids),
      );

      const moved = categoryRows(list ?? []).find((item) => item.id === row.id);

      if (moved)
        setMoved(
          `${moved.title} moved ${by < 0 ? "up" : "down"}: ${moved.place} of ${moved.siblings}`,
        );
    },
    onError: () => toast("The category could not be moved. Try again.", { tone: "error" }),
  });

  const actions = useMemo<RowActions>(
    () => ({
      move: (row, by, from) => {
        void client.cancelQueries({ queryKey: categoriesQuery(api).queryKey });
        move({ row, by, from });
      },
      edit: (row) => setDialog({ kind: "edit", id: row.id }),
      remove: (row) => setDialog({ kind: "delete", id: row.id }),
    }),
    [api, client, move],
  );

  // A moved row's control keeps the focus; at the end of the list, the other way's button takes it
  useLayoutEffect(() => {
    const target = refocus.current;

    if (!target || !card.current) return;
    refocus.current = undefined;
    const control = (selector: string) => card.current?.querySelector<HTMLButtonElement>(selector);

    if (target.from === "menu") return void control(`[data-row-menu="${target.id}"]`)?.focus();
    const same = control(`[data-move="${target.id}"][data-by="${target.by}"]`);

    (same?.disabled
      ? control(`[data-move="${target.id}"][data-by="${-target.by}"]`)
      : same
    )?.focus();
  }, [rows]);

  const table = useAppTable({
    columns,
    data: rows,
    getRowId: (row) => row.id,
    // Categories are few and move in place: one page, in their own order
    manualPagination: true,
    enableSorting: false,
  });

  const chosen = categories.data?.find((category) => category.id === dialog?.id);
  const close = () => setDialog(undefined);

  return (
    <Actions value={actions}>
      <table.AppTable>
        <ScreenHeader
          title="Categories"
          lead="People browse these to find services on the site."
          action={
            <Button ref={add} variant="accent" size="md" onClick={() => setDialog({ kind: "add" })}>
              Add category
            </Button>
          }
        />
        <div ref={card} className="@container min-w-0 rounded-sm bg-white shadow-sheet">
          <Banner tone="info" layout="strip">
            Preview only: the content API can’t save categories yet, so changes here last until you
            reload.
          </Banner>
          <p role="status" className="px-4 py-3 text-14 text-muted empty:hidden">
            {categories.isPending ? "Loading categories…" : null}
          </p>
          {refreshFailed && (
            <Banner
              tone="warning"
              layout="strip"
              actions={
                <Button
                  variant="secondary"
                  pending={categories.isFetching}
                  onClick={() => void categories.refetch()}
                >
                  {categories.isFetching ? "Refreshing categories…" : "Try again"}
                </Button>
              }
            >
              We could not refresh categories. Showing the last loaded list.
            </Banner>
          )}
          {blocked ? (
            <LoadFailure
              noun="categories"
              error={categories.error}
              retrying={categories.isFetching}
              retry={() => void categories.refetch()}
            />
          ) : (
            <table.DataTable
              caption="Categories"
              loading={categories.isPending}
              empty={{
                title: "No categories yet",
                description: "Add one, so services can be filed under it.",
                actions: (
                  <Button variant="accent" onClick={() => setDialog({ kind: "add" })}>
                    Add category
                  </Button>
                ),
              }}
            />
          )}
        </div>
        <p role="status" className="sr-only">
          {moved}
        </p>
        {dialog?.kind === "add" && (
          <CategoryDialog api={api} categories={categories.data ?? []} close={close} />
        )}
        {dialog?.kind === "edit" && chosen && (
          <CategoryDialog
            api={api}
            category={chosen}
            categories={categories.data ?? []}
            close={close}
          />
        )}
        {dialog?.kind === "delete" && chosen && (
          <DeleteCategoryDialog
            api={api}
            category={chosen}
            categories={categories.data ?? []}
            close={close}
            focusAfter={add}
          />
        )}
      </table.AppTable>
    </Actions>
  );
}
