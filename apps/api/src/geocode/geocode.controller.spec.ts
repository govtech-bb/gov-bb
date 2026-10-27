import { NotFoundException } from "@nestjs/common";
import type { CatchmentRoutingService } from "../catchment/catchment-routing.service";
import { GeocodeController } from "./geocode.controller";
import type { GeocodeService } from "./geocode.service";

function makeController(polyclinic: string | null) {
  const routing = {
    servingPolyclinicAt: vi.fn().mockReturnValue(polyclinic),
  } as unknown as CatchmentRoutingService;
  return {
    routing,
    controller: new GeocodeController({} as GeocodeService, routing),
  };
}

describe("GeocodeController polyclinic", () => {
  it("names the polyclinic a located address is routed to", () => {
    const { controller, routing } = makeController("Maurice Byer Polyclinic");
    expect(controller.polyclinic("13.25", "-59.63")).toEqual({
      polyclinic: "Maurice Byer Polyclinic",
    });
    expect(routing.servingPolyclinicAt).toHaveBeenCalledWith(13.25, -59.63);
  });

  it("is 404 for a point no polyclinic serves", () => {
    const { controller } = makeController(null);
    expect(() => controller.polyclinic("13.1", "-59.8")).toThrow(
      NotFoundException,
    );
  });
});
