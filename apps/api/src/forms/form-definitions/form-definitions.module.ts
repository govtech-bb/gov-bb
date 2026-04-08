import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FormDefinitionsController } from './form-definitions.controller';
import { FormDefinitionsService } from './form-definitions.service';
import { FormDefinitionEntity } from '../../database/entities/form-definition.entity';
import { RegistryModule } from '../../registry/registry.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([FormDefinitionEntity]),
    RegistryModule,
  ],
  controllers: [FormDefinitionsController],
  providers: [FormDefinitionsService],
  exports: [FormDefinitionsService],
})
export class FormDefinitionsModule {}
