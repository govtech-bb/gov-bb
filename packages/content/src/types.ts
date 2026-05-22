import type { MdaFrontmatter, OrgKind, ServiceFrontmatter } from "./schemas";

export interface MdaEntity extends MdaFrontmatter {
  kind: OrgKind;
  body: string; // prose below frontmatter, trimmed
  filePath: string; // absolute path for debugging
}

export interface ServiceEntity extends ServiceFrontmatter {
  slug: string; // derived from filename / dir
  body: string;
  filePath: string;
}

export type ContentEntity = MdaEntity | ServiceEntity;

export interface ContentArtifact {
  mdas: MdaEntity[];
  services: ServiceEntity[];
  /** Validation issues (non-fatal). Fatal errors throw. */
  warnings: string[];
}
