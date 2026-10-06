import {
  HeadingsModule,
  ListsModule,
  CalloutsModule,
  DisclosureModule,
  LinksModule,
  FormattingModule,
  $isShowHideNode,
  defineEditor,
  TextModule,
  HistoryModule,
} from "../editor";

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
