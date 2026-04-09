import { Block } from "../../types";
import { EmailAddress, HomeTelephone, MobileTelephone, Telephone } from "../components";

export const ContactInformation: Block = {
    blockId: "contact-information",
    blockDescription: "Used to collect a person's contact information",
    blockVersion: "1.0.0",
    elements: [
        EmailAddress,
        Telephone,
        MobileTelephone,
        HomeTelephone,
    ],
};