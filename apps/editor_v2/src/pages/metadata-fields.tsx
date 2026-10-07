import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import { CaretRight, X } from "@phosphor-icons/react";
import {
  HISTORIC_TAG,
  HISTORY_MERGE_TAG,
  HISTORY_PUSH_TAG,
  REDO_COMMAND,
  UNDO_COMMAND,
} from "lexical";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { parseDocument } from "yaml";
import { cn } from "../cn";
import {
  $pageMetadataNode,
  $setPageMetadata,
  pageMetadataFromYaml,
  type PageMetadata,
} from "./metadata";

function usePageMetadata() {
  const [editor] = useLexicalComposerContext();

  const yaml = useSyncExternalStore(
    (notify) => editor.registerUpdateListener(notify),
    () => editor.getEditorState().read(() => $pageMetadataNode().getYaml(), { editor }),
  );

  return { editor, yaml, metadata: pageMetadataFromYaml(yaml) };
}

function useMetadataUpdate() {
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
    editor.update(() => $setPageMetadata(values), {
      tag: discrete || !typing.current ? HISTORY_PUSH_TAG : HISTORY_MERGE_TAG,
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

function useAutoHeight(value: string | undefined) {
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

export function PageTitleField({ error }: { error?: string }) {
  const { editor, metadata, editable, update, historyKeys } = useMetadataUpdate();
  const title = useAutoHeight(metadata.title);
  const lede = useAutoHeight(metadata.lede);

  return (
    <div className="page-document-heading">
      <label className="page-title-label">
        <span className="sr-only">Page title</span>
        <textarea
          ref={title}
          aria-label="Page title"
          rows={1}
          className="page-title-input"
          value={metadata.title ?? ""}
          readOnly={!editable}
          placeholder="Untitled page"
          onChange={(event) => editor.update(() => $setPageMetadata({ title: event.target.value }))}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.preventDefault();
          }}
          aria-invalid={error ? true : undefined}
        />
      </label>
      {error && <p className="text-14 text-error">{error}</p>}
      <textarea
        ref={lede}
        aria-label="Introduction"
        rows={1}
        className="page-lede-input"
        value={metadata.lede ?? ""}
        readOnly={!editable}
        placeholder="Add an introduction (optional)"
        onChange={(event) => update({ lede: event.target.value || undefined })}
        {...historyKeys}
      />
    </div>
  );
}

export type PageCategory = {
  slug: string;
  title: string;
  subcategories?: readonly { slug: string; title: string }[];
};

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink focus-visible:ring-4 focus-visible:ring-focus";

const control = cn(
  "block w-full min-w-0 min-h-9 rounded-sm border border-line-strong bg-tint px-2.5 py-1.75 text-14 leading-normal text-ink placeholder:text-placeholder focus-visible:bg-white disabled:cursor-default [&[readonly]]:cursor-default [&:not(:disabled,[readonly])]:hover:border-ink @max-[30rem]:min-h-11 @max-[30rem]:text-16 pointer-coarse:min-h-11",
  focusRing,
);

const selectControl = cn(control, "cursor-pointer appearance-auto");

const labelClass = "py-2 leading-normal text-muted @max-[30rem]:py-0";

const hintClass = "py-2 text-13 leading-normal wrap-anywhere text-muted";

function PageDetail({
  id,
  label,
  children,
  unsupported = false,
  error,
}: {
  id: string;
  label: string;
  children: ReactNode;
  unsupported?: boolean;
  error?: string;
}) {
  return (
    <div className="grid grid-cols-[9rem_minmax(0,1fr)] items-start gap-x-4 gap-y-1.5 @max-[30rem]:grid-cols-1">
      {unsupported ? (
        <span className={labelClass}>{label}</span>
      ) : (
        <label className={labelClass} htmlFor={id}>
          {label}
        </label>
      )}
      <div className="min-w-0">
        {unsupported ? (
          <p className={hintClass}>This value is preserved. Edit it in Markdown.</p>
        ) : (
          children
        )}
        {error && <p className="pt-1 text-13 text-error">{error}</p>}
      </div>
    </div>
  );
}

export const visibilityLabels = new Map([
  ["", "Public"],
  ["public", "Public"],
  ["preview", "Preview link only"],
  ["draft", "Draft link only"],
]);

const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" });

const shortControl = "max-w-80";

export type PageDetailsOptions = {
  categories?: readonly PageCategory[];
  /** A page files under one category, so the picker hides once one is chosen. */
  single?: boolean;
  /** When the server dates publication, its date shown read-only; null until the page first goes public. */
  publishedAt?: string | null;
  /** Why the host refused each field, keyed by field name. */
  errors?: Readonly<Record<string, string>>;
};

export function PageDetailsFields({
  categories = [],
  single = false,
  publishedAt,
  errors = {},
}: PageDetailsOptions) {
  const { metadata, yaml, editable, update, historyKeys } = useMetadataUpdate();
  const id = useId();
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

  const summary = [
    !unsupported("visibility") && (visibilityLabels.get(visibility) ?? visibility),
    date && !unusualDate && dateFormat.format(parsedDate),
    metadata.form_id && `Form: ${metadata.form_id}`,
    !metadata.description && !unsupported("description") && "No description",
  ]
    .filter(Boolean)
    .join(" · ");

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

  return (
    <details className="page-metadata-details group/metadata @container -mt-2 mb-8 text-14 open:border-b open:border-line open:pb-6">
      <summary
        className={cn(
          "group/summary flex min-h-9 cursor-pointer list-none items-center gap-3 rounded-sm text-muted after:h-px after:min-w-8 after:flex-1 after:bg-line group-open/metadata:after:hidden pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden",
          focusRing,
        )}
      >
        <span className="-ms-1 flex flex-none items-center gap-1.5 rounded-sm px-1 py-1.5 font-semibold group-hover/summary:bg-tint group-hover/summary:text-ink">
          <CaretRight className="size-3.5 group-open/metadata:rotate-90" aria-hidden="true" /> Page
          details
        </span>
        <span className="min-w-0 truncate group-open/metadata:hidden">{summary}</span>
      </summary>
      <fieldset
        className="mt-3 grid min-w-0 gap-2.5 @max-[30rem]:gap-4"
        disabled={!editable}
        {...historyKeys}
      >
        <legend className="sr-only">Page details</legend>
        {document.has("url") && (
          <PageDetail
            id={`${id}-url`}
            label="Path"
            unsupported={unsupported("url")}
            error={errors.url}
          >
            <input
              id={`${id}-url`}
              className={control}
              value={metadata.url ?? ""}
              spellCheck={false}
              autoCapitalize="off"
              onChange={(event) => update({ url: event.target.value })}
            />
          </PageDetail>
        )}
        <PageDetail id={`${id}-description`} label="Description" error={errors.description}>
          <textarea
            id={`${id}-description`}
            className={cn(
              control,
              "min-h-17 resize-y supports-[field-sizing:content]:field-sizing-content @max-[30rem]:min-h-17 pointer-coarse:min-h-17",
            )}
            rows={2}
            value={metadata.description ?? ""}
            placeholder="Short summary for listings and search"
            onChange={(event) => update({ description: event.target.value || undefined })}
          />
        </PageDetail>
        {(categories.length > 0 || document.has("category") || document.has("categories")) && (
          <PageDetail
            id={`${id}-category`}
            label="Categories"
            unsupported={unsupported("category") || unsupported("categories")}
            error={errors.category ?? errors.category_id}
          >
            <div className="flex flex-wrap gap-1.5">
              {selected.map((slug) => {
                const title = categories.find((category) => category.slug === slug)?.title ?? slug;

                return (
                  <span
                    className="inline-flex min-h-9 max-w-full items-center rounded-sm bg-blue-10 ps-2.5 leading-normal text-ink"
                    key={slug}
                  >
                    <span className="min-w-0 wrap-anywhere">{title}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${title}`}
                      className={cn(
                        "grid min-w-9 flex-none cursor-pointer place-items-center self-stretch rounded-sm hover:bg-tint hover:text-ink pointer-fine:active:scale-[0.97] @max-[30rem]:min-h-11 @max-[30rem]:min-w-11 pointer-coarse:min-h-11 pointer-coarse:min-w-11",
                        focusRing,
                      )}
                      onClick={() => changeCategories(selected.filter((value) => value !== slug))}
                    >
                      <X className="size-3.5" aria-hidden="true" />
                    </button>
                  </span>
                );
              })}
              {!(single && selected.length > 0) && (
                <select
                  id={`${id}-category`}
                  aria-label="Add category"
                  className={cn(selectControl, "w-[min(100%,20rem)]")}
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
                </select>
              )}
            </div>
          </PageDetail>
        )}
        {(subcategories.length > 0 || document.has("subcategory")) && (
          <PageDetail
            id={`${id}-subcategory`}
            label="Subcategory"
            unsupported={unsupported("subcategory")}
            error={errors.subcategory}
          >
            <select
              id={`${id}-subcategory`}
              className={cn(selectControl, shortControl)}
              value={metadata.subcategory ?? ""}
              onChange={(event) => update({ subcategory: event.target.value || undefined }, true)}
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
            </select>
          </PageDetail>
        )}
        <PageDetail
          id={`${id}-visibility`}
          label="Visibility"
          unsupported={unsupported("visibility")}
          error={errors.visibility}
        >
          <select
            id={`${id}-visibility`}
            className={cn(selectControl, shortControl)}
            value={visibility === "public" ? "" : visibility}
            onChange={(event) => update({ visibility: event.target.value || undefined }, true)}
          >
            {["", "preview", "draft"].map((value) => (
              <option key={value} value={value}>
                {visibilityLabels.get(value)}
              </option>
            ))}
            {unusualVisibility && <option value={visibility}>{visibility} (from Markdown)</option>}
          </select>
        </PageDetail>
        <PageDetail
          id={`${id}-date`}
          label="Publication date"
          unsupported={unsupported("publish_date")}
          error={errors.publish_date}
        >
          {publishedAt !== undefined ? (
            <input
              id={`${id}-date`}
              className={cn(control, shortControl)}
              value={date ? dateFormat.format(parsedDate) : ""}
              placeholder="Set when the page is first made public"
              readOnly
            />
          ) : unusualDate ? (
            <>
              <input
                id={`${id}-date`}
                className={cn(control, shortControl)}
                value={date}
                readOnly
              />
              <p className={hintClass}>This date is preserved. Edit it in Markdown.</p>
            </>
          ) : (
            <input
              id={`${id}-date`}
              className={cn(control, shortControl)}
              type="date"
              value={date}
              onChange={(event) => {
                if (event.target.validity.valid)
                  update({ publish_date: event.target.value || undefined }, true);
              }}
            />
          )}
        </PageDetail>
        <PageDetail id={`${id}-form`} label="Form ID" error={errors.form_id}>
          <input
            id={`${id}-form`}
            className={cn(control, shortControl)}
            value={metadata.form_id ?? ""}
            placeholder="No form linked"
            spellCheck={false}
            autoCapitalize="off"
            onChange={(event) => update({ form_id: event.target.value || undefined })}
          />
        </PageDetail>
      </fieldset>
    </details>
  );
}
