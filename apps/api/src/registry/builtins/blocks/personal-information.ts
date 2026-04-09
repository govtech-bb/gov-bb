import { Block } from "../../types";
import { DateOfBirth, FirstName, LastName, MiddleName, NationalIdNumber, Nationality, Sex, Title } from "../components";

export const PersonalInformation: Block = {
    blockId: "personal-information",
    blockDescription: "Used to collect descriptive information about a person",
    blockVersion: "1.0.0",
    elements: [
        Title,
        FirstName,
        MiddleName,
        LastName,
        DateOfBirth,
        Sex,
        Nationality,
        NationalIdNumber,
    ],
};
