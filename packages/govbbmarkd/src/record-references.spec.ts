import { expect, it } from "vitest";
import { recordReferences } from "@govtech-bb/govbbmarkd";

it("finds a contact-only record between horizontal rules in a page body", () => {
  expect(
    recordReferences(
      '---\n\n::contact{collection="contacts" record="police-emergency" fields="phone"}\n\n---',
    ),
  ).toEqual([{ collection: "contacts", record: "police-emergency" }]);
});

it("lists the records a page's facts and contact blocks name, once each, leaving out one still to be chosen", () => {
  expect(
    recordReferences(
      [
        'Call :fact{collection="contacts" record="drug-service" field="phone"} or write to :fact{collection="offices" record="bridgetown" field="email"}.',
        "",
        '::contact{collection="contacts" record="drug-service" fields="phone"}',
        "",
        ":::notice",
        'Not yet :fact{collection="contacts"}.',
        ":::",
      ].join("\n"),
    ),
  ).toEqual([
    { collection: "contacts", record: "drug-service" },
    { collection: "offices", record: "bridgetown" },
  ]);
});
