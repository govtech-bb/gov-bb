import { Block } from "../../types";
import { UploadDocument } from "../components";

export const SupportingDocuments: Block = {
    blockId: "supporting-documents",
    blockDescription: "Used to collect supporting documents",
    blockVersion: "1.0.0",
    elements: [
        UploadDocument,
    ],
};