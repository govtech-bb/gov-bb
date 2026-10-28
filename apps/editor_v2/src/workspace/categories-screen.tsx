import {
  ArrowElbowDownRight,
  CaretDown,
  CaretUp,
  DotsThree,
  PencilSimple,
  Trash,
} from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  categoryRows,
  inOrder,
  moveOrder,
  withSavedCategories,
  type Category,
  type CategoryOrder,
  type CategoryRow,
} from "../api/categories";
import { ApiFailure, type EditorApi } from "../api/client";
import { categoriesQuery } from "../api/queries";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { Menu } from "../ui/menu";
import { ScreenHeader } from "../ui/screen-header";
import { NameCell } from "../ui/table/cell-components";
import { createAppColumnHelper, useAppTable } from "../ui/table/table-hooks";
import { toast } from "../ui/toast";
import { Tip } from "../ui/tooltip";
import { CategoryDialog, DeleteCategoryDialog } from "./category-dialogs";
import { LoadFailure } from "./load-failure";

/** Up the list, or down it. */
type Direction = -1 | 1;

/**
 * What a row's controls do: a move says which control asked, so that control gets the focus back. `moving` says
 * whether its sibling group has a move still being saved, when its moves wait.
 */
type RowActions = {
  move: (row: CategoryRow, by: Direction, from: "button" | "menu") => void;
  moving: (row: CategoryRow) => boolean;
  /** Nothing can be moved, for someone who can't make changes. */
  readOnly: boolean;
  edit: (row: CategoryRow) => void;
  remove: (row: CategoryRow) => void;
};

const Actions = createContext<RowActions>({
  move: () => {},
  moving: () => false,
  readOnly: false,
  edit: () => {},
  remove: () => {},
});

// A sibling group's key: its parent's id, or the top level's
const groupOf = (category: Pick<Category, "parent_id">) => category.parent_id ?? "";

/**
 * Its name and address; narrow, its count too, where its column was. A subcategory hangs from an elbow under its
 * parent, its name in the regular weight where a parent's is semibold, and tells a screen reader whose subcategory it
 * is.
 */
function CategoryCell({ row, parent }: { row: CategoryRow; parent?: Category }) {
  const cell = (
    <NameCell
      className={parent && "flex-1"}
      name={
        <>
          <span className={parent && "font-normal"}>{row.title}</span>
          {parent && <span className="sr-only">, subcategory of {parent.title}</span>}
        </>
      }
      path={row.url}
      details={`${row.services} ${row.services === 1 ? "service" : "services"}`}
    />
  );

  if (!parent) return cell;

  // The elbow sits in its own column, so a name or address that wraps stays lined up under itself
  return (
    <div className="flex min-w-0 gap-2 ps-1">
      <ArrowElbowDownRight
        aria-hidden="true"
        className="pointer-events-none mt-1 size-4 shrink-0 text-grey-60"
      />
      {cell}
    </div>
  );
}

/**
 * Sibling moves, edit and delete: labelled icon buttons that collapse into a menu on narrow screens. Memoised with
 * its row: the table renders every cell whenever the screen does, so without it a dialog opening would re-render every
 * row's buttons, whatever the actions context holds.
 */
const CategoryActions = memo(function CategoryActions({ row }: { row: CategoryRow }) {
  const actions = useContext(Actions);
  const first = row.place === 1;
  const last = row.place === row.siblings;
  // While its group's last move is saved, its moves stay focusable and named, but wait
  const waiting = actions.moving(row);

  return (
    <>
      <div className="flex justify-end gap-1 @max-xl:hidden">
        <Tip content="Move up">
          <Button
            icon={<CaretUp />}
            aria-label={`Move ${row.title} up`}
            data-move={row.id}
            data-by={-1}
            disabled={first || actions.readOnly}
            aria-disabled={waiting || undefined}
            onClick={() => actions.move(row, -1, "button")}
          />
        </Tip>
        <Tip content="Move down">
          <Button
            icon={<CaretDown />}
            aria-label={`Move ${row.title} down`}
            data-move={row.id}
            data-by={1}
            disabled={last || actions.readOnly}
            aria-disabled={waiting || undefined}
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
            disabled={first || waiting || actions.readOnly}
            onClick={() => actions.move(row, -1, "menu")}
          >
            Move up
          </Menu.Item>
          <Menu.Item
            icon={<CaretDown />}
            disabled={last || waiting || actions.readOnly}
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
});

const column = createAppColumnHelper<CategoryRow>();

const columns = column.columns([
  column.accessor("title", {
    header: "Name",
    enableHiding: false,
    // Its parent from the list itself, so the words follow a renamed parent
    cell: ({ row, table }) => (
      <CategoryCell
        row={row.original}
        parent={table.options.data.find((item) => item.id === row.original.parent_id)}
      />
    ),
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

/**
 * The one shared category list, from the content API: add, edit, move among siblings and delete. A move is saved with
 * every sibling's version, one at a time in each sibling group; a dialog keeps the category as it opened with it.
 */
export function CategoriesScreen({
  api,
  readOnly = false,
}: {
  api: EditorApi;
  /** Categories can't be moved, for someone who can't make changes; the workspace says why. */
  readOnly?: boolean;
}) {
  const client = useQueryClient();
  const categories = useQuery(categoriesQuery(api));
  const status = categories.error instanceof ApiFailure ? categories.error.status : undefined;

  // Only an ended session or lost access hides the list; any other failed refresh keeps the last one read
  const refreshFailed = categories.isError && !!categories.data && status !== 401 && status !== 403;

  const blocked = categories.isError && !refreshFailed;
  const rows = useMemo(() => categoryRows(categories.data ?? []), [categories.data]);

  // A dialog keeps the category it opened with, whatever the list does meanwhile
  const [dialog, setDialog] = useState<
    { kind: "add" } | { kind: "edit" | "delete"; category: Category }
  >();

  const [moved, setMoved] = useState("");
  // The row that last moved, tinted while moves go on, so a pointer can follow it to its new place
  const [marked, setMarked] = useState<string>();
  const unmark = useRef<ReturnType<typeof setTimeout>>(undefined);
  const add = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  // The control a move came from, to have the focus back once its row is in its new place
  const refocus = useRef<{ id: string; by: Direction; from: "button" | "menu" }>(undefined);

  /**
   * Each sibling group with a move not yet settled: being saved, or sent without an answer and not yet checked. A press
   * meanwhile does nothing: two moves from one version of the list would refuse each other.
   */
  const [moving, setMoving] = useState<ReadonlyMap<string, "saving" | CategoryOrder>>(new Map());
  const settling = useRef(new Map<string, "saving" | CategoryOrder>());

  const settle = useCallback((group: string, state?: "saving" | CategoryOrder) => {
    const next = new Map(settling.current);

    if (state) next.set(group, state);
    else next.delete(group);
    settling.current = next;
    setMoving(next);
  }, []);

  // Says where a moved row is now, keeps its control focused and tints it for a while
  const showMoved = useCallback(
    (list: readonly Category[], id: string, by: Direction, from: "button" | "menu") => {
      refocus.current = { id, by, from };
      setMarked(id);
      clearTimeout(unmark.current);
      unmark.current = setTimeout(() => setMarked(undefined), 2000);

      const row = categoryRows(list).find((item) => item.id === id);

      if (row)
        setMoved(`${row.title} moved ${by < 0 ? "up" : "down"}: ${row.place} of ${row.siblings}`);
    },
    [],
  );

  // An independent read: a pre-write query or another group's cancellation must not settle this move.
  const checkMove = useCallback(
    async (group: string, order: CategoryOrder) => {
      settle(group, "saving");
      setMoved("Checking whether the move was saved…");
      const result = await api.categories();

      if (!result.ok) {
        settle(group, order);
        setMoved("");
        toast(
          "We couldn’t tell whether the category moved. Check your connection, then try again.",
          {
            tone: "error",
          },
        );

        return undefined;
      }

      settle(group);
      void client.invalidateQueries({ queryKey: ["content"] });

      return result.value;
    },
    [api, client, settle],
  );

  // Reads the list as it is now, so each move is made from the latest versions of its siblings
  const move = useCallback(
    async (row: CategoryRow, by: Direction, from: "button" | "menu") => {
      const group = groupOf(row);
      const unsettled = settling.current.get(group);

      if (unsettled === "saving") return;

      // Settle the lost one first; the author presses again once the list says where things are
      if (unsettled) {
        const list = await checkMove(group, unsettled);

        if (list)
          setMoved(
            inOrder(list, unsettled)
              ? "The last move was saved."
              : "We couldn’t find the last move in the list yet. Check the order before moving it again.",
          );

        return;
      }

      const order = moveOrder(categories.data ?? [], row.id, by);

      if (!order) return;
      settle(group, "saving");
      const result = await api.orderCategories(order);

      if (result.ok) {
        // A background read that started before the move mustn't put the old order back
        await client.cancelQueries({ queryKey: categoriesQuery(api).queryKey });

        const list = client.setQueryData(categoriesQuery(api).queryKey, (current) =>
          withSavedCategories(current ?? [], result.value),
        );

        settle(group);
        showMoved(list ?? [], row.id, by, from);
        void client.invalidateQueries({ queryKey: ["content"] });

        return;
      }

      switch (result.error._tag) {
        case "CategoryOutcomeUnknown": {
          const list = await checkMove(group, order);

          if (list && inOrder(list, order)) showMoved(list, row.id, by, from);
          else if (list)
            setMoved(
              "We couldn’t find that move in the list yet. Check the order before moving it again.",
            );

          return;
        }

        case "CategoryConflict":
          settle(group);
          setMoved("");
          toast(
            "Someone changed these categories first. The list now shows their changes: move it again.",
            {
              tone: "error",
            },
          );
          void client.invalidateQueries({ queryKey: ["content"] });

          return;
        default:
          settle(group);
          setMoved("");
          toast(
            result.error._tag === "CategoryAccessDenied"
              ? result.error.status === 401
                ? "Your session has ended. Sign in again, then move the category."
                : // A refusal, such as no editor role: the API's reason, since trying again won't help
                  result.error.message
              : "The category could not be moved. Try again.",
            { tone: "error" },
          );
      }
    },
    [api, categories.data, checkMove, client, settle, showMoved],
  );

  // One value until a move's list or its groups' state changes, so the rest of the screen's updates leave rows be
  const actions = useMemo<RowActions>(
    () => ({
      move: (row, by, from) => void move(row, by, from),
      moving: (row) => moving.get(groupOf(row)) === "saving",
      readOnly,
      edit: (row) => setDialog({ kind: "edit", category: row }),
      remove: (row) => setDialog({ kind: "delete", category: row }),
    }),
    [move, moving, readOnly],
  );

  useEffect(() => () => clearTimeout(unmark.current), []);

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
        <div
          ref={card}
          className="@container min-w-0 rounded-sm bg-white shadow-sheet ring-1 ring-grey-40"
        >
          <p role="status" className="sr-only">
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
              marked={marked}
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
        {dialog?.kind === "edit" && (
          <CategoryDialog
            api={api}
            category={dialog.category}
            categories={categories.data ?? []}
            close={close}
          />
        )}
        {dialog?.kind === "delete" && (
          <DeleteCategoryDialog
            api={api}
            category={dialog.category}
            categories={categories.data ?? []}
            close={close}
            focusAfter={add}
          />
        )}
      </table.AppTable>
    </Actions>
  );
}
