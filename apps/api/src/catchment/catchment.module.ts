import { Module } from "@nestjs/common";
import { CatchmentRoutingService } from "./catchment-routing.service";
import { CatchmentContactRepository } from "./catchment-contact.repository";
import { CatchmentContactService } from "./catchment-contact.service";
import { CatchmentGeometryModule } from "./catchment-geometry.module";

@Module({
  imports: [CatchmentGeometryModule],
  providers: [
    CatchmentRoutingService,
    CatchmentContactRepository,
    CatchmentContactService,
  ],
  exports: [CatchmentRoutingService, CatchmentContactService],
})
export class CatchmentModule {}
