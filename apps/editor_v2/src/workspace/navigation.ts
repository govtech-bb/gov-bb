import { locationHash, readLocation, type WorkspaceLocation } from "./model";

export function workspaceLink(location: WorkspaceLocation) {
  if (!location) return { to: "/services" as const };

  if (!location.documentId)
    return { to: "/services/$serviceId" as const, params: { serviceId: location.serviceId } };

  return {
    to: "/services/$serviceId/$documentId" as const,
    params: { serviceId: location.serviceId, documentId: location.documentId },
  };
}

export function legacyPath(hash: string): string | undefined {
  if (hash.startsWith("#/")) return locationHash(readLocation(hash)).slice(1);
}
