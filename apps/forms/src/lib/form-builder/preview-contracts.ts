// Build-time index of generated preview contracts (scripts/generate-preview-contracts.ts
// output). Vite's import.meta.glob resolves these at build time; in a normal
// build the dir holds only `.gitkeep`, so the glob is empty and this module is
// inert. Only the Amplify preview build (VITE_PREVIEW_CONTRACTS=1) populates it.
import {
  serviceContractSchema,
  type ServiceContract,
} from "@govtech-bb/form-types";

const modules = import.meta.glob("../../../contracts/preview/*.json", {
  eager: true,
  import: "default",
});

const byFormId = new Map<string, unknown>();
for (const [filePath, mod] of Object.entries(modules)) {
  const formId = filePath
    .split("/")
    .pop()
    ?.replace(/\.json$/, "");
  if (formId) byFormId.set(formId, mod);
}

/**
 * Returns the bundled preview contract for a form, or undefined if none was
 * generated for it. Callers gate on import.meta.env.VITE_PREVIEW_CONTRACTS.
 */
export const getPreviewContract = (
  formId: string,
): ServiceContract | undefined => {
  const mod = byFormId.get(formId);
  return mod ? serviceContractSchema.parse(mod) : undefined;
};
