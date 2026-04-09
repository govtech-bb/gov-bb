import { Controller } from '@nestjs/common';
import { FormVersionsService } from './form-versions.service';

@Controller('form-definitions/:definitionId/versions')
export class FormVersionsController {
  constructor(private readonly formVersionsService: FormVersionsService) {}
}
