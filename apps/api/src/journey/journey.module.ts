import { Module } from "@nestjs/common";
import { JourneyController } from "./journey.controller";
import { JourneyService } from "./journey.service";

// Self-contained: no database, no queue. Events go to the logs only.
@Module({
  controllers: [JourneyController],
  providers: [JourneyService],
})
export class JourneyModule {}
