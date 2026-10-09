import { HttpModule, HttpService } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { GeocodeController } from "./geocode.controller";
import {
  buildProviders,
  GEOCODE_PROVIDERS,
  GeocodeService,
} from "./geocode.service";

/** Barbados-locked address-lookup proxy over a configurable provider chain. */
@Module({
  imports: [HttpModule],
  controllers: [GeocodeController],
  providers: [
    {
      provide: GEOCODE_PROVIDERS,
      useFactory: (http: HttpService) => buildProviders(http, process.env),
      inject: [HttpService],
    },
    GeocodeService,
  ],
})
export class GeocodeModule {}
