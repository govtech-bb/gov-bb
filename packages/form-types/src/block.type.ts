import type { Primitive } from "./primitive.type";
import type { Behaviour } from "./behavior.type";

export interface Block {
  blockId: string;
  blockDescription: string;
  blockVersion: string;
  elements: Array<Primitive>;
  behaviours?: Array<Behaviour>;
}
