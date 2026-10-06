import { Sigma } from "@phosphor-icons/react";
import { $createWidgetNode } from "../../editor/nodes";
import { AuthoringPreview } from "../../react/authoring-preview";

export const calculatedFieldsEntry = {
  id: "CALCULATED_FIELDS",
  title: "Calculated fields",
  icon: <Sigma />,
  kind: "calculated-fields",
  description:
    "Named number or text values, such as a fee, that logic works out from people’s answers. Type @ in text to show one.",
  sample: { text: "fee = 0" },
  create: () => [$createWidgetNode("calculated-fields")],
  renderPreview: ({ text }: { text?: string }) => (
    <AuthoringPreview icon={<Sigma />} title="Calculated fields" text={text} />
  ),
};
