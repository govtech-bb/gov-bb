import { parishAt } from "./parish-at";

describe("parishAt", () => {
  it.each([
    // Kensington Mall — Google returns no parish for it.
    [13.105526, -59.624292, "st-michael"],
    [13.1428, -59.5599, "st-george"], // Gun Hill
    [13.163068, -59.580912, "st-thomas"], // Applewhaites
    [13.066, -59.542, "christ-church"], // Oistins
    [13.31, -59.61, "st-lucy"],
  ])("places %s,%s in %s", (lat, lon, parish) => {
    expect(parishAt(lat, lon)).toBe(parish);
  });

  it("falls back to the nearest parish for a point just off the generalised coastline", () => {
    // Bridgetown's careenage waterfront, west of the simplified St Michael edge.
    expect(parishAt(13.0965, -59.6235)).toBe("st-michael");
  });

  // The outline sits up to ~630 m inside the real shore on the St Philip coast.
  it.each([
    [13.1063, -59.4378, "st-philip"], // Crane Beach
    [13.117, -59.428, "st-philip"], // Bottom Bay
  ])(
    "keeps the parish of a beach %s,%s well outside the outline",
    (lat, lon, parish) => {
      expect(parishAt(lat, lon)).toBe(parish);
    },
  );

  // A pin in the sea must not route on a guessed parish.
  it.each([
    [13.34, -59.41], // 18 km off the north-east coast
    [13.17, -59.66], // 2 km off the west coast
  ])("returns empty for a point at sea, %s,%s", (lat, lon) => {
    expect(parishAt(lat, lon)).toBe("");
  });

  it("returns empty outside Barbados", () => {
    expect(parishAt(51.5, -0.12)).toBe("");
  });
});
