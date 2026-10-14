import { DesktopSearchController } from './desktop-search.controller';
import { executeWebSearch, resolveWebSearchConfig } from './tools/web-search.provider';
jest.mock('./tools/web-search.provider', () => ({ executeWebSearch: jest.fn(), resolveWebSearchConfig: jest.fn() }));

describe('keyless desktop search', () => {
  beforeEach(() => jest.clearAllMocks());
  it('uses only managed metasearch with a bounded result count and no account billing', async () => {
    (resolveWebSearchConfig as jest.Mock).mockReturnValue({ provider: 'searxng' });
    (executeWebSearch as jest.Mock).mockResolvedValue([{ title: 'Pandas', url: 'https://pandas.pydata.org', description: 'Documentation' }]);
    expect(await new DesktopSearchController().search(' pandas documentation ')).toEqual({ results: [{ title: 'Pandas', url: 'https://pandas.pydata.org', content: 'Documentation' }] });
    expect(resolveWebSearchConfig).toHaveBeenCalledWith(expect.objectContaining({ WEB_SEARCH_PROVIDER: 'searxng' }));
    expect(executeWebSearch).toHaveBeenCalledWith(expect.anything(), { query: 'pandas documentation', count: 5, safeSearch: 'moderate' });
  });
  it('rejects oversized queries before contacting upstream', async () => {
    await expect(new DesktopSearchController().search('x'.repeat(501))).rejects.toThrow(/500/);
    expect(executeWebSearch).not.toHaveBeenCalled();
  });
  it('does not expose provider errors or credentials in failures', async () => {
    (executeWebSearch as jest.Mock).mockRejectedValue(new Error('private-upstream-key'));
    await expect(new DesktopSearchController().search('pandas')).rejects.toThrow('Search is temporarily unavailable');
  });
});
