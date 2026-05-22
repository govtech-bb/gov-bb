import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { FilesController } from "./files.controller";
import { FilesService } from "./files.service";
import { FormDefinitionsModule } from "../forms/form-definitions/form-definitions.module";
import uploadConfig from "../config/upload.config";

@Module({
  imports: [ConfigModule.forFeature(uploadConfig), FormDefinitionsModule],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
