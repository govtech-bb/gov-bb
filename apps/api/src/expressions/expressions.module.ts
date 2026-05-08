import { Module } from "@nestjs/common";
import { ExpressionsService } from "./expressions.service";

@Module({
  providers: [ExpressionsService],
  exports: [ExpressionsService],
})
export class ExpressionsModule {}
