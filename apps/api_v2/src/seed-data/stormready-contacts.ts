/** StormReady's contact records, in the order the static page shows them. */
export const STORMREADY_CONTACTS = [
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
  {
    key: "police-emergency",
    name: "Police",
    phone: "211",
  },
  {
    key: "bwa-water-outages",
    name: "BWA (water outages)",
    phone: "246-426-3990",
  },
];

/** Convert contacts for the v2 import; the static page must still work without api_v2. */
export function convertStormReadyContacts(markdown: string): string {
  const legacy = `<contacts>
<contact label="DEM Emergency Line" number="246-438-7575" tel="tel:+12464387575" emergency></contact>
<contact label="Barbados Met Office" number="246-535-0021" tel="tel:+12465350021"></contact>
<contact label="Police" number="211" tel="tel:211"></contact>
<contact label="BWA (water outages)" number="246-426-3990" tel="tel:+12464263990"></contact>
</contacts>`;
  if (!markdown.includes(legacy))
    throw new Error(
      "StormReady contacts differ from the import records; review the conversion.",
    );

  return markdown.replace(
    legacy,
    STORMREADY_CONTACTS.map(
      ({ key, name }) =>
        `### ${name}\n\n::contact{collection="contacts" record="${key}" fields="phone"}`,
    ).join("\n\n"),
  );
}
