import type { Primitive } from "@govtech-bb/form-types";
import type { Block } from "@govtech-bb/form-types";

export interface ComponentDefinition {
  ref: string;
  displayName: string;
  primitive: Primitive;
}

export interface BlockDefinition {
  ref: string;
  displayName: string;
  block: Block;
}
