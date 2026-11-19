import { expect, test } from "vitest";
import { legacyPath, workspaceLink } from "../../src/workspace/navigation";

test("legacy bookmarks retain encoded identities and reject malformed routes", () => {
  expect(legacyPath("#/services/service%2Fwith%20spaces/document%20%23%C3%A9")).toBe(
    "/services/service%2Fwith%20spaces/document%20%23%C3%A9",
  );
  expect(legacyPath("#/services")).toBe("/services");
  expect(legacyPath("#/services/%E0%A4%A")).toBe("/services");
  expect(legacyPath("#/services/a/b/extra")).toBe("/services");
  expect(legacyPath("#/other/a")).toBe("/services");
  expect(legacyPath("#workspace-content")).toBeUndefined();
  expect(legacyPath("")).toBeUndefined();
});

test("workspace links pass raw identities to the router for encoding", () => {
  expect(workspaceLink(undefined)).toEqual({ to: "/services" });
  expect(workspaceLink({ serviceId: "a/b" })).toEqual({
    to: "/services/$serviceId",
    params: { serviceId: "a/b" },
  });
  expect(workspaceLink({ serviceId: "a/b", documentId: "#é" })).toEqual({
    to: "/services/$serviceId/$documentId",
    params: { serviceId: "a/b", documentId: "#é" },
  });
});
