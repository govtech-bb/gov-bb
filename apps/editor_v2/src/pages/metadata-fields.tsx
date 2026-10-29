import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import {
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  HISTORIC_TAG,
  HISTORY_PUSH_TAG,
  KEY_ARROW_UP_COMMAND,
  REDO_COMMAND,
  SKIP_DOM_SELECTION_TAG,
  UNDO_COMMAND,
  type LexicalEditor,
} from "lexical";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { parseDocument } from "yaml";
import { HISTORY_START_TAG } from "../editor/core/history";
import { Field, FieldGroup, FieldText } from "../ui/field";
import { Input } from "../ui/input";
import { NativeSelect } from "../ui/native-select";
import { SidePanel } from "../ui/side-panel";
import { Tag } from "../ui/tag";
import { StatusDot, type StatusTone } from "../ui/status-dot";
import { Textarea } from "../ui/textarea";
import {
  $pageMetadataNode,
  $setPageMetadata,
  PageMetadataNode,
  pageMetadataFromYaml,
  type PageMetadata,
} from "./metadata";

/** The page's metadata as the editor holds it, kept current as it changes. */
export function usePageMetadata() {
  const [editor] = useLexicalComposerContext();

  const yaml = useSyncExternalStore(
    (notify) => editor.registerUpdateListener(notify),
    () => editor.getEditorState().read(() => $pageMetadataNode().getYaml(), { editor }),
  );

  return { editor, yaml, metadata: pageMetadataFromYaml(yaml) };
}

/** Metadata fields share the body editor's history and read-only state. */
export function useMetadataUpdate() {
  const { editor, yaml, metadata } = usePageMetadata();
  const editable = useLexicalEditable();
  const typing = useRef(false);
  useEffect(
    () =>
      editor.registerUpdateListener(({ tags }) => {
        // Toolbar history keeps focus in the field, so focus events cannot end this typing group.
        if (tags.has(HISTORIC_TAG)) typing.current = false;
      }),
    [editor],
  );

  const update = (values: PageMetadata, discrete = false) => {
    if (!editable) return;
    // Typing in a field starts an undo step and continues it, as typing on the page does
    const history = discrete ? HISTORY_PUSH_TAG : typing.current ? undefined : HISTORY_START_TAG;
    // At once, so the field already holds its new value when React checks it: a later update would move the caret.
    // The field keeps the focus: otherwise the page's last selection is put back, and the typing follows it there
    editor.update(() => $setPageMetadata(values), {
      discrete: true,
      tag: history ? [SKIP_DOM_SELECTION_TAG, history] : SKIP_DOM_SELECTION_TAG,
    });
    typing.current = !discrete;
  };

  const historyKeys = {
    onFocusCapture: () => {
      typing.current = false;
    },
    onKeyDown: (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();

      if (key !== "z" && key !== "y") return;
      event.preventDefault();
      editor.dispatchCommand(
        key === "y" || event.shiftKey ? REDO_COMMAND : UNDO_COMMAND,
        undefined,
      );
    },
  };

  return { editor, yaml, metadata, editable, update, historyKeys };
}

/** Resize a metadata textarea without replacing its value or selection. */
export function useAutoHeight(value: string | undefined) {
  const input = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const element = input.current;

    if (!element) return;

    const resize = () => {
      if (!element.clientWidth) return;
      element.style.height = "0px";
      element.style.height = `${element.scrollHeight}px`;
    };

    let width = element.clientWidth;

    const observer = new ResizeObserver(() => {
      if (element.clientWidth !== width) {
        width = element.clientWidth;
        resize();
      }
    });

    resize();
    observer.observe(element);

    return () => observer.disconnect();
  }, [value]);

  return input;
}

// The page's first block, where its body starts
const $firstBlock = () =>
  $getRoot()
    .getChildren()
    .find((node) => !(node instanceof PageMetadataNode));

/** Whether the caret is on the first line of the page's body, where ArrowUp goes back to the introduction. */
function onFirstLine(editor: LexicalEditor) {
  const first = editor.getEditorState().read(
    () => {
      const selection = $getSelection();
      const block = $firstBlock();

      return $isRangeSelection(selection) &&
        selection.isCollapsed() &&
        block &&
        (block.is(selection.anchor.getNode()) || block.isParentOf(selection.anchor.getNode()))
        ? block.getKey()
        : null;
    },
    { editor },
  );

  const element = first && editor.getElementByKey(first);
  const selection = window.getSelection();
  const caret = selection?.rangeCount ? selection.getRangeAt(0).getClientRects()[0] : undefined;

  // An empty line has no caret box to measure, and is one line
  return !!element && (!caret || caret.top - element.getBoundingClientRect().top < caret.height);
}

const composing = (event: KeyboardEvent<HTMLTextAreaElement>) =>
  event.nativeEvent.isComposing || event.keyCode === 229;

const plain = (event: KeyboardEvent) =>
  !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey;

const atEnd = (field: HTMLTextAreaElement) =>
  field.selectionStart === field.value.length && field.selectionEnd === field.value.length;

/** Moves the focus into a field, with the caret at the end of its text. */
function enter(field: HTMLTextAreaElement | null) {
  field?.focus();
  field?.setSelectionRange(field.value.length, field.value.length);
}

/**
 * Shares title and introduction editing between the canvas and site preview.
 * Enter and boundary arrow keys move between these fields and the body, preserving editor history.
 */
export function useHeadingFields() {
  const { editor, metadata, editable, update, historyKeys } = useMetadataUpdate();
  const title = useAutoHeight(metadata.title);
  const lede = useAutoHeight(metadata.lede);

  useEffect(
    () =>
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        (event) => {
          if (event?.shiftKey || !onFirstLine(editor)) return false;
          event?.preventDefault();
          enter(lede.current);

          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    [editor, lede],
  );

  // Into the body, at its start: focused first, so the browser's own caret doesn't land after
  const toBody = () => {
    editor.focus();
    editor.update(
      () => {
        const first = $firstBlock();

        if ($isElementNode(first)) first.selectStart();
      },
      { discrete: true },
    );
  };

  const titleProps = {
    ref: title,
    "aria-label": "Page title",
    rows: 1,
    value: metadata.title ?? "",
    readOnly: !editable,
    placeholder: "Untitled page",
    onChange: (event: ChangeEvent<HTMLTextAreaElement>) => update({ title: event.target.value }),
    ...historyKeys,
    onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (composing(event)) return;

      if (
        event.key === "Enter" ||
        (event.key === "ArrowDown" && plain(event) && atEnd(event.currentTarget))
      ) {
        event.preventDefault();

        if (plain(event) || event.key === "ArrowDown") enter(lede.current);
      } else historyKeys.onKeyDown(event);
    },
  };

  const ledeProps = {
    ref: lede,
    "aria-label": "Introduction",
    rows: 1,
    value: metadata.lede ?? "",
    readOnly: !editable,
    placeholder: "Add an introduction (optional)",
    onChange: (event: ChangeEvent<HTMLTextAreaElement>) =>
      update({ lede: event.target.value || undefined }),
    ...historyKeys,
    onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => {
      const field = event.currentTarget;

      if (composing(event) || !plain(event)) historyKeys.onKeyDown(event);
      else if (event.key === "Enter" || (event.key === "ArrowDown" && atEnd(field))) {
        event.preventDefault();
        toBody();
      } else if (
        event.key === "ArrowUp" &&
        field.selectionStart === 0 &&
        field.selectionEnd === 0
      ) {
        event.preventDefault();
        enter(title.current);
      }
    },
  };

  return { titleProps, ledeProps };
}

/** Editable page headings with keyboard navigation into the body and shared undo history. */
export function PageTitleField({ error }: { error?: string }) {
  const { titleProps, ledeProps } = useHeadingFields();

  return (
    <div className="mb-9">
      <label className="block">
        <span className="sr-only">Page title</span>
        {/* Balanced only while it isn't being typed in, so its lines don't shift with every key */}
        <textarea
          {...titleProps}
          className="block min-h-[1.2em] w-full resize-none overflow-hidden rounded-sm text-[clamp(1.875rem,3vw,2.5rem)] leading-[1.2] font-bold tracking-tight text-ink outline-none not-focus:text-balance placeholder:text-subtle"
          aria-invalid={error ? true : undefined}
        />
      </label>
      {error && <p className="text-14 text-error">{error}</p>}
      <textarea
        {...ledeProps}
        className="mt-5 block w-full resize-none overflow-hidden rounded-sm text-20 leading-[1.6] text-muted outline-none placeholder:text-subtle"
      />
    </div>
  );
}

export type PageCategory = {
  slug: string;
  title: string;
  subcategories?: readonly { slug: string; title: string }[];
};

// Live is green, link-only is amber, draft is grey; the label always travels with the colour.
export const visibilityTones = new Map<string, StatusTone>([
  ["", "success"],
  ["public", "success"],
  ["preview", "warning"],
  ["draft", "neutral"],
]);

export const visibilityLabels = new Map([
  ["", "Public"],
  ["public", "Public"],
  ["preview", "Preview link only"],
  ["draft", "Draft (hidden)"],
]);

const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" });

/** A value the panel can't offer a control for, such as a list where it expects text: kept as written. */
function Preserved({ label, error }: { label: string; error?: string }) {
  return (
    <FieldText label={label} error={error}>
      <span className="text-muted">This value is preserved. Edit it in Markdown.</span>
    </FieldText>
  );
}

export type PageSettingsOptions = {
  categories?: readonly PageCategory[];
  /** A page files under one category, so the picker hides once one is chosen. */
  single?: boolean;
  /** When the server dates publication, its date shown read-only; null until the page first goes public. */
  publishedAt?: string | null;
  /** The accepted server visibility, so an unsaved change can return to a legacy draft. */
  savedVisibility?: string;
  /** Why the host refused each field, keyed by field name. */
  errors?: Readonly<Record<string, string>>;
  /** Visibility shown but not offered, for someone who isn't an approver. */
  visibilityLocked?: boolean;
};

/** The page's settings, in sections for its side panel: how it's published, its details and where it's filed. */
export function PageSettings({
  categories = [],
  single = false,
  publishedAt,
  savedVisibility,
  errors = {},
  visibilityLocked = false,
}: PageSettingsOptions) {
  const { metadata, yaml, editable, update, historyKeys } = useMetadataUpdate();
  const document = parseDocument(yaml);

  const unsupported = (key: keyof PageMetadata) =>
    document.has(key) && document.get(key) != null && metadata[key] === undefined;

  const selected = [
    ...new Set([...(metadata.category ? [metadata.category] : []), ...(metadata.categories ?? [])]),
  ];

  const subcategories = categories.flatMap((category) =>
    selected.includes(category.slug) ? (category.subcategories ?? []) : [],
  );

  const visibility = metadata.visibility ?? "";
  const showDraft = visibility === "draft" || savedVisibility === "draft";
  const unusualVisibility = !["", "public", "preview", "draft"].includes(visibility);

  const date =
    (publishedAt === undefined ? metadata.publish_date : publishedAt?.slice(0, 10)) ?? "";

  const parsedDate = new Date(date);

  const unusualDate =
    date !== "" &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      date.startsWith("0000") ||
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== date);

  const changeCategories = (next: string[]) => {
    const patch: PageMetadata = {
      category: next.length === 1 ? next[0] : undefined,
      categories: next.length > 1 ? next : undefined,
    };

    if (
      categories.length > 0 &&
      metadata.subcategory &&
      !categories.some(
        (category) =>
          next.includes(category.slug) &&
          category.subcategories?.some((item) => item.slug === metadata.subcategory),
      )
    )
      patch.subcategory = undefined;
    update(patch, true);
  };

  const filed = categories.length > 0 || document.has("category") || document.has("categories");

  const subcategory = subcategories.length > 0 || document.has("subcategory");

  return (
    // The fields' undo and redo are the editor's, so the page keeps one history
    <fieldset className="contents" disabled={!editable} {...historyKeys}>
      <SidePanel.Section title="Publishing">
        {unsupported("visibility") ? (
          <Preserved label="Visibility" error={errors.visibility} />
        ) : visibilityLocked ? (
          <FieldText label="Visibility" error={errors.visibility}>
            <span className="flex items-center gap-2">
              <StatusDot tone={visibilityTones.get(visibility) ?? "neutral"} />
              {visibilityLabels.get(visibility) ?? visibility}
            </span>
            <span className="block text-muted">
              Only approvers can change who can see this page.
            </span>
          </FieldText>
        ) : (
          <Field
            label="Visibility"
            hint={
              showDraft
                ? "Draft pages are hidden, even from preview links. Visibility changes take effect only when you save."
                : undefined
            }
            error={errors.visibility}
          >
            <NativeSelect
              icon={<StatusDot tone={visibilityTones.get(visibility) ?? "neutral"} />}
              value={visibility === "public" ? "" : visibility}
              onChange={(event) => update({ visibility: event.target.value || undefined }, true)}
            >
              {["", "preview"].map((value) => (
                <option key={value} value={value}>
                  {visibilityLabels.get(value)}
                </option>
              ))}
              {showDraft && (
                <option value="draft" disabled={visibility === "draft"}>
                  {visibilityLabels.get("draft")}
                </option>
              )}
              {unusualVisibility && (
                <option value={visibility}>{visibility} (from Markdown)</option>
              )}
            </NativeSelect>
          </Field>
        )}
        {unsupported("publish_date") ? (
          <Preserved label="Publication date" error={errors.publish_date} />
        ) : publishedAt !== undefined ? (
          <FieldText label="Publication date" error={errors.publish_date}>
            {date ? (
              dateFormat.format(parsedDate)
            ) : (
              <span className="text-muted">Set when the page is first made public</span>
            )}
          </FieldText>
        ) : (
          <Field
            label="Publication date"
            hint={unusualDate ? "This date is preserved. Edit it in Markdown." : undefined}
            error={errors.publish_date}
          >
            {unusualDate ? (
              <Input value={date} readOnly />
            ) : (
              <Input
                type="date"
                value={date}
                onChange={(event) => {
                  if (event.target.validity.valid)
                    update({ publish_date: event.target.value || undefined }, true);
                }}
              />
            )}
          </Field>
        )}
      </SidePanel.Section>
      <SidePanel.Section title="Details">
        {document.has("url") &&
          (unsupported("url") ? (
            <Preserved label="Path" error={errors.url} />
          ) : (
            <Field label="Path" error={errors.url}>
              {/* One line that wraps, so the whole path shows in the narrow panel */}
              <Textarea
                rows={1}
                className="resize-none font-mono wrap-anywhere supports-[field-sizing:content]:field-sizing-content"
                value={metadata.url ?? ""}
                spellCheck={false}
                autoCapitalize="off"
                onKeyDown={(event) => event.key === "Enter" && event.preventDefault()}
                onChange={(event) => update({ url: event.target.value.replaceAll("\n", "") })}
              />
            </Field>
          ))}
        <Field
          label="Description"
          hint="A short summary for listings and search."
          error={errors.description}
        >
          <Textarea
            rows={2}
            className="resize-none supports-[field-sizing:content]:field-sizing-content"
            value={metadata.description ?? ""}
            onChange={(event) => update({ description: event.target.value || undefined })}
          />
        </Field>
        <Field label="Form ID" error={errors.form_id}>
          <Input
            className="font-mono"
            value={metadata.form_id ?? ""}
            placeholder="No form linked"
            spellCheck={false}
            autoCapitalize="off"
            onChange={(event) => update({ form_id: event.target.value || undefined })}
          />
        </Field>
      </SidePanel.Section>
      {(filed || subcategory) && (
        <SidePanel.Section title="Categories">
          {filed &&
            (unsupported("category") || unsupported("categories") ? (
              <Preserved label="Categories" error={errors.category ?? errors.category_id} />
            ) : single ? (
              <Field label="Category" error={errors.category ?? errors.category_id}>
                <NativeSelect
                  value={selected[0] ?? ""}
                  onChange={(event) =>
                    changeCategories(event.target.value ? [event.target.value] : [])
                  }
                >
                  <option value="">Choose a category</option>
                  {selected[0] && !categories.some((category) => category.slug === selected[0]) && (
                    <option value={selected[0]}>{selected[0]} (from Markdown)</option>
                  )}
                  {categories.map((category) => (
                    <option key={category.slug} value={category.slug}>
                      {category.title}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            ) : (
              <FieldGroup label="Filed under" error={errors.category ?? errors.category_id}>
                {selected.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5">
                    {selected.map((slug) => {
                      const title =
                        categories.find((category) => category.slug === slug)?.title ?? slug;

                      return (
                        <li key={slug} className="max-w-full">
                          <Tag
                            removeLabel={`Remove ${title}`}
                            onRemove={() =>
                              changeCategories(selected.filter((value) => value !== slug))
                            }
                          >
                            {title}
                          </Tag>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <NativeSelect
                  aria-label="Add category"
                  disabled={categories.length === 0}
                  value=""
                  onChange={(event) => {
                    if (event.target.value) changeCategories([...selected, event.target.value]);
                  }}
                >
                  <option value="">
                    {categories.length ? "Add category…" : "No categories available"}
                  </option>
                  {categories.flatMap((category) =>
                    selected.includes(category.slug)
                      ? []
                      : [
                          <option key={category.slug} value={category.slug}>
                            {category.title}
                          </option>,
                        ],
                  )}
                </NativeSelect>
              </FieldGroup>
            ))}
          {subcategory &&
            (unsupported("subcategory") ? (
              <Preserved label="Subcategory" error={errors.subcategory} />
            ) : (
              <Field label="Subcategory" error={errors.subcategory}>
                <NativeSelect
                  value={metadata.subcategory ?? ""}
                  onChange={(event) =>
                    update({ subcategory: event.target.value || undefined }, true)
                  }
                >
                  <option value="">None</option>
                  {metadata.subcategory &&
                    !subcategories.some((item) => item.slug === metadata.subcategory) && (
                      <option value={metadata.subcategory}>
                        {metadata.subcategory} (from Markdown)
                      </option>
                    )}
                  {subcategories.map((item) => (
                    <option key={item.slug} value={item.slug}>
                      {item.title}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            ))}
        </SidePanel.Section>
      )}
    </fieldset>
  );
}
