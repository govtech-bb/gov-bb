import { LinksModule, FormattingModule, TextModule, HistoryModule } from "@/editor/modules";
import {
  HeadingsModule,
  ListsModule,
  CalloutsModule,
  DisclosureModule,
  $isShowHideNode,
} from "../forms/modules";
import { defineEditor } from "@/editor";

export const contentEditor = defineEditor(
  [
    TextModule(),
    HistoryModule(),
    HeadingsModule(),
    ListsModule(),
    CalloutsModule(),
    DisclosureModule(),
    LinksModule(),
    FormattingModule({ isPlainText: $isShowHideNode }),
  ],
  "content-editor",
);
