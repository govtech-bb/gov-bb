import { computeConnectionPositions, type FlowState } from "./flow-layout";

const state: FlowState = {
  nodes: Object.fromEntries(
    ["main", "help", "form", "email", "receipt"].map((id) => [
      id,
      { width: 256, height: 120 },
    ]),
  ),
  tree: {
    kind: "list",
    children: ["main", "form", "email", "help", "receipt"].map((id) => ({
      kind: "node",
      id,
    })),
  },
  orientation: "horizontal",
  align: "center",
};
const connections = [
  { from: "main", to: "help" },
  { from: "main", to: "form" },
  { from: "help", to: "form" },
  { from: "form", to: "email" },
  { from: "form", to: "receipt" },
];
it("places linked pages in order and parallel outcomes together regardless of render order", () => {
  const positions = computeConnectionPositions(state, connections);
  expect(positions.help.x).toBeGreaterThan(
    positions.main.x + state.nodes.main.width,
  );
  expect(positions.form.x).toBeGreaterThan(
    positions.help.x + state.nodes.help.width,
  );
  expect(positions.email.x).toBeGreaterThan(
    positions.form.x + state.nodes.form.width,
  );
  expect(positions.receipt.x).toBe(positions.email.x);
  expect(positions.receipt.y).toBeGreaterThan(
    positions.email.y + state.nodes.email.height,
  );
});
it("keeps return links, repeat loops, and missing targets from destabilising the layout", () => {
  const positions = computeConnectionPositions(state, [
    ...connections,
    { from: "help", to: "main" },
    { from: "form", to: "form" },
    { from: "form", to: "missing" },
  ]);
  expect(positions).toEqual(computeConnectionPositions(state, connections));
  const vertical = computeConnectionPositions(
    { ...state, orientation: "vertical" },
    connections,
  );
  expect(vertical.form.y).toBeGreaterThan(
    vertical.help.y + state.nodes.help.height,
  );
  expect(vertical.email.y).toBe(vertical.receipt.y);
  expect(vertical.receipt.x).toBeGreaterThan(
    vertical.email.x + state.nodes.email.width,
  );
});
