import { describe, expect, it } from "vitest";
import { contactDetails } from "@govtech-bb/govbbmarkd/contact-record";

const contacts = {
  schema: {
    fields: [
      { key: "key", label: "Key" },
      { key: "name", label: "Name" },
      { key: "phone", label: "Telephone" },
      { key: "email", label: "Email" },
      { key: "website", label: "Website" },
      { key: "hours", label: "Opening hours" },
    ],
  },
};

describe("a contact block's details, read from a record", () => {
  it("labels each chosen field as its collection does, in the chosen order", () => {
    // `fax` isn't a field of the collection, so it is left out
    expect(
      contactDetails(contacts, ["hours", "phone", "fax"], {
        hours: "8:30am to 4:30pm",
        phone: "(246) 535-0021",
        fax: "(246) 535-0022",
      }).map(({ field, label }) => ({ field, label })),
    ).toEqual([
      { field: "hours", label: "Opening hours" },
      { field: "phone", label: "Telephone" },
    ]);
  });

  it("links phone, email and website, and leaves other details as text", () => {
    expect(
      contactDetails(contacts, ["phone", "email", "website", "hours", "name"], {
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
    const href = (website: string) =>
      contactDetails(contacts, ["website"], { website })[0]?.href;

    expect(href("http-services.gov.bb")).toBe("https://http-services.gov.bb");
    expect(href("HTTP://gov.bb")).toBe("HTTP://gov.bb");
  });

  it("puts every link through the content URL check, and shows one that fails as text", () => {
    // A script address is never a script link: it is read as a site name
    expect(
      contactDetails(contacts, ["website"], {
        website: "javascript:alert(1)",
      })[0]?.href,
    ).toBe("https://javascript:alert(1)");
    expect(
      contactDetails(contacts, ["website"], {
        website: " java\tscript:alert(1)",
      })[0],
    ).toMatchObject({ text: " java\tscript:alert(1)", href: null });
  });
});
