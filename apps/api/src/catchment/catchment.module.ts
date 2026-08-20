import { Module } from "@nestjs/common";
import { CatchmentRoutingService } from "./catchment-routing.service";
import { CatchmentContactRepository } from "./catchment-contact.repository";
import { CatchmentContactService } from "./catchment-contact.service";

@Module({
  providers: [
    CatchmentRoutingService,
    CatchmentContactRepository,
    CatchmentContactService,
  ],
  exports: [CatchmentRoutingService, CatchmentContactService],
})
export class CatchmentModule {}
