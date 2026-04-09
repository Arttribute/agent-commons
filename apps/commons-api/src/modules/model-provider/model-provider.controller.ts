import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { MODEL_REGISTRY } from './model-registry';

@Controller('v1/models')
export class ModelProviderController {
  /** Return all available models grouped by provider */
  @Public()
  @Get()
  list() {
    const grouped: Record<string, typeof MODEL_REGISTRY> = {};
    for (const entry of MODEL_REGISTRY) {
      if (!grouped[entry.provider]) grouped[entry.provider] = [];
      grouped[entry.provider].push(entry);
    }
    return { data: MODEL_REGISTRY, grouped };
  }
}
