import type { ServiceFrontmatter } from "./schemas";

export interface ServiceEntity extends ServiceFrontmatter {
  slug: string; // derived from filename / dir
  body: string;
  filePath: string;
}

export interface ContentArtifact {
  services: ServiceEntity[];
  /** Validation issues (non-fatal). Fatal errors throw. */
  warnings: string[];
}
