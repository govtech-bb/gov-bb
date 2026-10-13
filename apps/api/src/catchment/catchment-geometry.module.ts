import { Module } from "@nestjs/common";
import { CatchmentGeometryController } from "./catchment-geometry.controller";
import { CatchmentGeometryService } from "./catchment-geometry.service";

@Module({
  controllers: [CatchmentGeometryController],
  providers: [CatchmentGeometryService],
  exports: [CatchmentGeometryService],
})
export class CatchmentGeometryModule {}
