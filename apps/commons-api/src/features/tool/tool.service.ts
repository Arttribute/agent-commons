import { Injectable } from '@nestjs/common';

@Injectable()
export class ToolService {
  getHello(): string {
    return 'Hello World!';
  }
}
