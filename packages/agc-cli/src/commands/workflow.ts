import { Command } from 'commander';
import { loadConfig, makeClient } from '../config.js';
import { c, sym, table, detail, section, relativeTime, statusBadge, spin, printError, jsonOut } from '../ui.js';

export function workflowCommand(): Command {
  const cmd = new Command('workflow').description('Run and monitor workflows').alias('wf');

  // ── list ────────────────────────────────────────────────────────────────────
  cmd
    .command('list')
    .description('List workflows owned by the current initiator')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const cfg = loadConfig();
      if (!cfg.initiator) {
        console.error(c.error('No initiator set. Run `agc login` first.'));
        process.exit(1);
      }
      const spinner = spin('Fetching workflows…');
      try {
        const client = makeClient();
        const workflows = await client.workflows.list(cfg.initiator, 'user');
        spinner.stop();
        if (opts.json) return jsonOut(workflows);
        section(`Workflows (${workflows.length})`);
        table(
          workflows.map((w) => ({
            ID:      w.workflowId.slice(0, 8) + '…',
            Name:    w.name,
            Nodes:   String((w.definition?.nodes ?? []).length),
            Public:  w.isPublic ? 'yes' : 'no',
            Created: relativeTime(w.createdAt),
          })),
          ['ID', 'Name', 'Nodes', 'Public', 'Created'],
        );
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── get ─────────────────────────────────────────────────────────────────────
  cmd
    .command('get <workflowId>')
    .description('Show workflow details')
    .option('--json', 'Output as JSON')
    .action(async (workflowId: string, opts) => {
      const spinner = spin('Fetching workflow…');
      try {
        const client = makeClient();
        const wf = await client.workflows.get(workflowId);
        spinner.stop();
        if (opts.json) return jsonOut(wf);
        section(wf.name);
        detail([
          ['Workflow ID', c.id(wf.workflowId)],
          ['Description', wf.description ?? c.dim('(none)')],
          ['Nodes',       String((wf.definition?.nodes ?? []).length)],
          ['Public',      wf.isPublic ? 'yes' : 'no'],
          ['Created',     relativeTime(wf.createdAt)],
        ]);
        if (wf.definition?.nodes?.length) {
          console.log('\n  ' + c.label('Nodes'));
          for (const node of wf.definition.nodes) {
            console.log(`  ${c.dim('·')} ${node.id} ${c.dim('(' + (node.type ?? 'tool') + ')')}`);
          }
        }
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── run ──────────────────────────────────────────────────────────────────────
  cmd
    .command('run <workflowId>')
    .description('Execute a workflow')
    .option('--agent <agentId>', 'Agent context')
    .option('--session <sessionId>', 'Session context')
    .option('--input <json>', 'Input data as JSON string', '{}')
    .option('--watch', 'Stream execution progress via SSE')
    .option('--json', 'Output result as JSON')
    .action(async (workflowId: string, opts) => {
      const cfg = loadConfig();
      const agentId = opts.agent ?? cfg.defaultAgentId;
      let inputData: Record<string, any> = {};
      try { inputData = JSON.parse(opts.input); } catch { console.error(c.error('--input must be valid JSON')); process.exit(1); }

      const spinner = spin('Executing workflow…');
      try {
        const client = makeClient();
        const execution = await client.workflows.execute(workflowId, {
          agentId,
          sessionId: opts.session,
          inputData,
        });
        spinner.stop();

        if (opts.json && !opts.watch) return jsonOut(execution);

        console.log(`\n${sym.ok} Execution started: ${c.id(execution.executionId)}`);
        console.log(`   Status: ${statusBadge(execution.status)}`);

        if (!opts.watch) {
          if (execution.status === 'completed') {
            console.log('\n' + c.label('Result'));
            console.log('  ' + JSON.stringify((execution as any).result ?? (execution as any).outputData, null, 2));
          }
          return;
        }

        // SSE watch mode
        console.log(c.dim('\nStreaming execution progress...\n'));
        for await (const event of client.workflows.stream(workflowId, execution.executionId)) {
          if (event.type === 'status') {
            const e = event as any;
            process.stdout.write(`\r  ${statusBadge(e.status ?? '')}  node: ${c.dim(e.currentNode ?? '…')}      `);
          } else if (event.type === 'completed') {
            process.stdout.write('\n');
            console.log(`\n${sym.ok} ${c.success('Completed')}`);
            const e = event as any;
            if (e.outputData) {
              console.log('\n' + c.label('Output'));
              console.log('  ' + JSON.stringify(e.outputData, null, 2));
            }
            break;
          } else if (event.type === 'failed' || event.type === 'cancelled') {
            process.stdout.write('\n');
            console.error(`\n${sym.fail} ${c.error((event as any).errorMessage ?? event.type)}`);
            break;
          } else if ((event as any).type === 'awaiting_approval') {
            process.stdout.write('\n');
            const e = event as any;
            console.log(`\n${c.warn('⏸  Awaiting approval')} at node ${c.id(e.pausedAtNode ?? '')}`);
            console.log(c.dim(`   Token: ${e.approvalToken}`));
            console.log(c.dim(`   Use: agc workflow approve ${workflowId} ${execution.executionId} <token>`));
          }
        }
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── executions ───────────────────────────────────────────────────────────────
  cmd
    .command('executions <workflowId>')
    .description('List recent executions for a workflow')
    .option('--limit <n>', 'Max results', '20')
    .option('--json', 'Output as JSON')
    .action(async (workflowId: string, opts) => {
      const spinner = spin('Fetching executions…');
      try {
        const client = makeClient();
        const executions = await client.workflows.listExecutions(workflowId, Number(opts.limit));
        spinner.stop();
        if (opts.json) return jsonOut(executions);
        section(`Executions (${executions.length})`);
        table(
          executions.map((e) => ({
            ID:       e.executionId.slice(0, 8) + '…',
            Status:   statusBadge(e.status),
            Node:     e.currentNode ?? '',
            Started:  e.startedAt ? relativeTime(e.startedAt) : '',
          })),
          ['ID', 'Status', 'Node', 'Started'],
        );
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── approve ──────────────────────────────────────────────────────────────────
  cmd
    .command('approve <workflowId> <executionId> <token>')
    .description('Approve a paused human_approval step')
    .option('--data <json>', 'Approval data as JSON', '{}')
    .action(async (workflowId: string, executionId: string, token: string, opts) => {
      let approvalData: Record<string, any> = {};
      try { approvalData = JSON.parse(opts.data); } catch { /* ignore */ }
      const spinner = spin('Approving…');
      try {
        const client = makeClient();
        await client.workflows.approveExecution(workflowId, executionId, {
          approvalToken: token,
          approvalData,
        });
        spinner.stop();
        console.log(`${sym.ok} Execution ${c.id(executionId)} approved — workflow resuming.`);
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── reject ───────────────────────────────────────────────────────────────────
  cmd
    .command('reject <workflowId> <executionId> <token>')
    .description('Reject a paused human_approval step')
    .option('--reason <text>', 'Rejection reason')
    .action(async (workflowId: string, executionId: string, token: string, opts) => {
      const spinner = spin('Rejecting…');
      try {
        const client = makeClient();
        await client.workflows.rejectExecution(workflowId, executionId, {
          approvalToken: token,
          reason: opts.reason,
        });
        spinner.stop();
        console.log(`${sym.ok} Execution ${c.id(executionId)} rejected.`);
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  return cmd;
}
