import { Block } from "@govtech-bb/form-types";
import { Address, Country, Parish, Postcode, Town } from "../components";

export const PhysicalAddress: Block = {
  blockId: "physical-address",
  blockDescription: "Used to collect a person's physical address",
  blockVersion: "1.0.0",
  elements: [Address, Country, Parish, Town, Postcode],
};
