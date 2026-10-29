import { createCommand, type NodeKey } from "lexical";

/** Opens a block's Block options, as its grip does: a block that still needs setting up asks for them. */
export const OPEN_BLOCK_OPTIONS_COMMAND = createCommand<NodeKey>("OPEN_BLOCK_OPTIONS_COMMAND");
