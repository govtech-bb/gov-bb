// Modules entry point: the modules both editors install.

export { TextModule } from "./text/module";

export { HistoryModule } from "./history/module";

export { LinksModule } from "./links/module";

export { isSupportedLinkUrl, linkAddress, normalizeLinkUrl } from "./links/url";

export { FormattingModule } from "./formatting/module";

export { SELECTION_TOOLBAR, keepSelection } from "./formatting/toolbar";

export { TextColourMenu, type TextColour, type TextColours } from "./formatting/colour-menu";
