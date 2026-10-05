import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $createParagraphNode, $getNodeByKey, $isElementNode, $isParagraphNode } from "lexical";
import { CaretDown, CaretRight, ListChecks, SealCheck, Warning } from "@phosphor-icons/react";
import { format } from "date-fns";
import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../../cn";
import { Button } from "../../../ui/button";
import { Tip } from "../../../ui/tooltip";
import {
  CHECK_ANSWERS_DESCRIPTION,
  pageTitleText,
  $pageHead,
  $isPageBreak,
  $nextBlock,
  $setSettings,
  $settings,
} from "../../editor/nodes";
import { useSetSettings, type WidgetProps } from "../../react/widget-settings";
import { RepeatChip, RepeatEndPreview } from "../repetition/presentation";
import { ServiceName } from "./headings";
import { $pagePreview } from "./queries";

/** Re-reads something about the editor on every update, for widgets that show other blocks' state. Keep it a primitive. */
function useEditorValue<T extends string | number | boolean>(read: () => T) {
  const [editor] = useLexicalComposerContext();

  return useSyncExternalStore(
    (onChange) => editor.registerUpdateListener(onChange),
    () => editor.getEditorState().read(read, { editor }),
  );
}

// The page-break gap's controls: quiet text buttons that grey on hover
const gapButton =
  "inline-flex h-8 min-w-0 cursor-pointer items-center gap-2 rounded-sm px-2 text-14 leading-5 hover:bg-hover";

function PagePreview({
  page,
  afterHead = false,
}: {
  page: ReturnType<typeof $pagePreview>;
  afterHead?: boolean;
}) {
  const [, context] = useLexicalComposerContext();
  const heading = context.getTheme()?.heading;

  if (page.type === "questions" || page.type === "confirmation" || page.type === "result")
    return (
      <div contentEditable={false} className="cursor-default pt-10 select-none">
        <ServiceName text={page.service} />
      </div>
    );

  return (
    <div
      contentEditable={false}
      className="cursor-default pt-6 pb-2 text-(length:--form-text) leading-[1.5] select-none"
    >
      <div className="flex h-6 items-center gap-1.5 text-12 font-semibold text-muted select-none [&>svg]:size-3.5 [&>svg]:text-blue-40">
        {page.type === "check-answers" ? <ListChecks /> : <SealCheck />}
        {page.type === "check-answers" ? "Preview of answers from your pages" : "Preview"}
      </div>
      {!afterHead && (
        <>
          <ServiceName text={page.service} />
          <h1 className={cn(pageTitleText, "pb-4")}>{page.title}</h1>
        </>
      )}
      {page.type === "check-answers" ? (
        <>
          <p className="pb-6">{CHECK_ANSWERS_DESCRIPTION}</p>
          {page.sections.map((section) => (
            <section key={section.key}>
              <div className="flex items-baseline justify-between gap-4">
                <h3 className={heading?.h3}>{section.title}</h3>
                {page.changeLinks && (
                  <span className="text-interactive underline underline-offset-[0.15em]">
                    Change
                  </span>
                )}
              </div>
              {section.rows.length ? (
                <dl>
                  {section.rows.map((row) => (
                    <div key={row.key} className="grid grid-cols-2 gap-4 border-b border-line py-3">
                      <dt className="font-bold">{row.label}</dt>
                      <dd className="text-muted">—</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="py-3 text-muted">No values provided</p>
              )}
              {section.repeat && (
                <>
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 className={heading?.h3}>
                      {section.title} — {section.repeat}
                    </h3>
                    {page.changeLinks && (
                      <span className="text-interactive underline underline-offset-[0.15em]">
                        Change
                      </span>
                    )}
                  </div>
                  <p className="py-3 text-12 leading-4 text-muted">
                    One section like this for each entry people add
                  </p>
                </>
              )}
            </section>
          ))}
        </>
      ) : page.applicant ? (
        <div className="pt-3">
          <p>
            <strong>Applicant's name:</strong> {page.applicant}
          </p>
          <p>
            <strong>Date:</strong> {format(new Date(), "dd/MM/yyyy")}
          </p>
        </div>
      ) : (
        <p className="pt-3 text-muted">
          Use answer references to include the applicant’s details in the declaration.
        </p>
      )}
    </div>
  );
}

/** Page numbers come from the CSS counter incremented by each page break. */
export function PageBreak({ nodeKey, settings }: WidgetProps) {
  const [editor] = useLexicalComposerContext();
  const set = useSetSettings(nodeKey);

  const value = useEditorValue(() => {
    const node = $getNodeByKey(nodeKey);

    return JSON.stringify(node ? $pagePreview(node) : null);
  });

  const page: ReturnType<typeof $pagePreview> | null = JSON.parse(value);

  const previewTarget = useSyncExternalStore(
    (listener) => editor.registerUpdateListener(listener),
    () =>
      page?.headKey
        ? (editor
            .getElementByKey(page.headKey)
            ?.querySelector<HTMLElement>(":scope > [data-native-preview]") ?? null)
        : null,
    () => null,
  );

  const {
    qualified = false,
    count = 0,
    type = "questions",
    warnings = [],
    title = "",
    typedTitle = "",
  } = page ?? {};

  const special = type === "check-answers" || type === "declaration";
  const name = special ? title : typedTitle;

  const editTitle = () => {
    if (!editor.isEditable()) return;
    editor.update(() => {
      if (!editor.isEditable()) return;
      const node = $getNodeByKey(nodeKey);

      if (!node) return;

      if ($settings(node).folded) $setSettings(node, { folded: undefined });
      $pageHead(node)[0]?.selectEnd();
    });
    editor.focus();
  };

  const lineAt = (above: boolean) => {
    if (!editor.isEditable()) return;
    editor.update(() => {
      if (!editor.isEditable()) return;
      const node = $getNodeByKey(nodeKey);

      if (!node) return;

      // Folded pages have no insertion spacer. Otherwise reuse the adjacent text line or create one.
      if (above) {
        let page = node.getPreviousSibling();

        while (page && !$isPageBreak(page)) page = page.getPreviousSibling();

        if (page && $settings(page).folded) return;
      }

      const neighbour = above ? node.getPreviousSibling() : $nextBlock(node);

      if (above && $isParagraphNode(neighbour) && neighbour.isEmpty()) return neighbour.selectEnd();

      if (!above && $isElementNode(neighbour)) return neighbour.selectStart();
      const line = $createParagraphNode();

      if (above) node.insertBefore(line);
      else node.insertAfter(line);
      line.selectStart();
    });
  };

  const fold = settings.folded ? (
    <Tip content="Unfold page">
      <Button
        icon={<CaretRight />}
        aria-label="Unfold page"
        onClick={() => set({ folded: undefined })}
      >
        {count} block{count === 1 ? "" : "s"}
      </Button>
    </Tip>
  ) : (
    count > 0 && (
      <Tip content="Fold page">
        <Button icon={<CaretDown />} aria-label="Fold page" onClick={() => set({ folded: true })} />
      </Tip>
    )
  );

  return (
    <div className="select-none">
      {page?.repeatRoom && <RepeatEndPreview end={page.repeatRoom} room />}
      <div className="h-12 cursor-text" onClick={() => lineAt(true)} />
      {/* Out to the sheet's edges and 8px past them, over its side shadows: two sheets with the desk between, the
          upper one's edge (casting its shade) and the lower one's drawn within the sheet's width */}
      <div className="relative -mx-[108px] flex min-h-14 items-center gap-2 bg-grey-10 px-[100px] py-2 before:absolute before:inset-x-2 before:top-0 before:h-px before:bg-[rgb(0_14_48/0.1)] before:shadow-[0_1px_3px_rgb(0_14_48/0.08)] after:absolute after:inset-x-2 after:bottom-0 after:h-px after:bg-[rgb(0_14_48/0.06)] max-sm:-mx-6.25 max-sm:px-4.25 max-sm:before:inset-x-0 max-sm:after:inset-x-0">
        {special ? (
          <span className="min-w-0 px-2 text-14 leading-5 font-bold text-ink">
            <span className="block truncate">
              Page <span className="after:content-[counter(page)]" />
              <span className="font-normal text-muted"> · {name}</span>
            </span>
          </span>
        ) : (
          <Tip content="Edit page heading">
            <button
              type="button"
              onClick={editTitle}
              className={cn(gapButton, "font-bold text-ink")}
            >
              <span className="truncate">
                Page <span className="after:content-[counter(page)]" />
                {name && <span className="font-normal text-muted"> · {name}</span>}
              </span>
            </button>
          </Tip>
        )}
        {page?.repeatChip && <RepeatChip text={page.repeatChip} />}
        <div className="ml-auto flex min-w-0 items-center gap-1">
          {qualified && (
            <Tip content="A confirmation page tells people their application was submitted and what happens next">
              <button
                type="button"
                role="switch"
                aria-checked={!!settings.confirmation}
                onClick={() => set({ confirmation: !settings.confirmation })}
                className={cn(gapButton, "text-ink")}
              >
                <span className="max-md:sr-only">Confirmation page</span>
                <span
                  data-on={settings.confirmation ? "" : undefined}
                  className="relative h-4.5 w-7.5 shrink-0 rounded-full bg-grey-60 data-on:bg-interactive"
                >
                  <span className="absolute top-0.5 left-0.5 size-3.5 rounded-full bg-white in-data-on:left-3.5" />
                </span>
              </button>
            </Tip>
          )}
          {warnings.length > 0 && (
            <div className="min-w-0 text-12 leading-4 text-error">
              {warnings.map((warning) => (
                <p key={warning} className="flex items-center gap-1">
                  <Warning className="size-3.5 shrink-0" />
                  {warning}
                </p>
              ))}
            </div>
          )}
          {fold}
        </div>
      </div>
      {!settings.folded && <div className="h-2 cursor-text" onClick={() => lineAt(false)} />}
      {!settings.folded &&
        page &&
        (page.native && special ? (
          <>
            <div contentEditable={false} className="cursor-default pt-10 select-none">
              <ServiceName text={page.service} />
            </div>
            {previewTarget && createPortal(<PagePreview page={page} afterHead />, previewTarget)}
          </>
        ) : (
          <PagePreview page={page} />
        ))}
    </div>
  );
}
