import * as Components from './components';
import * as Blocks from './blocks';
import type { Primitive } from '../types/primitive.type';
import type { Block } from '../types/block.type';

export type RegistryEntry = Primitive | Block;

export const BUILTIN_REGISTRY: Record<string, RegistryEntry> = {
  ...Object.fromEntries(
    Object.values(Components).map((c) => {
      const comp = c as Primitive;
      return [`components/${comp.fieldId}`, comp];
    }),
  ),
  ...Object.fromEntries(
    Object.values(Blocks).map((b) => {
      const block = b as Block;
      return [`blocks/${block.blockId}`, block];
    }),
  ),
};
