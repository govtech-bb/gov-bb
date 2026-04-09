import { NationalIdNumber, NationalInsuranceNumber, PassportNumber, TamisNumber } from "../components";

export const ProvingYourIdentity = {
    blockId: "proving-your-identity",
    blockDescription: "Used to collect information to prove a person's identity",
    blockVersion: "1.0.0",
    elements: [
        NationalIdNumber,
        PassportNumber,
        NationalInsuranceNumber,
        TamisNumber,
    ],
};