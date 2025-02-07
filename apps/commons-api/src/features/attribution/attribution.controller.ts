import { Controller, Get } from '@nestjs/common';
import { AttributionService } from './attribution.service';

@Controller()
export class AttributionController {
  constructor(private readonly attribution: AttributionService) {}

  @Get()
  getHello(): string {
    return this.attribution.getHello();
  }
}
