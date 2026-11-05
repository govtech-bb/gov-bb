// Modules entry point: the modules both editors install.

export { TextModule } from "./text/module";

export { HistoryModule } from "./history/module";

export { LinksModule } from "./links/module";

export { isSupportedLinkUrl, linkAddress, normalizeLinkUrl } from "./links/url";

export { FormattingModule } from "./formatting/module";

export type { TextColours } from "./formatting/toolbar";
