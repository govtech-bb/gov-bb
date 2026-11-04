import { actions } from "./actions";
import { details } from "./details";
import { highlights } from "./highlights";
import { notice } from "./notice";
import { startLink } from "./start-link";
import { summaryList } from "./summary-list";
import { captionedTable } from "./table";

/**
 * The page's blocks, each in a file of its own made with defineBlock: add a new block's here. They come before the
 * text module, in their insert menus' order.
 */
export const pageBlocks = [
  notice,
  details,
  actions,
  startLink,
  summaryList,
  captionedTable,
  highlights,
];
