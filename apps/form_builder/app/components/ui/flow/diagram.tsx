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
import { Button } from "../button";
import {
  MinusIcon,
  PlusIcon,
  ArrowsOutSimpleIcon,
} from "@phosphor-icons/react";
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
  computeConnectionPositions,
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
export interface FlowConnection {
  from: string;
  to: string;
  label?: string;
  kind?: "navigation" | "conditional" | "delivery";
  branch?: "yes" | "no";
}
interface FlowDiagramProps {
  connections?: FlowConnection[];
  controls?: boolean;
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
  connections,
  controls = false,
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
  const [zoom, setZoom] = useState(1);
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
  const edges: [string, string][] = connections
    ? connections.map((e) => [e.from, e.to])
    : computeEdges(flowState);
  const nodePositions = connections
    ? computeConnectionPositions(flowState, connections)
    : computePositions(flowState);
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
      <div className="relative h-full min-w-0">
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
              zoom,
            }}
          >
            <FlowNodeList>{children}</FlowNodeList>
            <div className="pointer-events-none absolute inset-0">
              {connections ? (
                <svg
                  className="h-full w-full overflow-visible"
                  aria-hidden="true"
                >
                  {connections.map((edge, index) => {
                    const a = nodePositions[edge.from],
                      b = nodePositions[edge.to];
                    const an = nodes[edge.from],
                      bn = nodes[edge.to];
                    if (!a || !b || !an || !bn) return null;
                    // Draw in horizontal coordinates, then swap axes for a vertical map.
                    const vertical = orientation === "vertical";
                    const x1 = vertical ? a.y + an.height : a.x + an.width,
                      y1 = vertical ? a.x + an.width / 2 : a.y + an.height / 2;
                    const x2 = vertical ? b.y : b.x,
                      y2 = vertical ? b.x + bn.width / 2 : b.y + bn.height / 2;
                    const detour =
                      x2 <= x1 ||
                      Object.entries(nodePositions).some(([id, pos]) => {
                        if (id === edge.from || id === edge.to || !nodes[id])
                          return false;
                        const main = vertical ? pos.y : pos.x;
                        const cross = vertical ? pos.x : pos.y;
                        const size = vertical
                          ? nodes[id].width
                          : nodes[id].height;
                        return (
                          main > x1 &&
                          main < x2 &&
                          cross <= Math.max(y1, y2) &&
                          cross + size >= Math.min(y1, y2)
                        );
                      });
                    const lane =
                      Math.min(
                        ...Object.values(nodePositions).map((pos) =>
                          vertical ? pos.x : pos.y,
                        ),
                      ) -
                      32 -
                      (index % 3) * 16;
                    const point = (x: number, y: number) =>
                      vertical ? `${y},${x}` : `${x},${y}`;
                    const sideMain = vertical
                      ? a.y + an.height / 2
                      : a.x + an.width / 2;
                    const sideCross = vertical
                      ? a.x + an.width
                      : a.y + an.height;
                    const branchLane =
                      Math.max(
                        sideCross,
                        ...Object.entries(nodePositions)
                          .filter(
                            ([, pos]) =>
                              (vertical ? pos.y : pos.x) >=
                                (vertical ? a.y : a.x) &&
                              (vertical ? pos.y : pos.x) <= x2,
                          )
                          .map(([id, pos]) =>
                            vertical
                              ? pos.x + (nodes[id]?.width ?? 0)
                              : pos.y + (nodes[id]?.height ?? 0),
                          ),
                      ) + 48;
                    const d =
                      edge.branch === "no" && x2 > x1
                        ? `M${point(sideMain, sideCross)} L${point(sideMain, branchLane - 12)} Q${point(sideMain, branchLane)} ${point(sideMain + 12, branchLane)} L${point(x2 - 24, branchLane)} Q${point(x2 - 12, branchLane)} ${point(x2 - 12, branchLane - 12)} L${point(x2 - 12, y2 + 12)} Q${point(x2 - 12, y2)} ${point(x2, y2)}`
                        : detour
                          ? `M${point(x1, y1)} Q${point(x1 + 20, y1)} ${point(x1 + 20, lane)} L${point(x2 - 20, lane)} Q${point(x2 - 20, y2)} ${point(x2, y2)}`
                          : `M${point(x1, y1)} C${point((x1 + x2) / 2, y1)} ${point((x1 + x2) / 2, y2)} ${point(x2, y2)}`;
                    return (
                      <g
                        key={`${edge.from}-${edge.to}-${index}`}
                        className="text-ui-subtle"
                      >
                        <title>{edge.label}</title>
                        <path
                          d={d}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeDasharray={
                            edge.kind === "conditional" && !edge.branch
                              ? "6 4"
                              : edge.kind === "delivery"
                                ? "2 4"
                                : undefined
                          }
                        />
                        {edge.branch && (
                          <text
                            x={
                              vertical
                                ? edge.branch === "no"
                                  ? sideCross + 24
                                  : y1 - 10
                                : edge.branch === "no"
                                  ? sideMain + 10
                                  : x1 + 28
                            }
                            y={
                              vertical
                                ? edge.branch === "no"
                                  ? sideMain - 8
                                  : x1 + 28
                                : edge.branch === "no"
                                  ? sideCross + 24
                                  : y1 - 10
                            }
                            textAnchor="middle"
                            className="fill-ui-default stroke-ui-elevated text-xs font-medium [paint-order:stroke]"
                            strokeWidth="5"
                            strokeLinejoin="round"
                          >
                            {edge.label}
                          </text>
                        )}
                        <path
                          d={`M${point(x2 - 5, y2 - 4)} L${point(x2, y2)} L${point(x2 - 5, y2 + 4)}`}
                          fill="none"
                          stroke="currentColor"
                        />
                      </g>
                    );
                  })}
                </svg>
              ) : (
                <FlowConnectors
                  edges={edges}
                  nodePositions={nodePositions}
                  nodes={flowState.nodes}
                  orientation={orientation}
                />
              )}
            </div>
          </div>
        </div>
        {canvas && controls && (
          <div
            className="absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-lg border border-ui-line bg-ui-base p-1"
            role="group"
            aria-label="Map controls"
          >
            <Button
              variant="ghost"
              size="sm"
              shape="square"
              title="Zoom out"
              aria-label="Zoom out"
              disabled={zoom <= 0.5}
              onClick={() => setZoom((value) => Math.max(0.5, value - 0.1))}
            >
              <MinusIcon />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-14 tabular-nums"
              title="Reset zoom"
              aria-label="Reset zoom"
              onClick={() => setZoom(1)}
            >
              {Math.round(zoom * 100)}%
            </Button>
            <Button
              variant="ghost"
              size="sm"
              shape="square"
              title="Zoom in"
              aria-label="Zoom in"
              disabled={zoom >= 1.5}
              onClick={() => setZoom((value) => Math.min(1.5, value + 0.1))}
            >
              <PlusIcon />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              shape="square"
              title="Fit width"
              aria-label="Fit width"
              onClick={() => {
                const viewport = wrapperRef.current;
                if (!viewport || !diagramRect.width) return;
                setZoom(
                  Math.max(
                    0.5,
                    Math.min(
                      1,
                      (viewport.clientWidth - padding.x * 2) /
                        diagramRect.width,
                    ),
                  ),
                );
                viewport.scrollTo({ left: 0, top: 0 });
              }}
            >
              <ArrowsOutSimpleIcon />
            </Button>
          </div>
        )}
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
