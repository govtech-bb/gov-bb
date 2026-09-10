import {
  createContext,
  useContext,
  type ReactNode,
  type RefObject,
} from "react";
/**
 * Portal container type - matches Base UI's FloatingPortal container prop.
 * Supports HTMLElement, ShadowRoot, or a ref to either.
 */
export type PortalContainer =
  | HTMLElement
  | ShadowRoot
  | null
  | RefObject<HTMLElement | ShadowRoot | null>;
const PortalContainerContext = createContext<PortalContainer>(null);
export function PortalProvider({
  container,
  children,
}: {
  /** The container element or ShadowRoot to portal overlays into. */
  container: PortalContainer;
  children: ReactNode;
}) {
  return (
    <PortalContainerContext.Provider value={container}>
      {children}
    </PortalContainerContext.Provider>
  );
}
/**
 * Hook to get the portal container from context.
 * Returns null if no provider is present (defaults to document.body).
 *
 * @internal Used by overlay components to resolve their portal container.
 */
export function usePortalContainer(): PortalContainer {
  return useContext(PortalContainerContext);
}
