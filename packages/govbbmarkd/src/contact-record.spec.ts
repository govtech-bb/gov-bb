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
        href: "tel:+12465350021",
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

  it.each([
    ["(246) 535-0021", "tel:+12465350021"],
    ["246-438-7575", "tel:+12464387575"],
    ["+1 246-426-3990", "tel:+12464263990"],
    ["211", "tel:211"],
    ["+44 20 7946 0958", "tel:+442079460958"],
  ])("keeps %s dialable as %s", (phone, href) => {
    expect(contactDetails(contacts, ["phone"], { phone })[0]).toMatchObject({
      text: phone,
      href,
    });
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

  it("shows a number, a yes or no and a list as text, and leaves out an empty list (#3782)", () => {
    const shelters = {
      schema: {
        fields: [
          { key: "capacity", label: "Capacity" },
          { key: "water", label: "Has water" },
          { key: "access", label: "Wheelchair access" },
          { key: "opened", label: "Opened" },
          { key: "phones", label: "Telephone numbers" },
          { key: "documents", label: "Documents" },
        ],
      },
    };
    expect(
      contactDetails(
        shelters,
        ["capacity", "water", "access", "opened", "phones", "documents"],
        {
          capacity: 0.1725,
          water: true,
          access: false,
          opened: "2026-08-01",
          phones: ["(246) 535-0021", "211"],
          documents: [],
        },
      ),
    ).toEqual([
      { field: "capacity", label: "Capacity", text: "0.1725", href: null },
      { field: "water", label: "Has water", text: "Yes", href: null },
      { field: "access", label: "Wheelchair access", text: "No", href: null },
      { field: "opened", label: "Opened", text: "2026-08-01", href: null },
      // A list of numbers is no one number to dial
      {
        field: "phones",
        label: "Telephone numbers",
        text: "(246) 535-0021, 211",
        href: null,
      },
    ]);
  });
});
