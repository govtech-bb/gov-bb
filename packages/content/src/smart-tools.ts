import {
  arrayField as list,
  numberField as number,
  objectField as object,
  textField as text,
  sameContent,
  type ContentObject,
  type ContentIssue,
  type ContentField,
  type SmartToolDefinition,
} from "./smart-tool-fields";

const parishes = [
  "Christ Church",
  "St. Andrew",
  "St. George",
  "St. James",
  "St. John",
  "St. Joseph",
  "St. Lucy",
  "St. Michael",
  "St. Peter",
  "St. Philip",
  "St. Thomas",
];
const date = (label: string, optional = false) =>
  text(label, { format: "date", optional });
const choice = (
  label: string,
  options: readonly (string | number)[],
): ContentField => ({ type: "select", label, options });
const flag = (label: string): ContentField => ({ type: "boolean", label });
const optionalText = (label: string) => text(label, { optional: true });
const link = (label: string, optional = true) =>
  text(label, { format: "url", optional });
const strings = (label: string) =>
  list(label, text("Text", { multiline: true }));
const id = text("Identifier");
const coords = object(
  "Location",
  {
    lat: number("Latitude", { min: -90, max: 90 }),
    lon: number("Longitude", { min: -180, max: 180 }),
  },
  { optional: true },
);
const copy = object("Page wording", {});

const integer = (label: string, min = 0) =>
  number(label, { integer: true, min });
const kinds: Record<string, SmartToolDefinition["kind"]> = {
  pharmacies: "locator",
  shelters: "locator",
  stormready: "checklist",
  "crop-over-permits": "decision-guide",
  severance: "calculator",
  "national-insurance": "calculator",
  pension: "calculator",
  "bank-holidays": "calendar",
  "water-outages": "live-feed",
};
export const TOOL_KIND_LABELS = {
  locator: "Locator",
  checklist: "Checklist",
  "decision-guide": "Decision guide",
  calculator: "Calculator",
  calendar: "Calendar",
  "live-feed": "Live information",
};
const base = (
  id: string,
  title: string,
  url: string,
  fields: Record<string, ContentField>,
  views: SmartToolDefinition["views"] = [{ id: "page", label: "Service page" }],
): SmartToolDefinition => ({
  id,
  validate: (content, original) => validateTool(id, content, original),
  kind: kinds[id],
  title,
  url,
  category: url.split("/")[1],
  fields: { ...fields, copy },
  views,
});

export const SMART_TOOLS: readonly SmartToolDefinition[] = [
  {
    ...base(
      "pharmacies",
      "Find an open pharmacy",
      "/health-and-emergency-services/find-an-open-pharmacy",
      {
        lastUpdated: date("Last updated"),
        pharmacies: list(
          "Pharmacies",
          object("Pharmacy", {
            slug: text("Identifier", {
              format: "slug",
              hint: "Used in the pharmacy page address. Keep it unchanged after publication.",
            }),
            name: text("Name"),
            type: choice("Pharmacy type", ["government", "private"]),
            pppStatus: choice("Public-private partnership", [
              "participating",
              "not-participating",
              "unconfirmed",
              "not-applicable",
            ]),
            parish: choice("Parish", [...parishes, "All parishes"]),
            address: optionalText("Address"),
            phone: optionalText("Phone"),
            phoneExtension: optionalText("Extension"),
            additionalPhones: {
              ...strings("Additional phone numbers"),
              optional: true,
            },
            hours: object(
              "Weekly opening hours",
              Object.fromEntries(
                [
                  "Monday",
                  "Tuesday",
                  "Wednesday",
                  "Thursday",
                  "Friday",
                  "Saturday",
                  "Sunday",
                ].map((label) => [
                  label.slice(0, 3).toLowerCase(),
                  { type: "hours", label } as ContentField,
                ]),
              ),
              { optional: true },
            ),
            bankHolidayHours: {
              type: "hours",
              label: "Bank holiday hours",
              optional: true,
            },
            coords,
            notes: text("Notes", { multiline: true, optional: true }),
            routes: optionalText("Bus routes"),
            whatsapp: optionalText("WhatsApp number"),
            verification: {
              ...list(
                "Sources",
                object("Source", {
                  id,
                  fields: list(
                    "Applies to",
                    choice("Fact", ["ppp", "hours", "contacts"]),
                    { min: 1 },
                  ),
                  source: text("Source"),
                  checkedOn: date("Date checked"),
                  note: optionalText("Notes"),
                }),
                { identity: "id" },
              ),
              optional: true,
            },
          }),
          { identity: "slug" },
        ),
      },
      [
        { id: "find", label: "Pharmacy finder" },
        { id: "detail", label: "Pharmacy details" },
      ],
    ),
    introduction:
      "health-and-emergency-services/find-an-open-pharmacy/index.md",
  },
  base(
    "shelters",
    "Find an emergency shelter",
    "/health-and-emergency-services/find-an-emergency-shelter",
    {
      lastUpdated: date("Last updated"),
      nextReview: date("Next review"),
      season: text("Hurricane season"),
      shelters: list(
        "Shelters",
        object("Shelter", {
          id,
          name: text("Name"),
          parish: choice("Parish", parishes),
          category: choice("Category", [1, 2]),
          ownership: choice("Ownership", ["Public", "Privately Owned"]),
          capacity: integer("Planning capacity"),
          water: flag("Potable water"),
          access: flag("Accessible bathroom"),
          notes: optionalText("Notes"),
          restriction: optionalText("Restrictions"),
          coords,
          address: optionalText("Address"),
        }),
        { identity: "id" },
      ),
      districtChairs: list(
        "District contacts",
        object("Contact", {
          id,
          district: text("District"),
          name: text("Name"),
          number: text("Phone"),
          tel: link("Phone link", false),
        }),
        { identity: "id" },
      ),
      hurricaneTerms: list(
        "Hurricane terms",
        object("Term", {
          id,
          term: text("Term"),
          definition: text("Definition", { multiline: true }),
        }),
        { identity: "id" },
      ),
      phoneDirectory: list(
        "Telephone directory",
        object("Group", {
          id,
          heading: text("Heading"),
          entries: list(
            "Contacts",
            object("Contact", {
              id,
              label: text("Name"),
              landingLabel: optionalText("Service page label"),
              contacts: list(
                "Phone numbers",
                object("Phone", {
                  id,
                  display: text("Phone"),
                  tel: link("Phone link", false),
                  note: optionalText("Notes"),
                }),
                { identity: "id" },
              ),
            }),
            { identity: "id" },
          ),
        }),
        { identity: "id" },
      ),
    },
    [
      { id: "page", label: "Service page" },
      { id: "find", label: "Shelter finder" },
      { id: "guidance", label: "Shelter guidance" },
    ],
  ),
];

export function smartTool(id: string): SmartToolDefinition {
  const definition = SMART_TOOLS.find((page) => page.id === id);
  if (!definition)
    throw new Error("This service is not registered for editing.");
  return definition;
}

function validateTool(
  id: string,
  content: ContentObject,
  base?: ContentObject,
): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const issue = (path: (string | number)[], message: string) =>
    issues.push({ path, message });

  if (id === "pharmacies" && base) {
    const records = content.pharmacies as ContentObject[];
    const originals = base.pharmacies as ContentObject[];
    const groups = {
      ppp: ["type", "pppStatus"],
      hours: ["hours", "bankHolidayHours"],
      contacts: [
        "name",
        "address",
        "phone",
        "phoneExtension",
        "additionalPhones",
        "whatsapp",
      ],
    };
    records.forEach((record, index) => {
      const original = originals.find((row) => row.slug === record.slug);
      if (!original) return;
      for (const [group, keys] of Object.entries(groups)) {
        if (keys.every((key) => sameContent(record[key], original[key])))
          continue;
        const sources = record.verification as ContentObject[] | undefined;
        const oldSources = original.verification as ContentObject[] | undefined;
        if (
          sources?.some(
            (source) =>
              (source.fields as string[]).includes(group) &&
              oldSources?.some(
                (old) => old.id === source.id && sameContent(old, source),
              ),
          )
        )
          issue(
            ["pharmacies", index, "verification"],
            `Update the source details for ${group} to confirm the changed information, or explicitly remove the outdated verification.`,
          );
      }
    });
  }
  return issues;
}
