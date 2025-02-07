import { Controller, Get } from '@nestjs/common';
import { ResourceService } from './resource.service';

@Controller()
export class ResourceController {
  constructor(private readonly resource: ResourceService) {}

  @Get()
  getHello(): string {
    return this.resource.getHello();
  }
}
