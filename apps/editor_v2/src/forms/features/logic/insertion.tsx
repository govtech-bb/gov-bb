import { ArrowsSplit } from "@phosphor-icons/react";
import { $createWidgetNode } from "../../editor/nodes";
import { AuthoringPreview } from "../../react/authoring-preview";

export const conditionalLogicEntry = {
  id: "CONDITIONAL_LOGIC",
  title: "Conditional logic",
  icon: <ArrowsSplit />,
  kind: "conditional-logic",
  description:
    "Rules that act on people’s answers: show or hide blocks, jump to a page, require an answer, calculate a value or hide the submit button. Change page headings and question labels with actions in these rules.",
  sample: { text: "When ‘Number of speakers’ is more than 4, show ‘Noise plan’" },
  create: () => [$createWidgetNode("conditional-logic")],
  renderPreview: ({ text }: { text?: string }) => (
    <AuthoringPreview icon={<ArrowsSplit />} title="Logic" text={text} />
  ),
};
