import { HttpModule, HttpService } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { CatchmentModule } from "@/catchment/catchment.module";
import { GeocodeController } from "./geocode.controller";
import {
  buildProviders,
  GEOCODE_PROVIDERS,
  GeocodeService,
} from "./geocode.service";

/** Barbados-locked address-lookup proxy over a configurable provider chain. */
@Module({
  // A provider that hangs must fail, so the chain falls through to the next.
  imports: [HttpModule.register({ timeout: 5000 }), CatchmentModule],
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
