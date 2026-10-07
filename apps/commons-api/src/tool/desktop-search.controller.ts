import { BadRequestException, Controller, Get, Query, ServiceUnavailableException } from '@nestjs/common';
import { Public, RateLimit } from '~/modules/auth';
import { executeWebSearch, resolveWebSearchConfig } from './tools/web-search.provider';

/** Keyless desktop search. Only queries leave the computer; upstream credentials stay here. */
@Controller({ path: 'desktop-search', version: '1' })
export class DesktopSearchController {
  @Public()
  @RateLimit({ limit: 10, windowMs: 60_000, keyStrategy: 'ip' })
  @Get('search')
  async search(@Query('q') rawQuery?: string) {
    if (typeof rawQuery !== 'string' || !rawQuery.trim() || rawQuery.length > 500) {
      throw new BadRequestException('Provide a search query between 1 and 500 characters.');
    }
    // The free default uses our metasearch service. Never spend a paid provider
    // key or resolve an account's provider through this anonymous endpoint.
    try {
      const config = resolveWebSearchConfig({ ...process.env, WEB_SEARCH_PROVIDER: 'searxng' });
      const results = await executeWebSearch(config, { query: rawQuery.trim(), count: 5, safeSearch: 'moderate' });
      return { results: results.map(({ title, url, description }) => ({ title, url, content: description })) };
    } catch {
      throw new ServiceUnavailableException('Search is temporarily unavailable. Try again shortly or choose another provider in Settings.');
    }
  }
}
