import { Block } from "../../types";
import { Address, Country, EmailAddress, FirstName, HomeTelephone, LastName, Parish, Postcode, Telephone, Town } from "../components";

export const EmergencyContactDetails: Block = {
    blockId: "emergency-contact-details",
    blockDescription: "Used to collect a person's emergency contact details",
    blockVersion: "1.0.0",
    elements: [
        FirstName,
        LastName,
        HomeTelephone,
        Telephone,
        EmailAddress,
        Address,
        Country,
        Parish,
        Town,
        Postcode,
    ],
}