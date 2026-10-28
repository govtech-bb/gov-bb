import { describe, expect, it } from "vitest";
import { contactBlockFor, contactDetails } from "./contact";

const contacts = {
  key: "contacts",
  schema: {
    fields: [
      { key: "key", label: "Key", type: "slug" },
      { key: "name", label: "Name", type: "text" },
      { key: "phone", label: "Telephone", type: "text" },
      { key: "email", label: "Email", type: "email" },
      { key: "website", label: "Website", type: "text" },
      { key: "hours", label: "Opening hours", type: "text" },
    ],
  },
};

describe("a contact block read from a record", () => {
  it("labels each chosen field as its collection does, in the chosen order", () => {
    const block = contactBlockFor(contacts, "barbados-drug-service", [
      "hours",
      "phone",
      "fax",
    ]);

    expect(block).toMatchObject({
      type: "contact",
      collection: "contacts",
      record: "barbados-drug-service",
      // `fax` isn't a field of the collection, so it is left out
      fields: [
        { field: "hours", label: "Opening hours" },
        { field: "phone", label: "Telephone" },
      ],
    });
  });

  it("links phone, email and website, and leaves other details as text", () => {
    const block = contactBlockFor(contacts, "x", [
      "phone",
      "email",
      "website",
      "hours",
      "name",
    ]);

    expect(
      contactDetails(block, {
        phone: "(246) 535-0021",
        email: "drugservice@health.gov.bb",
        website: "health.gov.bb",
        hours: "8:30am to 4:30pm",
        name: "",
      }),
    ).toEqual([
      {
        field: "phone",
        label: "Telephone",
        text: "(246) 535-0021",
        href: "tel:2465350021",
      },
      {
        field: "email",
        label: "Email",
        text: "drugservice@health.gov.bb",
        href: "mailto:drugservice@health.gov.bb",
      },
      {
        field: "website",
        label: "Website",
        text: "health.gov.bb",
        href: "https://health.gov.bb",
      },
      {
        field: "hours",
        label: "Opening hours",
        text: "8:30am to 4:30pm",
        href: null,
      },
    ]);
  });

  it("adds https only to a website without a scheme", () => {
    const block = contactBlockFor(contacts, "x", ["website"]);
    const href = (website: string) =>
      contactDetails(block, { website })[0]?.href;

    expect(href("http-services.gov.bb")).toBe("https://http-services.gov.bb");
    expect(href("HTTP://gov.bb")).toBe("HTTP://gov.bb");
  });

  it("puts every link through the same safe-address check as other links", () => {
    const block = contactBlockFor(contacts, "x", ["website"]);

    // A script address is never a script link: it is read as a site name
    expect(
      contactDetails(block, { website: "javascript:alert(1)" })[0]?.href,
    ).toBe("https://javascript:alert(1)");
    expect(
      contactDetails(block, { website: " java\tscript:alert(1)" })[0]?.href,
    ).not.toMatch(/^\s*java/);
  });
});
