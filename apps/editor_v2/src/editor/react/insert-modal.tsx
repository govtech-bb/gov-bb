import { Dialog } from "@base-ui/react/dialog";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "../../cn";
import { ItemLabel, item, sectionLabel } from "../../ui/item";
import {
  $availableActions,
  executeAction,
  matchesAction,
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
            .read(
              () =>
                $availableActions(editor, definition, request).filter(
                  (action) => !query.trim() || matchesAction(action, query),
                ),
              { editor },
            )
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
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-ink/40 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup
          finalFocus={false}
          className="fixed top-[12vh] left-1/2 z-50 flex h-[min(560px,76vh)] w-[min(760px,calc(100vw-32px))] -translate-x-1/2 flex-col overflow-hidden rounded-sm bg-white font-sans text-ink shadow-popup outline-none transition data-ending-style:translate-y-2.5 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:translate-y-2.5 data-starting-style:scale-95 data-starting-style:opacity-0"
        >
          <Dialog.Title className="sr-only">Insert a block</Dialog.Title>
          {error && (
            <div role="alert" className="px-4 py-2 text-14 text-red-700">
              {error}
            </div>
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
              className="w-64 shrink-0 overflow-y-auto border-r border-line py-1.5 max-sm:w-full max-sm:border-r-0"
            >
              {results.length === 0 && (
                <div className="px-3.5 py-1.5 text-14 text-muted">No blocks match</div>
              )}
              {sectioned(results).map(({ group, items }) => (
                <div
                  key={group}
                  className="not-last:mb-1.5 not-last:border-b not-last:border-line not-last:pb-1.5"
                >
                  <div className={cn(sectionLabel, "px-3.5")}>{group}</div>
                  {items.map(({ item: hit, index: i }) => (
                    <div
                      key={hit.id}
                      id={optionId(i)}
                      role="option"
                      aria-selected={i === index}
                      data-highlighted={i === index ? "" : undefined}
                      className={item}
                      onMouseEnter={() => setIndex(i)}
                      onClick={() => insert(hit)}
                    >
                      <ItemLabel icon={hit.icon}>{hit.title}</ItemLabel>
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
                  {current.preview}
                </>
              ) : (
                <>
                  <div className="text-16 font-semibold">No results</div>
                  <p className="mt-1 text-14 leading-5 text-muted">
                    No blocks match your search. Try another word.
                  </p>
                </>
              )}
              <p className="mt-auto flex items-center gap-1 pt-4 text-12 leading-4 text-muted">
                <Key>↑</Key>
                <Key>↓</Key>
                <span className="mr-2">to browse</span>
                <Key>Enter</Key>
                <span>to insert</span>
              </p>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const Key = ({ children }: { children: ReactNode }) => (
  <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-xs bg-white px-1 font-sans text-12 font-semibold text-ink shadow-input">
    {children}
  </kbd>
);
