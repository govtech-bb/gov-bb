import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent,
} from "react";
import { cn } from "../utils/cn";
import { FlowConnectors } from "./connectors";
import {
  DescendantsProvider,
  useDescendantIndex,
  useDescendants,
  useOptionalDescendantsContext,
  type DescendantInfo,
} from "./use-children";
import {
  computeEdges,
  computePositions,
  computeDiagramRect,
  type FlowAlign,
  type FlowOrientation,
  type FlowState,
  type TreeNode,
} from "./flow-layout";
export type { FlowAlign, FlowOrientation, FlowState, TreeNode };
const DEFAULT_PADDING = {
  y: 64,
  x: 16,
};
type Orientation = FlowOrientation;
function isEventFromNode(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("[data-node-id]") !== null;
}
interface FlowDiagramProps {
  /**
   * Flow direction.
   * - `"horizontal"`: Nodes progress left-to-right (default)
   * - `"vertical"`: Nodes progress top-to-bottom
   */
  orientation?: Orientation;
  /**
   * Whether to render the pannable canvas wrapper.
   * - `true`: Renders with pannable canvas, scrollbars, and pan gestures (default)
   * - `false`: Renders only the node list without canvas wrapper
   */
  canvas?: boolean;
  /**
   * Cross-axis alignment of nodes.
   * - `"start"`: Nodes align to the top/left edge (default)
   * - `"center"`: Nodes are centered across the inactive axis
   */
  align?: FlowAlign;
  /**
   * Padding around the diagram content within the canvas.
   * - `x`: Horizontal padding in pixels (default: 16)
   * - `y`: Vertical padding in pixels (default: 64)
   */
  padding?: {
    x?: number;
    y?: number;
  };
  /**
   * Callback fired when the overflow state changes.
   * Called with `{ x: boolean, y: boolean }` indicating overflow in each axis.
   */
  onOverflowChange?: (overflow: { x: boolean; y: boolean }) => void;
  className?: string;
  children?: ReactNode;
}
export function FlowDiagram({
  orientation = "horizontal",
  canvas = true,
  align = "start",
  padding: requestedPadding,
  onOverflowChange,
  className,
  children,
}: FlowDiagramProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const padding = {
    x: requestedPadding?.x ?? DEFAULT_PADDING.x,
    y: requestedPadding?.y ?? DEFAULT_PADDING.y,
  };
  const [isPanning, setIsPanning] = useState(false);
  const [canPan, setCanPan] = useState(false);
  const lastOverflow = useRef<{
    x: boolean;
    y: boolean;
  } | null>(null);
  const panStart = useRef<{
    id: number;
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const [nodes, setNodes] = useState<FlowState["nodes"]>({});
  const [rootDescendants, setRootDescendants] = useState<
    DescendantInfo<NodeData>[]
  >([]);
  // Maps each list/parallel node's id to its own immediate descendants,
  // populated by reportDescendants calls from nested FlowNodeList and
  // FlowParallelNode components.
  const [childrenByParent, setChildrenByParent] = useState<
    Map<string, DescendantInfo<NodeData>[]>
  >(new Map());
  const reportNode = useCallback(
    (
      id: string,
      props: {
        width: number;
        height: number;
        disabled?: boolean;
        startAnchorOffset?: number;
        endAnchorOffset?: number;
      },
    ) => {
      setNodes((prev) => {
        const existing = prev[id];
        if (
          existing?.width === props.width &&
          existing?.height === props.height &&
          existing?.disabled === props.disabled &&
          existing?.startAnchorOffset === props.startAnchorOffset &&
          existing?.endAnchorOffset === props.endAnchorOffset
        )
          return prev;
        return { ...prev, [id]: props };
      });
    },
    [],
  );
  const removeNode = useCallback((id: string) => {
    setNodes((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);
  const reportDescendants = useCallback(
    (id: string | null, descendants: DescendantInfo<NodeData>[]) => {
      if (id === null) {
        setRootDescendants((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(descendants)) return prev;
          return descendants;
        });
      } else {
        setChildrenByParent((prev) => {
          const existing = prev.get(id);
          if (JSON.stringify(existing) === JSON.stringify(descendants))
            return prev;
          const next = new Map(prev);
          next.set(id, descendants);
          return next;
        });
      }
    },
    [],
  );
  // Derive the tree from root descendants synchronously — never stored in state.
  const tree = descendantsToTree(rootDescendants, childrenByParent);
  const flowState: FlowState = { nodes, tree, align, orientation };
  // Derive edges, positions, and diagram size synchronously — never stored in state.
  const edges = computeEdges(flowState);
  const nodePositions = computePositions(flowState);
  const diagramRect = computeDiagramRect(nodePositions, flowState);
  const flowStateContextValue = useMemo(
    () => ({
      reportNode,
      removeNode,
      reportDescendants,
      orientation,
      nodePositions,
      edges,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      reportNode,
      removeNode,
      reportDescendants,
      orientation,
      // eslint-disable-next-line react-hooks/exhaustive-deps
      JSON.stringify(nodePositions),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      JSON.stringify(edges),
    ],
  );
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const content = contentRef.current;
    if (!canvas || !wrapper || !content) return;
    const measure = () => {
      const overflow = {
        x: wrapper.scrollWidth > wrapper.clientWidth + 1,
        y: wrapper.scrollHeight > wrapper.clientHeight + 1,
      };
      setCanPan(overflow.x || overflow.y);
      if (
        lastOverflow.current?.x !== overflow.x ||
        lastOverflow.current?.y !== overflow.y
      ) {
        lastOverflow.current = overflow;
        onOverflowChange?.(overflow);
      }
    };
    const observer = new ResizeObserver(measure);
    observer.observe(wrapper);
    observer.observe(content);
    measure();
    return () => observer.disconnect();
  }, [canvas, padding.x, padding.y, onOverflowChange]);
  const handlePanStart = (event: PointerEvent<HTMLDivElement>) => {
    if (
      !canvas ||
      !canPan ||
      event.pointerType !== "mouse" ||
      event.button !== 0 ||
      isEventFromNode(event.target)
    )
      return;
    panStart.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: event.currentTarget.scrollLeft,
      top: event.currentTarget.scrollTop,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    setIsPanning(true);
  };
  const handlePan = (event: PointerEvent<HTMLDivElement>) => {
    const start = panStart.current;
    if (!start || start.id !== event.pointerId) return;
    event.currentTarget.scrollLeft = start.left - (event.clientX - start.x);
    event.currentTarget.scrollTop = start.top - (event.clientY - start.y);
  };
  const handlePanEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (!panStart.current || panStart.current.id !== event.pointerId) return;
    panStart.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    setIsPanning(false);
  };
  return (
    <FlowStateContext.Provider value={flowStateContextValue}>
      <div
        ref={wrapperRef}
        className={cn(
          "group isolate grow",
          canvas
            ? "ui-scroll-native overflow-auto overscroll-contain"
            : "overflow-visible",
          className,
        )}
        role={canvas ? "region" : undefined}
        aria-label={canvas ? "Workflow diagram" : undefined}
        tabIndex={canvas && canPan ? 0 : undefined}
        style={{
          paddingTop: padding.y,
          paddingBottom: padding.y,
          paddingLeft: padding.x,
          paddingRight: padding.x,
          cursor:
            canvas && canPan ? (isPanning ? "grabbing" : "grab") : undefined,
          userSelect: isPanning ? "none" : undefined,
        }}
        onPointerDown={handlePanStart}
        onPointerMove={handlePan}
        onPointerUp={handlePanEnd}
        onPointerCancel={handlePanEnd}
        onLostPointerCapture={handlePanEnd}
      >
        <div
          data-testid="flow-contents"
          ref={contentRef}
          className="relative mx-auto"
          style={{
            width: diagramRect.width || undefined,
            height: diagramRect.height || undefined,
          }}
        >
          <FlowNodeList>{children}</FlowNodeList>
          <div className="pointer-events-none absolute inset-0">
            <FlowConnectors
              edges={edges}
              nodePositions={nodePositions}
              nodes={flowState.nodes}
              orientation={orientation}
            />
          </div>
        </div>
      </div>
    </FlowStateContext.Provider>
  );
}
export type NodeData =
  | {
      kind: "node";
      disabled?: boolean;
    }
  | {
      kind: "parallel";
      disabled?: boolean;
      children: string[];
      align?: "end";
    }
  | {
      kind: "list";
      disabled?: boolean;
      children: string[];
    };
// ============================================================================
// FlowState context
// ============================================================================
type FlowStateContextValue = {
  reportNode: (
    id: string,
    props: {
      width: number;
      height: number;
      disabled?: boolean;
      startAnchorOffset?: number;
      endAnchorOffset?: number;
    },
  ) => void;
  removeNode: (id: string) => void;
  /**
   * Report immediate descendants from a list/parallel node.
   * Pass `null` as `id` for the root FlowNodeList.
   */
  reportDescendants: (
    id: string | null,
    descendants: DescendantInfo<NodeData>[],
  ) => void;
  orientation: Orientation;
  /** Derived node positions (computed synchronously from FlowState). */
  nodePositions: Record<
    string,
    {
      x: number;
      y: number;
    }
  >;
  /** Derived edges (computed synchronously from FlowState). */
  edges: [string, string][];
};
const FlowStateContext = createContext<FlowStateContextValue | null>(null);
export function useFlowStateContext(): FlowStateContextValue {
  const context = useContext(FlowStateContext);
  if (context === null) {
    throw new Error("useFlowStateContext must be used within a FlowDiagram");
  }
  return context;
}
export const useNodeGroup = () => useDescendants<NodeData>();
export const useNode = (props: NodeData, id?: string) =>
  useDescendantIndex<NodeData>(props, id);
/**
 * Hook to optionally register as a node if within a parent descendants context.
 * Returns registration info if registered, or null if no parent context exists.
 */
export const useOptionalNode = (props: NodeData) => {
  const parentContext = useOptionalDescendantsContext<NodeData>();
  const id = useId();
  const renderOrder = parentContext?.claimRenderOrder(id) ?? -1;
  // Keep mutable refs so the mount/unmount effect always has current values.
  const registerRef = useRef(parentContext?.register);
  registerRef.current = parentContext?.register;
  const propsRef = useRef(props);
  propsRef.current = props;
  const renderOrderRef = useRef(renderOrder);
  renderOrderRef.current = renderOrder;
  // Mount: register once. Unmount: unregister.
  useEffect(() => {
    if (!registerRef.current) return;
    const { unregister } = registerRef.current(
      id,
      renderOrderRef.current,
      propsRef.current,
    );
    return unregister;
  }, [id]);
  // Prop / order updates: keep stored entry fresh without remove→re-add cycle.
  // `props` is excluded from deps for the same reason as in useDescendantIndex:
  // it is recreated every render (contains `tree` objects), so including it
  // causes register() → setRegisteredDescendants() → re-render → infinite loop.
  // propsRef.current is updated synchronously each render so the effect always
  // uses the latest value.
  useEffect(() => {
    if (!registerRef.current) return;
    registerRef.current(id, renderOrder, propsRef.current);
  }, [id, renderOrder]);
  if (!parentContext) return null;
  const index = parentContext.descendants.findIndex((d) => d.id === id);
  return { index, id };
};
function descendantsToTree(
  descendants: DescendantInfo<NodeData>[],
  childrenByParent: Map<string, DescendantInfo<NodeData>[]> = new Map(),
): TreeNode {
  return {
    kind: "list",
    children: descendants.map((d) => descendantToTreeNode(d, childrenByParent)),
  };
}
function descendantToTreeNode(
  d: DescendantInfo<NodeData>,
  childrenByParent: Map<string, DescendantInfo<NodeData>[]>,
): TreeNode {
  if (d.props.kind === "node") return { kind: "node", id: d.id };
  const ownDescendants = childrenByParent.get(d.id) ?? [];
  const children = ownDescendants.map((child) =>
    descendantToTreeNode(child, childrenByParent),
  );
  if (d.props.kind === "parallel") {
    return { kind: "parallel", children, align: d.props.align };
  }
  return { kind: "list", children };
}
export function FlowNodeList({ children }: { children: ReactNode }) {
  const descendants = useNodeGroup();
  const { reportDescendants, orientation } = useFlowStateContext();
  // Only structural info (kind, id, children) is keyed — not DOM rects —
  // to avoid re-computing on every measurement update.
  const structuralKey = JSON.stringify(
    descendants.descendants.map((d) => ({
      id: d.id,
      kind: d.props.kind,
      children: d.props.kind !== "node" ? d.props.children : undefined,
    })),
  );
  const nodeProps = useMemo(
    () => ({
      kind: "list" as const,
      children: descendants.descendants.map((d) => d.id),
      disabled: false,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [structuralKey],
  );
  // Register with parent context if nested (e.g., inside Flow.Parallel).
  // Returns null when this is the root FlowNodeList (no parent context).
  const registration = useOptionalNode(nodeProps);
  // Report our immediate descendants upward so FlowDiagram can reconstruct
  // the full tree. Root list uses null as id; nested lists use their own id.
  useEffect(() => {
    reportDescendants(registration?.id ?? null, descendants.descendants);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structuralKey, reportDescendants, registration?.id]);
  return (
    <DescendantsProvider value={descendants}>
      <ul
        className={cn(
          "ml-0 list-none",
          orientation === "vertical" && "flex flex-col",
        )}
      >
        {children}
      </ul>
    </DescendantsProvider>
  );
}
