import { LongAnswerNode } from "../../editor/field-nodes";
import { fieldModule } from "../../editor/field-module";
import { longAnswerField } from "./definition";
import { longAnswerInsertion } from "./insertion";
import { LongAnswerControls } from "./controls";
import { LongAnswerPreview } from "./presentation";

export const LongAnswerModule = () => ({
  ...fieldModule({
    field: longAnswerField,
    insertion: longAnswerInsertion,
    Controls: LongAnswerControls,
    Preview: LongAnswerPreview,
  }),
  nodes: [{ type: "long-answer", node: LongAnswerNode }],
});
