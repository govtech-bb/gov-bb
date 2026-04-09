import { Block } from "../../types";
import { AdditionalDetails } from "../components";

export const AdditionalInformation: Block = {
    blockId: "additional-information",
    blockDescription: "Used to collect any additional information",
    blockVersion: "1.0.0",
    elements: [
        AdditionalDetails,
    ],
};