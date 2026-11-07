import { CodeProjectBuilder } from '../code-project/code-project.builder';
import { createPageFiles } from './templates';
import { validateFiles } from '../code-project/code-project.service';
describe('camp starter', () => {
  it('builds the actual camp page with its independent artwork and fonts', async () => {
    const files = validateFiles(
      createPageFiles('ai-kids-camp', { title: 'AI Kids Hacker Camp' }),
    );
    const built = await new CodeProjectBuilder().build({
      name: 'AI Kids Hacker Camp',
      entryFile: 'app/page.tsx',
      files,
    });
    expect(built.assets.some((f) => f.path.endsWith('.png'))).toBe(true);
    expect(built.assets.some((f) => f.path.endsWith('.ttf'))).toBe(true);
    const js = built.assets
      .filter((f) => f.path.endsWith('.js'))
      .map((f) => String(f.content))
      .join('');
    expect(js).toContain('Comics &');
    expect(js).toContain('KSh 5,000');
    expect(js).toContain('Registration opens soon.');
    expect(js).not.toContain('price and booking details to be confirmed');
  }, 30000);
});
