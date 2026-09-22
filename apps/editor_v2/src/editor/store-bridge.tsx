import { useStore } from "@govtech-bb/spike-db/react";
import { useEffect } from "react";

/**
 * Puts the store on `window` for the behavioural suite.
 *
 * `validation.spec.ts` uses it to push a block type the palette does not
 * offer straight at the store, proving it is refused there too and not
 * merely absent from the slash menu. `support.ts` uses it to find a
 * document by title without depending on the shape of whatever list happens
 * to be on screen — which matters now that the flat page list has been
 * replaced by a category → service hierarchy.
 *
 * Mounted at the root rather than on the editor page, so it is there on
 * every route. Spike only; nothing ships with this.
 */
export function StoreBridge() {
  const store = useStore();
  useEffect(() => {
    (window as unknown as { __spikeStore: unknown }).__spikeStore = store;
  }, [store]);
  return null;
}
