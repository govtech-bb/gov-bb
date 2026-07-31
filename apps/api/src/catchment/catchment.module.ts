import { Module } from "@nestjs/common";
import { CatchmentRoutingService } from "./catchment-routing.service";

@Module({
  providers: [CatchmentRoutingService],
  exports: [CatchmentRoutingService],
})
export class CatchmentModule {}
