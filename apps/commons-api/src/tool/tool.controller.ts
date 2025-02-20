import { Controller, Get } from '@nestjs/common';
import { ToolService } from './tool.service';

@Controller()
export class ToolController {
  constructor(private readonly tool: ToolService) {}

  @Get()
  getHello(): string {
    return this.tool.getHello();
  }
}
