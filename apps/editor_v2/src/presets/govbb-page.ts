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

export const govbbPageEditor = definePageEditor([
  PageMetadataModule(),
  HistoryModule(),
  PageComponentsModule(),
  PageTextModule(),
  LinksModule(),
  PageListsModule(),
  PageTablesModule(),
  FormattingModule({ isValidLink: isSupportedLinkUrl }),
]);

export const govbbPageCodec = createPageDraftCodec(govbbPageEditor);
