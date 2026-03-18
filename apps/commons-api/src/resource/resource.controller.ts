import { Controller } from '@nestjs/common';
import { ResourceService } from './resource.service';

@Controller('resources')
export class ResourceController {
  constructor(private readonly resource: ResourceService) {}
}
