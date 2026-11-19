import { registerEditorHistory } from "../../core/history";
import type { EditorModule } from "../../core/module";
import { registerHistoryKeys } from "../../react/active-editor";

export function HistoryModule(): EditorModule {
  return {
    key: "history",
    historyOwner: "history",
    provides: ["history"],
    registrations: [
      { key: "history", phase: "document", register: registerEditorHistory },
      { key: "history-keys", phase: "browser", register: registerHistoryKeys },
    ],
  };
}
