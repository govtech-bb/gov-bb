// Re-exports — keep in sync with apps/api/src/registry/builtins/blocks/index.ts
export { AdditionalInformation } from "./additional-information";
export { ApplicantDeclaration } from "./applicant-declaration";
export { ContactInformation } from "./contact-information";
export { EmergencyContactDetails } from "./emergency-contact-details";
export { PersonalInformation } from "./personal-information";
export { PhysicalAddress } from "./physical-address";
export { ProvingYourIdentity } from "./proving-your-identity";
export { SupportingDocuments } from "./supporting-documents";

import { AdditionalInformation } from "./additional-information";
import { ApplicantDeclaration } from "./applicant-declaration";
import { ContactInformation } from "./contact-information";
import { EmergencyContactDetails } from "./emergency-contact-details";
import { PersonalInformation } from "./personal-information";
import { PhysicalAddress } from "./physical-address";
import { ProvingYourIdentity } from "./proving-your-identity";
import { SupportingDocuments } from "./supporting-documents";
import type { Block } from "@govtech-bb/form-types";

const ALL_BLOCKS = [
  AdditionalInformation,
  ApplicantDeclaration,
  ContactInformation,
  EmergencyContactDetails,
  PersonalInformation,
  PhysicalAddress,
  ProvingYourIdentity,
  SupportingDocuments,
] as const satisfies Block[];

// Compile-time guard: bump the literal type whenever ALL_BLOCKS changes length.
const _blockCount: 8 = ALL_BLOCKS.length;

export const REGISTRY_BLOCKS: Record<`blocks/${string}`, Block> =
  Object.fromEntries(ALL_BLOCKS.map((b) => [`blocks/${b.blockId}`, b]));
