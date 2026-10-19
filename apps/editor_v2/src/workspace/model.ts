export type ServicePageRole = "entry" | "start" | "supporting";

/** Navigation metadata for an API page; content belongs to its in-memory editor. */
export type PageDocument = { id: string; title: string; kind: "page"; role: ServicePageRole };

export type WorkspaceLocation = { serviceId: string; documentId?: string } | undefined;

export function documentLabel(document: PageDocument) {
  return document.role === "entry"
    ? "Entry page"
    : document.role === "start"
      ? "Start page"
      : document.title || "Untitled page";
}

export function locationHash(location: WorkspaceLocation) {
  if (!location) return "#/services";

  return `#/services/${encodeURIComponent(location.serviceId)}${location.documentId ? `/${encodeURIComponent(location.documentId)}` : ""}`;
}

export function readLocation(hash: string): WorkspaceLocation {
  const parts = hash.split("/");

  if (parts[0] !== "#" || parts[1] !== "services" || !parts[2] || parts.length > 4) return;

  try {
    return {
      serviceId: decodeURIComponent(parts[2]),
      ...(parts[3] && { documentId: decodeURIComponent(parts[3]) }),
    };
  } catch {
    return;
  }
}
