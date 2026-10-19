import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Banner } from "../../ui/banner";
import { Dialog } from "../../ui/dialog";
import { Kbd } from "../../ui/kbd";
import { RowContent } from "../../ui/menu";
import { EmptyState } from "../../ui/empty-state";
import { PreviewSheet } from "../../ui/preview-sheet";
import { groupLabel, listEmpty, row } from "../../ui/surface";
import {
  $availableActions,
  executeAction,
  rankActions,
  sectioned,
  type ActionRequest,
  type EditorAction,
} from "../core/actions";
import { useEditorDefinition } from "./composer";

/** Search configured actions and display their feature-owned previews. */
export function InsertModal({
  request,
  onClose,
  searchPlaceholder = "Find blocks",
}: {
  request: ActionRequest | null;
  onClose: () => void;
  searchPlaceholder?: string;
}) {
  const [editor] = useLexicalComposerContext();
  const definition = useEditorDefinition();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string>();
  const pendingFocus = useRef<(() => void) | undefined>(undefined);

  const results = useMemo(
    () =>
      request
        ? editor
            .getEditorState()
            .read(() => rankActions(query, $availableActions(editor, definition, request)), {
              editor,
            })
        : [],
    [editor, definition, request, query],
  );

  const current = results[index];
  const list = useRef<HTMLDivElement>(null);
  const ids = useId();
  const optionId = (i: number) => `${ids}-${i}`;

  useEffect(() => {
    list.current?.querySelector("[data-highlighted]")?.scrollIntoView({ block: "nearest" });
  }, [index, results]);

  const insert = (action: EditorAction) => {
    if (!request) return;
    const outcome = executeAction(editor, definition, action.id, request);

    if (!outcome.executed) {
      setError(outcome.error);

      return;
    }

    pendingFocus.current = outcome.result?.afterClose;
    onClose();
  };

  return (
    <Dialog.Root
      open={request !== null}
      onOpenChange={(open) => !open && onClose()}
      onOpenChangeComplete={(open) => {
        if (open) return;
        setQuery("");
        setIndex(0);
        setError(undefined);
        const focus = pendingFocus.current;
        pendingFocus.current = undefined;

        if (focus) focus();
        else editor.focus();
      }}
    >
      {/* High on the page, so the list grows down from where the eye already is */}
      <Dialog.Content
        size="lg"
        close={false}
        finalFocus={false}
        className="mt-[12vh] h-[min(560px,76vh)] self-start pb-0"
      >
        <Dialog.Title className="sr-only">Insert a block</Dialog.Title>
        {error && (
          <Banner tone="error" layout="strip" className="px-4">
            {error}
          </Banner>
        )}
        <label className="flex h-12 shrink-0 items-center gap-2.5 border-b border-line px-4">
          <MagnifyingGlass className="size-4 shrink-0 text-muted" />
          <input
            autoFocus
            value={query}
            role="combobox"
            aria-label="Search blocks"
            aria-expanded
            aria-controls={`${ids}-list`}
            aria-activedescendant={current ? optionId(index) : undefined}
            placeholder={searchPlaceholder}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
              setError(undefined);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const step = e.key === "ArrowDown" ? 1 : -1;

                if (results.length) setIndex((i) => (i + step + results.length) % results.length);
              } else if (e.key === "Enter" && current) {
                e.preventDefault();
                insert(current);
              }
            }}
            className="h-full min-w-0 flex-1 text-16 outline-none placeholder:text-placeholder"
          />
        </label>
        <div className="flex min-h-0 flex-1">
          <div
            ref={list}
            id={`${ids}-list`}
            role="listbox"
            aria-label="Blocks"
            className="w-64 shrink-0 overflow-y-auto border-r border-line py-1 max-sm:w-full max-sm:border-r-0"
          >
            {results.length === 0 && <div className={listEmpty}>No blocks match</div>}
            {/* A search ranks one list; before it, the blocks are in their groups */}
            {(query.trim()
              ? [{ group: "", items: results.map((item, i) => ({ item, index: i })) }]
              : sectioned(results)
            ).map(({ group, items }) => (
              <div
                key={group}
                className="not-last:mb-1 not-last:border-b not-last:border-line not-last:pb-1"
              >
                {group && <div className={groupLabel}>{group}</div>}
                {items.map(({ item: hit, index: i }) => (
                  <div
                    key={hit.id}
                    id={optionId(i)}
                    role="option"
                    aria-label={hit.title}
                    aria-selected={i === index}
                    data-highlighted={i === index ? "" : undefined}
                    className={row}
                    onMouseEnter={() => setIndex(i)}
                    onClick={() => insert(hit)}
                  >
                    <RowContent icon={hit.icon} detail={hit.markdown}>
                      {hit.title}
                    </RowContent>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="flex min-w-0 flex-1 flex-col overflow-y-auto p-6 max-sm:hidden">
            {current ? (
              <>
                <div className="text-16 font-semibold">{current.title}</div>
                <p className="mt-1 text-14 leading-5 text-muted">{current.description}</p>
                {current.preview && <PreviewSheet>{current.preview}</PreviewSheet>}
              </>
            ) : (
              <EmptyState
                kind="not-found"
                title="No results"
                description="No blocks match your search. Try another word."
              />
            )}
            <p className="mt-auto flex items-center gap-1 pt-4 text-12 leading-4 text-muted">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              <span className="mr-2">to browse</span>
              <Kbd>Enter</Kbd>
              <span>to insert</span>
            </p>
          </div>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}
