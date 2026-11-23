import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseContentMarkdown } from "@govtech-bb/govbbmarkd";
import { CONTACTS } from "./collections";
import { convertStormReadyContacts } from "./stormready-contacts";

const source = readFileSync(
  join(
    __dirname,
    "../../../landing/src/content/health-and-emergency-services/stormready/index.md",
  ),
  "utf8",
);

describe("StormReady's import-time contact conversion", () => {
  it("keeps the rest of the page and replaces only its four contacts", () => {
    const converted = convertStormReadyContacts(source);
    const contacts = `### DEM Emergency Line

::contact{collection="contacts" record="dem-emergency-line" fields="phone"}

### Barbados Met Office

::contact{collection="contacts" record="barbados-met-office" fields="phone"}

### Police

::contact{collection="contacts" record="police-emergency" fields="phone"}

### BWA (water outages)

::contact{collection="contacts" record="bwa-water-outages" fields="phone"}`;

    expect(converted).toBe(
      source.replace(/<contacts>[\s\S]*?<\/contacts>/, contacts),
    );
    expect(parseContentMarkdown(converted).errors).toEqual([]);
    expect(CONTACTS.records.slice(-4)).toEqual([
      {
        key: "dem-emergency-line",
        name: "DEM Emergency Line",
        phone: "246-438-7575",
      },
      {
        key: "barbados-met-office",
        name: "Barbados Met Office",
        phone: "246-535-0021",
      },
      { key: "police-emergency", name: "Police", phone: "211" },
      {
        key: "bwa-water-outages",
        name: "BWA (water outages)",
        phone: "246-426-3990",
      },
    ]);
  });

  it.each([
    source.replace("246-438-7575", "246-438-0000"),
    source.replace("DEM Emergency Line", "Different label"),
    source.replace("tel:211", "tel:999"),
    source.replace(/<contacts>[\s\S]*?<\/contacts>/, ""),
  ])(
    "refuses changed or missing contacts instead of importing stale details",
    (changed) => {
      expect(() => convertStormReadyContacts(changed)).toThrow(
        "StormReady contacts differ from the import records",
      );
    },
  );
});
