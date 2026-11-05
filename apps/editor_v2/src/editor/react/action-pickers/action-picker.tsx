import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { cn } from "@/cn";
import {
  $availableActions,
  executeAction,
  rankActions,
  type ActionOutcome,
  type ActionRequest,
  type ActionResult,
  type EditorAction,
} from "../../core/actions";
import { useEditorDefinition } from "../composer";
import { ActionDescription, ActionList, actionListBox, cannotInsert } from "./action-list";

type ActionPickerState = {
  /** The actions the request offers, ranked by the search. */
  readonly actions: readonly EditorAction[];
  readonly query: string;
  /** The highlighted action's place in `actions`. */
  readonly index: number;
  readonly selected: EditorAction | undefined;
  readonly error: string | undefined;
  /** Prefixes the ids that tie the search box to the list. */
  readonly ids: string;
  readonly search: (query: string) => void;
  readonly highlight: (index: number) => void;
  readonly choose: (action: EditorAction) => void;
};

const ActionPickerContext = createContext<ActionPickerState | null>(null);

/** An action picker's search, list and highlight, for a part of a picker's own, such as a preview. */
export function useActionPicker() {
  const picker = useContext(ActionPickerContext);

  if (!picker) throw new Error("useActionPicker is only for parts inside an ActionPicker.Root");

  return picker;
}

/**
 * Searches the actions a request offers, ranked as you type, and runs the one chosen. Its parts go in any layout,
 * such as a dialog or a popover: ActionPicker.Search, ActionPicker.List and ActionPicker.Description.
 */
function ActionPickerRoot({
  request,
  insert,
  onInserted,
  children,
}: {
  /** Where the chosen action goes; null offers nothing. */
  request: ActionRequest | null;
  /** Runs the chosen action. By default it runs at the request, in an update of its own. */
  insert?: (action: EditorAction) => ActionOutcome;
  /** After the chosen action ran, which is the picker's host's cue to close it. */
  onInserted: (result: ActionResult | undefined) => void;
  children: ReactNode;
}) {
  const [editor] = useLexicalComposerContext();
  const definition = useEditorDefinition();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string>();
  const ids = useId();

  const actions = useMemo(
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

  const choose = (action: EditorAction) => {
    if (!request) return;
    const outcome = insert ? insert(action) : executeAction(editor, definition, action.id, request);

    if (outcome.executed) onInserted(outcome.result);
    else setError(outcome.error ?? cannotInsert);
  };

  return (
    <ActionPickerContext
      value={{
        actions,
        query,
        index,
        selected: actions[index],
        error,
        ids,
        search(next) {
          setQuery(next);
          setIndex(0);
          setError(undefined);
        },
        highlight: setIndex,
        choose,
      }}
    >
      {children}
    </ActionPickerContext>
  );
}

/** The picker's search box: typing ranks the list, the arrow keys move its highlight and Enter inserts it. */
function ActionPickerSearch({
  label,
  ...props
}: Omit<
  ComponentProps<"input">,
  "role" | "value" | "onChange" | "onKeyDown" | "aria-label" | "aria-controls"
> & {
  label: string;
}) {
  const { actions, index, selected, query, ids, search, highlight, choose } = useActionPicker();

  return (
    <input
      {...props}
      role="combobox"
      aria-label={label}
      aria-expanded
      aria-controls={`${ids}-list`}
      aria-activedescendant={selected ? `${ids}-${index}` : undefined}
      value={query}
      onChange={(event) => search(event.target.value)}
      onKeyDown={(event) => {
        if ((event.key === "ArrowDown" || event.key === "ArrowUp") && actions.length) {
          event.preventDefault();
          highlight(
            (index + (event.key === "ArrowDown" ? 1 : -1) + actions.length) % actions.length,
          );
        } else if (event.key === "Enter" && selected) {
          event.preventDefault();
          choose(selected);
        }
      }}
    />
  );
}

/** The picker's list: in groups until a search ranks it, keeping the highlighted row in view. */
function ActionPickerList({
  label,
  empty,
  className,
}: {
  /** Names the list for screen readers. */
  label: string;
  /** What the list says when a search finds nothing. */
  empty: string;
  className?: string;
}) {
  const { actions, index, query, error, ids, highlight, choose } = useActionPicker();
  const list = useRef<HTMLDivElement>(null);
  const shown = useRef({ index, query });

  // Only once the highlight moves or the search changes: the popup may not be positioned on its first render
  useEffect(() => {
    if (shown.current.index === index && shown.current.query === query) return;
    shown.current = { index, query };
    list.current?.querySelector("[aria-selected=true]")?.scrollIntoView({ block: "nearest" });
  }, [index, query]);

  return (
    <div
      ref={list}
      id={`${ids}-list`}
      role="listbox"
      aria-label={label}
      className={cn(actionListBox, className)}
    >
      <ActionList
        actions={actions}
        searching={!!query.trim()}
        selectedIndex={index}
        onHighlight={highlight}
        onSelect={choose}
        optionId={(i) => `${ids}-${i}`}
        error={error}
        empty={empty}
      />
    </div>
  );
}

/** The highlighted action's description, under the list. */
function ActionPickerDescription() {
  return <ActionDescription action={useActionPicker().selected} />;
}

/** A search over the actions an editor can insert, made of parts a dialog or a popover lays out (see ActionPickerRoot). */
export const ActionPicker = {
  Root: ActionPickerRoot,
  Search: ActionPickerSearch,
  List: ActionPickerList,
  Description: ActionPickerDescription,
};
