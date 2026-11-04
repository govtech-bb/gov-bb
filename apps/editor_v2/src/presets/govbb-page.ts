import { HistoryModule } from "../editor/modules/history/module";
import { LinksModule } from "../editor/modules/links/module";
import { FormattingModule } from "../editor/modules/formatting/module";
import { isSupportedLinkUrl } from "../editor/modules/links/url";
import { definePageEditor } from "../pages/definition";
import { PageMetadataModule } from "../pages/modules/metadata";
import { pageBlocks } from "../pages/blocks";
import { $isHighlightPart } from "../pages/blocks/highlights";
import { PageMutedModule } from "../pages/modules/muted";
import { PageTextModule } from "../pages/modules/text";
import { PageListsModule } from "../pages/modules/lists";
import { PageTablesModule } from "../pages/modules/tables";
import { createPageDraftCodec } from "../pages/converters";

export const govbbPageEditor = definePageEditor([
  PageMetadataModule(),
  HistoryModule(),
  ...pageBlocks,
  // Legacy: before the text module, which would take muted text for ordinary paragraphs
  PageMutedModule(),
  PageTextModule(),
  LinksModule({ isValidLink: isSupportedLinkUrl }),
  PageListsModule(),
  PageTablesModule(),
  FormattingModule({ isValidLink: isSupportedLinkUrl, isPlainText: $isHighlightPart }),
]);

export const govbbPageCodec = createPageDraftCodec(govbbPageEditor);
