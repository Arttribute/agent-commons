import { Injectable } from '@nestjs/common';

@Injectable()
export class ResourceService {
  getHello(): string {
    return 'Hello World!';
  }
}
