import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { MODEL_REGISTRY } from './model-registry';

@Controller('v1/models')
export class ModelProviderController {
  private freeHealth?: { until: number; available: boolean };

  private async hostedFreeAvailable() {
    const base = process.env.HOSTED_FREE_MODEL_BASE_URL;
    if (!base || !process.env.HOSTED_FREE_MODEL_API_KEY) return false;
    if (this.freeHealth && Date.now() < this.freeHealth.until) return this.freeHealth.available;
    let available = false;
    try {
      const url = new URL(base);
      url.pathname = '/health';
      url.search = '';
      available = (await fetch(url, { signal: AbortSignal.timeout(2_000) })).ok;
    } catch { /* The model stays hidden until its service responds. */ }
    this.freeHealth = { available, until: Date.now() + 30_000 };
    return available;
  }

  /** Return all available models grouped by provider */
  @Public()
  @Get()
  async list() {
    const grouped: Record<string, typeof MODEL_REGISTRY> = {};
    const freeAvailable = await this.hostedFreeAvailable();
    const available = MODEL_REGISTRY.filter((entry) => entry.provider !== 'hosted-free' || freeAvailable);
    for (const entry of available) {
      if (!grouped[entry.provider]) grouped[entry.provider] = [];
      grouped[entry.provider].push(entry);
    }
    return { data: available, grouped };
  }
}
