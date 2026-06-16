import type { ServiceFrontmatter } from "./schemas";

export interface ServiceEntity extends ServiceFrontmatter {
  slug: string; // derived from filename / dir
  body: string;
  filePath: string;
  /** The service folder has a start.md sub-page (landing serves <url>/start). */
  hasStartPage?: boolean;
}

export interface ContentArtifact {
  services: ServiceEntity[];
  /** Validation issues (non-fatal). Fatal errors throw. */
  warnings: string[];
}
