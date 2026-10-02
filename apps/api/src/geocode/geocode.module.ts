import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { GeocodeController } from "./geocode.controller";
import { GeocodeService } from "./geocode.service";

/** Barbados-locked address-lookup proxy over OpenStreetMap/Nominatim. */
@Module({
  imports: [HttpModule],
  controllers: [GeocodeController],
  providers: [GeocodeService],
})
export class GeocodeModule {}
