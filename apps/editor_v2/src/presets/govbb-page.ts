import { HistoryModule } from "../editor/modules/history/module";
import { LinksModule } from "../editor/modules/links/module";
import { FormattingModule } from "../editor/modules/formatting/module";
import { isSupportedLinkUrl } from "../editor/modules/links/url";
import { definePageEditor } from "../pages/definition";
import { PageMetadataModule } from "../pages/modules/metadata";
import { PageComponentsModule } from "../pages/modules/components";
import { PageTextModule } from "../pages/modules/text";
import { PageListsModule } from "../pages/modules/lists";
import { PageTablesModule } from "../pages/modules/tables";
import { createPageDraftCodec } from "../pages/converters";

const bodyModules = () => [
  HistoryModule(),
  PageComponentsModule(),
  PageTextModule(),
  LinksModule(),
  PageListsModule(),
  PageTablesModule(),
  FormattingModule({ isValidLink: isSupportedLinkUrl }),
];

/** A page drafted in this browser: YAML frontmatter, then its body. */
export const govbbPageEditor = definePageEditor([PageMetadataModule(), ...bodyModules()]);

export const govbbPageCodec = createPageDraftCodec(govbbPageEditor);

/** A page from the content API, whose details are fields: its Markdown is the body alone. */
export const govbbPageBodyEditor = definePageEditor(bodyModules());

export const govbbPageBodyCodec = createPageDraftCodec(govbbPageBodyEditor);
