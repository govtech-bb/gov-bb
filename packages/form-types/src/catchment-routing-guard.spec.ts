import { checkCatchmentRoutingHasMapping } from "./catchment-routing-guard";
import { processorSchema } from "./processor.type";

const CATCHMENT_ROUTING = {
  coordinatesField: "about-restaurant.restaurant-address-coordinates",
  parishField: "about-restaurant.restaurant-parish",
};

// Parsed so the fixtures carry the schema defaults the `Processor` type expects.
const MAPPED_WEBHOOK = processorSchema.parse({
  type: "webhook",
  config: {
    mapping: {
      programmeCode: "RESTAURANT_LICENCE",
      applicant: {
        name: "about-you.your-name",
        email: "about-you.your-email",
        phone: "about-you.your-telephone",
      },
    },
  },
});

const GENERIC_WEBHOOK = processorSchema.parse({
  type: "webhook",
  config: { url: "https://example.gov.bb/hook" },
});

const EMAIL = processorSchema.parse({
  type: "email",
  config: { recipientField: "about-you.your-email" },
});

describe("checkCatchmentRoutingHasMapping", () => {
  it("accepts a recipe with no catchmentRouting, whatever its processors", () => {
    expect(checkCatchmentRoutingHasMapping({})).toEqual([]);
    expect(checkCatchmentRoutingHasMapping({ processors: [EMAIL] })).toEqual(
      [],
    );
  });

  it("accepts a catchment-routed recipe with a mapped webhook", () => {
    expect(
      checkCatchmentRoutingHasMapping({
        catchmentRouting: CATCHMENT_ROUTING,
        processors: [EMAIL, MAPPED_WEBHOOK],
      }),
    ).toEqual([]);
  });

  it("rejects a catchment-routed recipe with no processors at all", () => {
    expect(
      checkCatchmentRoutingHasMapping({ catchmentRouting: CATCHMENT_ROUTING }),
    ).toEqual([
      expect.stringMatching(
        /declares catchmentRouting but no webhook processor with mapping\.programmeCode/,
      ),
    ]);
  });

  it("rejects a catchment-routed recipe whose only webhook is a generic (unmapped) one", () => {
    expect(
      checkCatchmentRoutingHasMapping({
        catchmentRouting: CATCHMENT_ROUTING,
        processors: [EMAIL, GENERIC_WEBHOOK],
      }),
    ).toHaveLength(1);
  });
});
