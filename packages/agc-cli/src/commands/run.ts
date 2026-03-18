import { Command } from 'commander';
import { loadConfig, makeClient } from '../config.js';
import { c, sym, spin, printError, jsonOut } from '../ui.js';

export function runCommand(): Command {
  return new Command('run')
    .description('Send a single prompt to an agent and stream the response')
    .argument('<prompt>', 'Prompt text to send')
    .option('--agent <agentId>', 'Agent ID')
    .option('--session <sessionId>', 'Session ID')
    .option('--no-stream', 'Disable streaming (wait for full response)')
    .option('--json', 'Output raw event stream as JSON lines')
    .action(async (prompt: string, opts) => {
      const cfg = loadConfig();
      const agentId = opts.agent ?? cfg.defaultAgentId;
      if (!agentId) {
        console.error(c.error('Specify --agent <agentId> or set defaultAgentId with `agc config set defaultAgentId <id>`'));
        process.exit(1);
      }

      const params = {
        agentId,
        sessionId: opts.session,
        messages: [{ role: 'user' as const, content: prompt }],
        ...(cfg.initiator && { initiatorId: cfg.initiator }),
      };

      if (opts.noStream) {
        const spinner = spin('Running…');
        try {
          const client = makeClient();
          const result = await client.run.once(params);
          spinner.stop();
          if (opts.json) return jsonOut(result);
          const text = result?.content ?? result?.text ?? result?.message ?? JSON.stringify(result);
          console.log(text);
        } catch (err) {
          spinner.stop();
          printError(err);
          process.exit(1);
        }
        return;
      }

      // Streaming mode
      try {
        const client = makeClient();
        let hasOutput = false;
        for await (const event of client.agents.stream(params)) {
          if (opts.json) {
            console.log(JSON.stringify(event));
            continue;
          }
          if (event.type === 'token') {
            process.stdout.write((event as any).content ?? '');
            hasOutput = true;
          } else if (event.type === 'final') {
            if (hasOutput) process.stdout.write('\n');
            const e = event as any;
            if (e.content && !hasOutput) console.log(e.content);
            break;
          } else if (event.type === 'error') {
            if (hasOutput) process.stdout.write('\n');
            console.error(`\n${sym.fail} ${c.error((event as any).message ?? 'Error')}`);
            process.exit(1);
          }
        }
        if (hasOutput && !opts.json) process.stdout.write('\n');
      } catch (err) {
        printError(err);
        process.exit(1);
      }
    });
}
