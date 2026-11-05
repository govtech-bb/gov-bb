import { HistoryModule, LinksModule, FormattingModule, isSupportedLinkUrl } from "@/editor/modules";
import { definePageEditor } from "../pages/definition";
import { PageMetadataModule } from "../pages/modules/metadata";
import { pageBlocks } from "../pages/blocks";
import { $isHighlightPart } from "../pages/blocks/highlights";
import { PageContactModule } from "../pages/modules/contact";
import { PageFactModule } from "../pages/modules/fact";
import { PageMutedModule, pageTextColours } from "../pages/modules/muted";
import { PageTextModule } from "../pages/modules/text";
import { PageListsModule } from "../pages/modules/lists";
import { PageTablesModule } from "../pages/modules/tables";
import { createPageDraftCodec } from "../pages/converters";

export const govbbPageEditor = definePageEditor([
  PageMetadataModule(),
  HistoryModule(),
  ...pageBlocks,
  PageContactModule(),
  PageFactModule(),
  // Legacy: before the text module, which would take muted text for ordinary paragraphs
  PageMutedModule(),
  PageTextModule(),
  LinksModule({ isValidLink: isSupportedLinkUrl }),
  PageListsModule(),
  PageTablesModule(),
  FormattingModule({
    isValidLink: isSupportedLinkUrl,
    isPlainText: $isHighlightPart,
    colours: pageTextColours,
  }),
]);

export const govbbPageCodec = createPageDraftCodec(govbbPageEditor);
