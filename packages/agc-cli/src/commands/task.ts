import { Command } from 'commander';
import { loadConfig, makeClient } from '../config.js';
import { c, sym, table, detail, section, relativeTime, statusBadge, spin, printError, jsonOut } from '../ui.js';

export function taskCommand(): Command {
  const cmd = new Command('task').description('Manage and execute tasks').alias('t');

  // ── list ────────────────────────────────────────────────────────────────────
  cmd
    .command('list')
    .description('List tasks')
    .option('--agent <agentId>', 'Filter by agent ID')
    .option('--session <sessionId>', 'Filter by session ID')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const cfg = loadConfig();
      const agentId = opts.agent ?? cfg.defaultAgentId;
      const spinner = spin('Fetching tasks…');
      try {
        const client = makeClient();
        const filter: Record<string, string> = {};
        if (agentId) filter.agentId = agentId;
        if (opts.session) filter.sessionId = opts.session;
        if (cfg.initiator) { filter.ownerId = cfg.initiator; filter.ownerType = 'user'; }
        const res = await client.tasks.list(filter as any);
        const tasks = (res as any)?.data ?? res ?? [];
        spinner.stop();
        if (opts.json) return jsonOut(tasks);
        section(`Tasks (${tasks.length})`);
        table(
          tasks.map((t: any) => ({
            ID:      t.taskId.slice(0, 8) + '…',
            Title:   (t.title ?? t.description ?? '').slice(0, 40),
            Status:  statusBadge(t.status ?? ''),
            Agent:   (t.agentId ?? '').slice(0, 8) + '…',
            Created: relativeTime(t.createdAt),
          })),
          ['ID', 'Title', 'Status', 'Agent', 'Created'],
        );
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── get ─────────────────────────────────────────────────────────────────────
  cmd
    .command('get <taskId>')
    .description('Show task details')
    .option('--json', 'Output as JSON')
    .action(async (taskId: string, opts) => {
      const spinner = spin('Fetching task…');
      try {
        const client = makeClient();
        const res = await client.tasks.get(taskId);
        const task = (res as any)?.data ?? res;
        spinner.stop();
        if (opts.json) return jsonOut(task);
        section('Task');
        detail([
          ['Task ID',     c.id(task.taskId)],
          ['Title',       task.title ?? task.description ?? c.dim('(none)')],
          ['Status',      statusBadge(task.status ?? '')],
          ['Agent ID',    task.agentId ?? c.dim('(none)')],
          ['Session ID',  task.sessionId ?? c.dim('(none)')],
          ['Created',     relativeTime(task.createdAt)],
        ]);
        if (task.result) {
          console.log('\n  ' + c.label('Result'));
          console.log('  ' + JSON.stringify(task.result, null, 2).split('\n').join('\n  '));
        }
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── create ──────────────────────────────────────────────────────────────────
  cmd
    .command('create')
    .description('Create a new task')
    .requiredOption('--title <title>', 'Task title')
    .option('--agent <agentId>', 'Agent ID')
    .option('--session <sessionId>', 'Session ID')
    .option('--workflow <workflowId>', 'Workflow ID to attach')
    .option('--input <json>', 'Input data as JSON', '{}')
    .option('--timeout <ms>', 'Execution timeout in milliseconds')
    .option('--execute', 'Execute immediately after creation')
    .option('--watch', 'Stream execution progress (implies --execute)')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const cfg = loadConfig();
      const agentId = opts.agent ?? cfg.defaultAgentId;
      if (!agentId) {
        console.error(c.error('Specify --agent <agentId> or set defaultAgentId with `agc config set defaultAgentId <id>`'));
        process.exit(1);
      }
      let inputData: Record<string, any> = {};
      try { inputData = JSON.parse(opts.input); } catch { console.error(c.error('--input must be valid JSON')); process.exit(1); }

      const spinner = spin('Creating task…');
      try {
        const client = makeClient();
        const res = await client.tasks.create({
          title: opts.title,
          agentId,
          sessionId: opts.session,
          workflowId: opts.workflow,
          inputData,
          ...(opts.timeout && { timeoutMs: Number(opts.timeout) }),
          ...(cfg.initiator && { ownerId: cfg.initiator, ownerType: 'user' }),
        } as any);
        const task = (res as any)?.data ?? res;
        spinner.stop();

        if (opts.json && !opts.execute && !opts.watch) return jsonOut(task);

        console.log(`\n${sym.ok} Task created: ${c.id(task.taskId)}`);

        if (!opts.execute && !opts.watch) return;

        // Execute
        const execSpinner = spin('Executing task…');
        const execRes = await client.tasks.execute(task.taskId);
        execSpinner.stop();
        console.log(`   Status: ${statusBadge(execRes?.data?.status ?? 'pending')}`);

        if (!opts.watch) {
          if (execRes?.data?.result) {
            console.log('\n' + c.label('Result'));
            console.log('  ' + JSON.stringify(execRes.data.result, null, 2));
          }
          return;
        }

        // SSE watch mode
        console.log(c.dim('\nStreaming task progress...\n'));
        for await (const event of client.tasks.stream(task.taskId)) {
          if (event.type === 'token') {
            process.stdout.write((event as any).content ?? '');
          } else if (event.type === 'status') {
            const e = event as any;
            process.stdout.write(`\r  ${statusBadge(e.status ?? '')}  `);
          } else if (event.type === 'final' || event.type === 'completed') {
            process.stdout.write('\n');
            console.log(`\n${sym.ok} ${c.success('Completed')}`);
            const e = event as any;
            if (e.result ?? e.outputData) {
              console.log('\n' + c.label('Output'));
              console.log('  ' + JSON.stringify(e.result ?? e.outputData, null, 2));
            }
            break;
          } else if (event.type === 'failed' || event.type === 'error') {
            process.stdout.write('\n');
            console.error(`\n${sym.fail} ${c.error((event as any).message ?? event.type)}`);
            break;
          }
        }
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── execute ─────────────────────────────────────────────────────────────────
  cmd
    .command('execute <taskId>')
    .description('Execute an existing task')
    .option('--watch', 'Stream execution progress via SSE')
    .option('--json', 'Output result as JSON')
    .action(async (taskId: string, opts) => {
      const spinner = spin('Executing task…');
      try {
        const client = makeClient();
        const res = await client.tasks.execute(taskId);
        spinner.stop();

        if (opts.json && !opts.watch) return jsonOut(res);
        console.log(`\n${sym.ok} Execution started`);
        console.log(`   Status: ${statusBadge((res as any)?.data?.status ?? 'pending')}`);

        if (!opts.watch) return;

        console.log(c.dim('\nStreaming task progress...\n'));
        for await (const event of client.tasks.stream(taskId)) {
          if (event.type === 'token') {
            process.stdout.write((event as any).content ?? '');
          } else if (event.type === 'final' || event.type === 'completed') {
            process.stdout.write('\n');
            console.log(`\n${sym.ok} ${c.success('Completed')}`);
            break;
          } else if (event.type === 'failed' || event.type === 'error') {
            process.stdout.write('\n');
            console.error(`\n${sym.fail} ${c.error((event as any).message ?? event.type)}`);
            break;
          }
        }
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── cancel ──────────────────────────────────────────────────────────────────
  cmd
    .command('cancel <taskId>')
    .description('Cancel a running task')
    .action(async (taskId: string) => {
      const spinner = spin('Cancelling task…');
      try {
        const client = makeClient();
        await client.tasks.cancel(taskId);
        spinner.stop();
        console.log(`${sym.ok} Task ${c.id(taskId)} cancelled.`);
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  return cmd;
}
