import { Controller } from '@nestjs/common';
import { FormDefinitionsService } from './form-definitions.service';

@Controller('form-definitions')
export class FormDefinitionsController {
  constructor(private readonly formDefinitionsService: FormDefinitionsService) {}
}
