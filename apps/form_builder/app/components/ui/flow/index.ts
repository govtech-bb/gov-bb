import { FlowDiagram, FlowNodeList } from "./diagram";
import { FlowNode, FlowAnchor } from "./node";
import { FlowParallelNode } from "./parallel";
const Flow = Object.assign(FlowDiagram, {
  Node: FlowNode,
  Parallel: FlowParallelNode,
  List: FlowNodeList,
  Anchor: FlowAnchor,
});
export { Flow };
