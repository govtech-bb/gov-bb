import { File, ListChecks, Repeat, SealCheck, Smiley } from "@phosphor-icons/react";
import { $createTextNode, $getRoot } from "lexical";
import type { Entry } from "../../editor/insertion";
import {
  $createOptionNode,
  $createPageTitleNode,
  $createQuestionNode,
  $createWidgetNode,
  $pageType,
  $setSettings,
} from "../../editor/nodes";
import { DEFAULT_REPEATABLE } from "../../core/repetition";
import { RendererHost } from "../../../editor/react/contributions";
import { PreviewQuestion } from "../../../ui/preview-sheet";
import { $installedField } from "../../editor/field-context";

export const pageEntries: Entry[] = [
  {
    id: "PAGE_BREAK",
    title: "New page",
    icon: <File />,
    kind: "page-break",
    description: "",
    create: () => [$createWidgetNode("page-break"), $createPageTitleNode()],
  },
  {
    id: "REPEATING_PAGE",
    title: "Repeating page",
    icon: <Repeat />,
    kind: "page-break",
    description: "",
    keywords: "repeat, add another, loop, more than once",
    create: () => [
      $setSettings($createWidgetNode("page-break"), { repeatable: { ...DEFAULT_REPEATABLE } }),
      $createPageTitleNode(),
    ],
  },
  {
    id: "CONFIRMATION_PAGE",
    title: "Confirmation page",
    icon: <Smiley />,
    kind: "page-break",
    keywords: "confirmation, submitted",
    description:
      "Confirms that the application has been submitted. Include a reference number when available, what happens next and when, and contact details.",
    sample: { text: "Application submitted" },
    create: () => [
      $setSettings($createWidgetNode("page-break"), { confirmation: true }),
      $createPageTitleNode(),
    ],
  },
  {
    id: "CHECK_ANSWERS_PAGE",
    title: "Check answers page",
    icon: <ListChecks />,
    kind: "page-break",
    description:
      "Shows people their answers, page by page, with a Change link, before they submit. Choose which questions to include in its review settings.",
    sample: { text: "Check your answers" },
    available: () =>
      !$getRoot()
        .getChildren()
        .some((node) => $pageType(node) === "check-answers"),
    create: () => [
      $setSettings($createWidgetNode("page-break"), {
        pageType: "check-answers",
        name: "Check your answers",
      }),
    ],
  },
  {
    id: "DECLARATION_PAGE",
    title: "Declaration page",
    icon: <SealCheck />,
    kind: "page-break",
    description:
      "The page people submit from: their name and today’s date, then one checkbox to confirm. Add the declaration people must agree to before submitting.",
    sample: {
      label: "Declaration",
      options: ["I confirm that the information I have given is correct"],
    },
    available: () =>
      !!$installedField("checkboxes") &&
      !$getRoot()
        .getChildren()
        .some((node) => $pageType(node) === "declaration"),
    create: () => [
      $setSettings($createWidgetNode("page-break"), {
        pageType: "declaration",
        name: "Declaration",
      }),
      $createQuestionNode().append($createTextNode("Declaration")),
      $setSettings(
        $createOptionNode("checkboxes").append(
          $createTextNode("I confirm that the information I have given is correct"),
        ),
        { required: true },
      ),
    ],
  },
];

export function PageInsertionPreview({ entry }: { entry: Entry }) {
  const text = entry.sample?.text;

  return entry.id === "DECLARATION_PAGE" ? (
    <PreviewQuestion label={entry.sample?.label}>
      <RendererHost name="field-preview:checkboxes" props={{ options: entry.sample?.options }} />
    </PreviewQuestion>
  ) : (
    <>
      <div className="-mx-5 flex h-11 items-center justify-between bg-grey-10 px-5 text-14 shadow-[inset_0_1px_0_rgb(0_14_48/0.08),inset_0_-1px_0_rgb(0_14_48/0.08)]">
        <span className="font-bold">
          Page 2{text && <span className="font-normal text-muted"> · {text}</span>}
        </span>
        {entry.id === "CONFIRMATION_PAGE" && <span className="text-muted">Confirmation page</span>}
        {entry.id === "REPEATING_PAGE" && <span className="text-muted">Repeats</span>}
      </div>
      {text && (
        <>
          <div className="mt-5 border-s-4 border-blue-20 py-1 ps-3 leading-[1.5] text-muted">
            Service name
          </div>
          <div className="mt-3 text-28 leading-[1.2] font-semibold">{text}</div>
        </>
      )}
    </>
  );
}
