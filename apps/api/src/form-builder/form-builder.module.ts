import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { FormBuilderController } from "./form-builder.controller";
import { FormBuilderService } from "./form-builder.service";
import { AiService } from "./ai.service";
import { RegistryModule } from "../registry/registry.module";
import { CustomComponent } from "../registry/entities/custom-component.entity";
import { FormDefinitionEntity } from "../database/entities/form-definition.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([CustomComponent, FormDefinitionEntity]),
    RegistryModule,
  ],
  controllers: [FormBuilderController],
  providers: [FormBuilderService, AiService],
})
export class FormBuilderModule {}
