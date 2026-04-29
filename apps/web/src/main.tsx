// ===== CI STRESS TEST — DELETE THIS BLOCK =====
const _w1: string = 999;
const _w2: number[] = "hello";
const _w3: boolean = "true";
const _w4: null = 0;
const _w5: { id: number; label: string } = { id: "abc", label: 42 };
const _w6: string[][] = [1, 2, 3];
const _w7: Date = "2026-01-01";
const _w8: RegExp = 42;
// ===== END CI STRESS TEST =====

import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";

// Create a new router instance
const router = createRouter({ routeTree });

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Render the app
const rootElement = document.getElementById("root")!;
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
}
