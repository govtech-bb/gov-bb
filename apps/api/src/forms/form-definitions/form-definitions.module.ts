import { Module } from '@nestjs/common';
import { FormDefinitionsController } from './form-definitions.controller';
import { FormDefinitionsService } from './form-definitions.service';

@Module({
  controllers: [FormDefinitionsController],
  providers: [FormDefinitionsService],
  exports: [FormDefinitionsService],
})
export class FormDefinitionsModule {}
