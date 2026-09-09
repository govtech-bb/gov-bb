import { isSafeContentUrl } from "@govtech-bb/content/markdown-authoring";
import { INSERT_HORIZONTAL_RULE_COMMAND } from "@lexical/extension";
import { $toggleLink, $isLinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
} from "@lexical/list";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from "@lexical/react/LexicalTypeaheadMenuPlugin";
import { $setBlocksType } from "@lexical/selection";
import { INSERT_TABLE_COMMAND } from "@lexical/table";
import { $insertNodeToNearestRoot } from "@lexical/utils";
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
  $isQuoteNode,
  type HeadingTagType,
} from "@lexical/rich-text";
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $nodesOfType,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  REDO_COMMAND,
  SELECTION_CHANGE_COMMAND,
  UNDO_COMMAND,
  type LexicalEditor,
  type LexicalNode,
  type TextNode,
} from "lexical";
import {
  AddSquareIcon,
  LeftToRightListBulletIcon,
  LeftToRightListNumberIcon,
  Link01Icon,
  MinusSignIcon,
  PlayCircleIcon,
  QuoteUpIcon,
  Redo02Icon,
  Table01Icon,
  TextBoldIcon,
  TextItalicIcon,
  Undo02Icon,
} from "hugeicons-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { mergeRegister } from "@lexical/utils";
import {
  $createLandingComponentNode,
  $createStartLinkNode,
  StartLinkNode,
} from "./-body-editor-nodes";
import {
  $exportMarkdown,
  $loadMarkdown,
  EDITOR_TRANSFORMERS,
} from "./-body-editor-markdown";
import type { BodyEditorProfile } from "./-body-editor-types";
import { Tip } from "./-sliding-tabs";
import s from "./-styles.module.css";

const IMPORT_TAG = "body-editor:markdown-import";

export function MarkdownSyncPlugin({
  enabled,
  value,
  onChange,
}: {
  enabled: boolean;
  value: string;
  onChange: (next: string) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const loadedValue = useRef<string | null>(null);
  const emittedValue = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (!enabled) return;
    if (loadedValue.current === value || emittedValue.current === value) {
      loadedValue.current = value;
      return;
    }
    loadedValue.current = value;
    editor.update(() => $loadMarkdown(value), { tag: IMPORT_TAG });
  }, [editor, enabled, value]);

  const handleChange = useCallback(
    (
      editorState: Parameters<
        Parameters<typeof OnChangePlugin>[0]["onChange"]
      >[0],
      _editor: LexicalEditor,
      tags: Set<string>,
    ) => {
      if (!enabled || tags.has(IMPORT_TAG)) return;
      const next = editorState.read(() => $exportMarkdown());
      if (next === emittedValue.current || next === loadedValue.current) return;
      emittedValue.current = next;
      loadedValue.current = next;
      onChange(next);
    },
    [enabled, onChange],
  );

  return (
    <>
      <OnChangePlugin
        ignoreHistoryMergeTagChange
        ignoreSelectionChange
        onChange={handleChange}
      />
      <MarkdownShortcutPlugin transformers={EDITOR_TRANSFORMERS} />
    </>
  );
}

function selectedBlock(node: LexicalNode | null): LexicalNode | null {
  let current = node;
  while (current?.getParent() && current.getParent()?.getType() !== "root") {
    current = current.getParent();
  }
  return current;
}

function ToolbarButton({
  label,
  icon,
  active,
  disabled,
  className = "",
  text,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  text?: string;
  onClick: () => void;
}) {
  return (
    <Tip label={label}>
      <button
        type="button"
        className={`${s.toolBtn} ${active ? s.toolBtnActive : ""} ${className}`}
        aria-label={label}
        aria-pressed={active || undefined}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClick}
      >
        {icon}
        {text && <span>{text}</span>}
      </button>
    </Tip>
  );
}

function insertDecorator(node: LexicalNode): void {
  const inserted = $insertNodeToNearestRoot(node);
  if (!inserted.getNextSibling()) inserted.insertAfter($createParagraphNode());
}

function insertStartLink(): void {
  const existing = $nodesOfType(StartLinkNode)[0];
  const values = existing?.getValues() ?? { label: "Start now", href: "" };
  existing?.remove();
  insertDecorator($createStartLinkNode(values.label, values.href));
}

interface InsertChoice {
  key: string;
  label: string;
  description: string;
  insert: () => void;
}

function landingChoices(profile: BodyEditorProfile): InsertChoice[] {
  if (profile.kind !== "landing-page") return [];
  const choices: InsertChoice[] = [
    {
      key: "notice",
      label: "Notice",
      description: "Call out important information.",
      insert: () =>
        insertDecorator(
          $createLandingComponentNode({
            kind: "notice",
            body: "Add important information.",
          }),
        ),
    },
    {
      key: "actions",
      label: "Action group",
      description: "Add one or more prominent links.",
      insert: () =>
        insertDecorator(
          $createLandingComponentNode({
            kind: "actions",
            actions: [{ label: "Continue", href: "/", variant: "primary" }],
          }),
        ),
    },
    {
      key: "details",
      label: "Show / hide",
      description: "Put supporting content in a disclosure.",
      insert: () =>
        insertDecorator(
          $createLandingComponentNode({
            kind: "details",
            summary: "What you need to know",
            body: "Add supporting information.",
          }),
        ),
    },
  ];
  if (profile.startLinkType !== "none") {
    choices.push({
      key: "start",
      label: "Start button",
      description: "Place or move this page’s start action.",
      insert: insertStartLink,
    });
  }
  return choices;
}

function InsertMenu({
  editor,
  profile,
}: {
  editor: LexicalEditor;
  profile: BodyEditorProfile;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const choices = useMemo(() => landingChoices(profile), [profile]);

  useEffect(() => {
    if (!open) return;
    wrapperRef.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
      ?.focus();
    const dismiss = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  if (choices.length === 0) return null;

  return (
    <div className={s.insertMenuWrap} ref={wrapperRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`${s.toolBtn} ${s.insertMenuButton}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((current) => !current)}
      >
        <AddSquareIcon size={15} aria-hidden="true" />
        Insert
      </button>
      {open && (
        <div
          className={s.insertMenu}
          role="menu"
          aria-label="Insert component"
          onKeyDown={(event) => {
            const items = [
              ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                '[role="menuitem"]',
              ),
            ];
            const currentIndex = items.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            let nextIndex: number | null = null;
            if (event.key === "ArrowDown") {
              nextIndex = (currentIndex + 1) % items.length;
            } else if (event.key === "ArrowUp") {
              nextIndex = (currentIndex - 1 + items.length) % items.length;
            } else if (event.key === "Home") {
              nextIndex = 0;
            } else if (event.key === "End") {
              nextIndex = items.length - 1;
            } else if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
              triggerRef.current?.focus();
            }
            if (nextIndex !== null) {
              event.preventDefault();
              items[nextIndex]?.focus();
            }
          }}
        >
          {choices.map((choice) => (
            <button
              key={choice.key}
              type="button"
              role="menuitem"
              className={s.insertMenuItem}
              onClick={() => {
                editor.update(choice.insert);
                editor.focus();
                setOpen(false);
              }}
            >
              <strong>{choice.label}</strong>
              <span>{choice.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LinkEditor({
  editor,
  initialUrl,
  onClose,
}: {
  editor: LexicalEditor;
  initialUrl: string;
  onClose: () => void;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [error, setError] = useState("");
  const errorId = useId();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next = url.trim();
    if (next && !isSafeContentUrl(next)) {
      setError("Use a safe web, email, telephone, or relative link.");
      return;
    }
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, next || null);
    editor.focus();
    onClose();
  };

  return (
    <form className={s.linkEditor} onSubmit={submit}>
      <label>
        <span>Link address</span>
        <input
          type="text"
          value={url}
          autoFocus
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? errorId : undefined}
          placeholder="https://… or /internal/path"
          onChange={(event) => {
            setUrl(event.target.value);
            setError("");
          }}
        />
      </label>
      {error && (
        <small id={errorId} role="alert">
          {error}
        </small>
      )}
      <div className={s.linkEditorActions}>
        <button type="submit">Apply</button>
        {initialUrl && (
          <button
            type="button"
            onClick={() => {
              editor.update(() => $toggleLink(null));
              editor.focus();
              onClose();
            }}
          >
            Remove link
          </button>
        )}
        <button type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function EditorToolbar({ profile }: { profile: BodyEditorProfile }) {
  const [editor] = useLexicalComposerContext();
  const [blockFormat, setBlockFormat] = useState<"p" | HeadingTagType>("p");
  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkEditorOpen, setLinkEditorOpen] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const refresh = useCallback(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;
    setBold(selection.hasFormat("bold"));
    setItalic(selection.hasFormat("italic"));
    const anchor = selection.anchor.getNode();
    const block = selectedBlock(
      $isTextNode(anchor) ? anchor.getParent() : anchor,
    );
    setBlockFormat($isHeadingNode(block) ? block.getTag() : "p");
    const parent = anchor.getParent();
    const link = $isLinkNode(anchor)
      ? anchor
      : $isLinkNode(parent)
        ? parent
        : null;
    setLinkUrl(link?.getURL() ?? "");
  }, []);

  useEffect(
    () =>
      mergeRegister(
        editor.registerUpdateListener(({ editorState }) =>
          editorState.read(refresh),
        ),
        editor.registerCommand(
          SELECTION_CHANGE_COMMAND,
          () => {
            refresh();
            return false;
          },
          COMMAND_PRIORITY_LOW,
        ),
        editor.registerCommand(
          CAN_UNDO_COMMAND,
          (value) => {
            setCanUndo(value);
            return false;
          },
          COMMAND_PRIORITY_LOW,
        ),
        editor.registerCommand(
          CAN_REDO_COMMAND,
          (value) => {
            setCanRedo(value);
            return false;
          },
          COMMAND_PRIORITY_LOW,
        ),
      ),
    [editor, refresh],
  );

  const setBlock = (tag: "p" | HeadingTagType) => {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      $setBlocksType(selection, () =>
        tag === "p" ? $createParagraphNode() : $createHeadingNode(tag),
      );
    });
  };

  return (
    <div className={s.editorTools} role="toolbar" aria-label="Formatting">
      <select
        className={s.toolSelect}
        value={blockFormat}
        aria-label="Text style"
        onChange={(event) =>
          setBlock(event.target.value as "p" | HeadingTagType)
        }
      >
        <option value="p">Paragraph</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
        <option value="h4">Heading 4</option>
      </select>
      <span className={s.toolSep} aria-hidden="true" />
      <ToolbarButton
        label="Undo"
        icon={<Undo02Icon size={15} aria-hidden="true" />}
        disabled={!canUndo}
        onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
      />
      <ToolbarButton
        label="Redo"
        icon={<Redo02Icon size={15} aria-hidden="true" />}
        disabled={!canRedo}
        onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
      />
      <span className={s.toolSep} aria-hidden="true" />
      <ToolbarButton
        label="Bold"
        icon={<TextBoldIcon size={15} aria-hidden="true" />}
        active={bold}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}
      />
      <ToolbarButton
        label="Italic"
        icon={<TextItalicIcon size={15} aria-hidden="true" />}
        active={italic}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")}
      />
      <span className={s.toolSep} aria-hidden="true" />
      <ToolbarButton
        label="Bullet list"
        icon={<LeftToRightListBulletIcon size={15} aria-hidden="true" />}
        onClick={() =>
          editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)
        }
      />
      <ToolbarButton
        label="Numbered list"
        icon={<LeftToRightListNumberIcon size={15} aria-hidden="true" />}
        onClick={() =>
          editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)
        }
      />
      <ToolbarButton
        label="Quote"
        icon={<QuoteUpIcon size={15} aria-hidden="true" />}
        onClick={() => {
          editor.update(() => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) return;
            const block = selectedBlock(selection.anchor.getNode());
            $setBlocksType(selection, () =>
              $isQuoteNode(block) ? $createParagraphNode() : $createQuoteNode(),
            );
          });
        }}
      />
      <span className={s.toolSep} aria-hidden="true" />
      <ToolbarButton
        label={linkUrl ? "Edit link" : "Add link"}
        icon={<Link01Icon size={15} aria-hidden="true" />}
        active={Boolean(linkUrl)}
        onClick={() => setLinkEditorOpen((current) => !current)}
      />
      <ToolbarButton
        label="Insert table"
        icon={<Table01Icon size={15} aria-hidden="true" />}
        onClick={() =>
          editor.dispatchCommand(INSERT_TABLE_COMMAND, {
            columns: "2",
            rows: "3",
            includeHeaders: { rows: true, columns: false },
          })
        }
      />
      <ToolbarButton
        label="Insert divider"
        icon={<MinusSignIcon size={15} aria-hidden="true" />}
        onClick={() =>
          editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)
        }
      />
      {profile.kind === "landing-page" && profile.startLinkType !== "none" && (
        <ToolbarButton
          label="Place or move Start button"
          icon={<PlayCircleIcon size={15} aria-hidden="true" />}
          className={s.toolBtnStart}
          text="Start"
          onClick={() => editor.update(insertStartLink)}
        />
      )}
      <InsertMenu editor={editor} profile={profile} />
      {linkEditorOpen && (
        <LinkEditor
          editor={editor}
          initialUrl={linkUrl}
          onClose={() => setLinkEditorOpen(false)}
        />
      )}
    </div>
  );
}

class SlashOption extends MenuOption {
  label: string;
  description: string;
  keywords: string[];
  run: (editor: LexicalEditor) => void;

  constructor(choice: {
    key: string;
    label: string;
    description: string;
    keywords?: string[];
    run: (editor: LexicalEditor) => void;
  }) {
    super(choice.key);
    this.label = choice.label;
    this.description = choice.description;
    this.keywords = choice.keywords ?? [];
    this.run = choice.run;
  }
}

function blockOption(
  key: string,
  label: string,
  description: string,
  block: "p" | HeadingTagType | "quote",
): SlashOption {
  return new SlashOption({
    key,
    label,
    description,
    run: () => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      $setBlocksType(selection, () =>
        block === "p"
          ? $createParagraphNode()
          : block === "quote"
            ? $createQuoteNode()
            : $createHeadingNode(block),
      );
    },
  });
}

export function SlashCommandPlugin({
  profile,
}: {
  profile: BodyEditorProfile;
}) {
  const [editor] = useLexicalComposerContext();
  const [query, setQuery] = useState<string | null>(null);
  const trigger = useBasicTypeaheadTriggerMatch("/", { minLength: 0 });

  const options = useMemo(() => {
    const base = [
      blockOption("paragraph", "Paragraph", "Start a plain text block.", "p"),
      blockOption("heading-2", "Heading 2", "Add a section heading.", "h2"),
      blockOption("heading-3", "Heading 3", "Add a subsection heading.", "h3"),
      blockOption("heading-4", "Heading 4", "Add a smaller heading.", "h4"),
      blockOption("quote", "Quote", "Set text apart as a quotation.", "quote"),
      new SlashOption({
        key: "bullets",
        label: "Bullet list",
        description: "Create an unordered list.",
        keywords: ["unordered"],
        run: (currentEditor) =>
          currentEditor.dispatchCommand(
            INSERT_UNORDERED_LIST_COMMAND,
            undefined,
          ),
      }),
      new SlashOption({
        key: "numbers",
        label: "Numbered list",
        description: "Create an ordered list.",
        keywords: ["ordered"],
        run: (currentEditor) =>
          currentEditor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined),
      }),
      new SlashOption({
        key: "table",
        label: "Table",
        description: "Insert a two-column table.",
        run: (currentEditor) =>
          currentEditor.dispatchCommand(INSERT_TABLE_COMMAND, {
            columns: "2",
            rows: "3",
            includeHeaders: { rows: true, columns: false },
          }),
      }),
      new SlashOption({
        key: "divider",
        label: "Divider",
        description: "Separate sections with a line.",
        keywords: ["horizontal rule"],
        run: (currentEditor) =>
          currentEditor.dispatchCommand(
            INSERT_HORIZONTAL_RULE_COMMAND,
            undefined,
          ),
      }),
    ];
    for (const choice of landingChoices(profile)) {
      base.push(
        new SlashOption({
          ...choice,
          run: () => choice.insert(),
        }),
      );
    }
    return base;
  }, [profile]);

  const filtered = useMemo(() => {
    const term = query?.toLowerCase().trim() ?? "";
    if (!term) return options;
    return options.filter((option) =>
      [option.label, ...option.keywords].some((value) =>
        value.toLowerCase().includes(term),
      ),
    );
  }, [options, query]);

  return (
    <LexicalTypeaheadMenuPlugin<SlashOption>
      triggerFn={trigger}
      onQueryChange={setQuery}
      options={filtered}
      onSelectOption={(
        option,
        textNodeContainingQuery: TextNode | null,
        closeMenu,
      ) => {
        editor.update(() => {
          textNodeContainingQuery?.remove();
          option.run(editor);
        });
        closeMenu();
      }}
      menuRenderFn={(anchorElementRef, itemProps) =>
        anchorElementRef.current && itemProps.options.length > 0
          ? createPortal(
              <div className={s.slashMenu} role="listbox" aria-label="Blocks">
                {itemProps.options.map((option, index) => (
                  <button
                    key={option.key}
                    type="button"
                    role="option"
                    aria-selected={itemProps.selectedIndex === index}
                    ref={(element) => option.setRefElement(element)}
                    className={s.slashMenuItem}
                    onMouseEnter={() => itemProps.setHighlightedIndex(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => itemProps.selectOptionAndCleanUp(option)}
                  >
                    <strong>{option.label}</strong>
                    <span>{option.description}</span>
                  </button>
                ))}
              </div>,
              anchorElementRef.current,
            )
          : null
      }
    />
  );
}
