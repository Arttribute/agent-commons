import { Command } from 'commander';
import { makeClient } from '../config.js';
import { c, spin, printError, jsonOut } from '../ui.js';

export function modelsCommand(): Command {
  const cmd = new Command('models').description('List available LLM models');

  cmd
    .command('ls')
    .description('List all available models grouped by provider')
    .option('--provider <name>', 'Filter by provider (openai, anthropic, google, mistral, groq, ollama)')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const client = makeClient();
      const spinner = spin('Fetching models…');
      try {
        const res = await client.models.list();
        spinner.stop();
        const all = (res as any)?.data ?? res ?? [];

        if (opts.json) return jsonOut(all);

        const filtered = opts.provider
          ? all.filter((m: any) => m.provider === opts.provider)
          : all;

        if (filtered.length === 0) {
          console.log(c.warn('  No models found.'));
          return;
        }

        // Group by provider
        const grouped: Record<string, any[]> = {};
        for (const m of filtered) {
          if (!grouped[m.provider]) grouped[m.provider] = [];
          grouped[m.provider].push(m);
        }

        for (const [provider, models] of Object.entries(grouped)) {
          console.log(`\n${c.bold(provider.toUpperCase())}`);
          for (const m of models) {
            const tags = [
              m.tier,
              m.supportsTools ? 'tools' : '',
              m.supportsVision ? 'vision' : '',
            ].filter(Boolean).join(', ');
            const price = m.inputPricePer1kTokens > 0
              ? c.dim(` ($${m.inputPricePer1kTokens}/$${m.outputPricePer1kTokens} /1k)`)
              : c.dim(' (free/local)');
            console.log(`  ${c.id(m.modelId.padEnd(36))} ${m.displayName.padEnd(24)} ${c.dim(tags)}${price}`);
          }
        }
        console.log();
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  return cmd;
}
