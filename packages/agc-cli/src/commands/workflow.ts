import { Command } from 'commander';
import { readFileSync } from 'fs';
import { loadConfig, makeClient } from '../config.js';
import { c, sym, table, detail, section, relativeTime, statusBadge, spin, printError, jsonOut } from '../ui.js';
import {
  buildWorkflowTemplate,
  listWorkflowTemplates,
  type WorkflowTemplateName,
  type WorkflowTemplateContext,
} from '@agent-commons/sdk';

export function workflowCommand(): Command {
  const cmd = new Command('workflow').description('Run and monitor workflows').alias('wf');

  async function createTemplateWorkflow(params: {
    templateName: WorkflowTemplateName;
    ctx: WorkflowTemplateContext;
    isPublic?: boolean;
  }) {
    const client = makeClient();
    const template = buildWorkflowTemplate(params.templateName, params.ctx);
    const toolIds: Record<string, string> = {};
    const createdTools: any[] = [];

    for (const tool of template.tools) {
      const created = await client.tools.create({
        ...tool.payload,
        owner: params.ctx.ownerId,
        ownerType: 'user',
      });
      const createdTool = (created as any)?.data ?? created;
      toolIds[tool.key] = createdTool.toolId;
      createdTools.push(createdTool);
    }

    const workflow = await client.workflows.create({
      name: template.name,
      description: template.description,
      ownerId: params.ctx.ownerId,
      ownerType: 'user',
      isPublic: params.isPublic,
      category: template.category,
      tags: template.tags,
      definition: template.buildDefinition(toolIds, params.ctx),
    });

    return { template, workflow, createdTools };
  }

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

  // ── create ──────────────────────────────────────────────────────────────────
  cmd
    .command('create')
    .description('Create a workflow from a JSON file')
    .requiredOption('--file <path>', 'Path to a workflow payload or definition JSON file')
    .option('--name <name>', 'Workflow name')
    .option('--description <text>', 'Workflow description')
    .option('--public', 'Make workflow public')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const cfg = loadConfig();
      if (!cfg.initiator) {
        console.error(c.error('No initiator set. Run `agc login` first.'));
        process.exit(1);
      }

      let fileJson: any;
      try {
        fileJson = JSON.parse(readFileSync(opts.file, 'utf8'));
      } catch (error: any) {
        console.error(c.error(`Could not read workflow file: ${error.message}`));
        process.exit(1);
      }

      const definition = fileJson.definition ?? fileJson;
      if (!Array.isArray(definition.nodes) || !Array.isArray(definition.edges)) {
        console.error(c.error('Workflow file must include a definition with "nodes" and "edges".'));
        process.exit(1);
      }

      const spinner = spin('Creating workflow…');
      try {
        const client = makeClient();
        const workflow = await client.workflows.create({
          name: opts.name ?? fileJson.name ?? 'CLI Workflow',
          description: opts.description ?? fileJson.description,
          definition,
          ownerId: cfg.initiator,
          ownerType: 'user',
          isPublic: opts.public ?? fileJson.isPublic,
          category: fileJson.category,
          tags: fileJson.tags,
        });
        spinner.stop();
        if (opts.json) return jsonOut(workflow);
        console.log(`\n${sym.ok} Workflow created`);
        detail([
          ['Workflow ID', c.id(workflow.workflowId)],
          ['Name', workflow.name],
          ['Nodes', String((workflow.definition?.nodes ?? []).length)],
        ]);
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── templates ────────────────────────────────────────────────────────────────
  const templates = cmd.command('templates').description('Create workflows from built-in templates');

  templates
    .command('list')
    .description('List built-in workflow templates')
    .option('--json', 'Output as JSON')
    .action((opts) => {
      const rows = listWorkflowTemplates();
      if (opts.json) return jsonOut(rows);
      section(`Workflow Templates (${rows.length})`);
      table(
        rows.map((template) => ({
          Name: template.name,
          Description: template.description,
        })),
        ['Name', 'Description'],
      );
    });

  templates
    .command('create <templateName>')
    .description('Create a workflow template and its required API tools')
    .option('--prefix <prefix>', 'Stable prefix for generated tool/workflow names')
    .option('--agent <agentId>', 'Agent ID for agent_processor nodes')
    .option('--reviewer-agent <agentId>', 'Second agent ID for multi-agent templates')
    .option('--child-workflow <workflowId>', 'Child workflow ID for workflow-invocation-smoke')
    .option('--public', 'Make workflow public')
    .option('--run', 'Run the workflow after creating it')
    .option('--input <json>', 'Run input JSON; defaults to template sample input')
    .option('--json', 'Output as JSON')
    .action(async (templateNameRaw: string, opts) => {
      const cfg = loadConfig();
      if (!cfg.initiator) {
        console.error(c.error('No initiator set. Run `agc login` first.'));
        process.exit(1);
      }

      const templateNames = listWorkflowTemplates().map((item) => item.name);
      if (!templateNames.includes(templateNameRaw as WorkflowTemplateName)) {
        console.error(c.error(`Unknown template "${templateNameRaw}".`));
        console.error(c.dim(`Available: ${templateNames.join(', ')}`));
        process.exit(1);
      }

      const templateName = templateNameRaw as WorkflowTemplateName;
      const needsAgent =
        templateName === 'agent-research-summary' ||
        templateName === 'multi-agent-field-report';
      const agentId = opts.agent ?? cfg.defaultAgentId;
      if (needsAgent && !agentId) {
        console.error(c.error('This template requires --agent <agentId> or a configured defaultAgentId.'));
        process.exit(1);
      }

      const prefix =
        opts.prefix ??
        `cli_${templateName.replace(/[^a-z0-9]+/gi, '_')}_${Date.now().toString(36)}`;

      const spinner = spin('Creating workflow template…');
      try {
        let childWorkflowId = opts.childWorkflow;
        let childResult: any | undefined;

        if (templateName === 'workflow-invocation-smoke' && !childWorkflowId) {
          const childCtx: WorkflowTemplateContext = {
            ownerId: cfg.initiator,
            prefix: `${prefix}_child`,
          };
          childResult = await createTemplateWorkflow({
            templateName: 'country-weather-brief',
            ctx: childCtx,
            isPublic: opts.public,
          });
          childWorkflowId = childResult.workflow.workflowId;
        }

        const ctx: WorkflowTemplateContext = {
          ownerId: cfg.initiator,
          prefix,
          agentId,
          reviewerAgentId: opts.reviewerAgent,
          childWorkflowId,
        };

        const result = await createTemplateWorkflow({
          templateName,
          ctx,
          isPublic: opts.public,
        });

        let execution: any | undefined;
        if (opts.run) {
          let inputData = result.template.sampleInput;
          if (opts.input) {
            try {
              inputData = JSON.parse(opts.input);
            } catch {
              throw new Error('--input must be valid JSON');
            }
          }
          execution = await makeClient().workflows.execute(result.workflow.workflowId, {
            agentId,
            inputData,
            userId: cfg.initiator,
          });
        }

        spinner.stop();
        const output = { ...result, child: childResult, execution };
        if (opts.json) return jsonOut(output);

        console.log(`\n${sym.ok} Workflow template created`);
        if (childResult) {
          detail([
            ['Child workflow', c.id(childResult.workflow.workflowId)],
            ['Parent workflow', c.id(result.workflow.workflowId)],
            ['Template', templateName],
          ]);
        } else {
          detail([
            ['Workflow ID', c.id(result.workflow.workflowId)],
            ['Template', templateName],
            ['Tools created', String(result.createdTools.length)],
          ]);
        }

        if (execution) {
          console.log(`\n${sym.ok} Execution started: ${c.id(execution.executionId)}`);
          console.log(`   Status: ${statusBadge(execution.status)}`);
          const resultData = execution.result ?? execution.outputData;
          if (resultData !== undefined) {
            console.log('\n' + c.label('Result'));
            console.log('  ' + JSON.stringify(resultData, null, 2).replace(/\n/g, '\n  '));
          }
        } else {
          console.log(c.dim(`\n  Run it with: agc workflow run ${result.workflow.workflowId} --input '${JSON.stringify(result.template.sampleInput)}'`));
        }
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
          const result = (execution as any).result ?? (execution as any).outputData;
          if (execution.status === 'completed') {
            console.log('\n' + c.label('Result'));
            console.log('  ' + JSON.stringify(result, null, 2));
            const steps = (execution as any).stepResults ?? (execution as any).nodeResults;
            if (steps && Object.keys(steps).length > 0) {
              console.log('\n' + c.label('Step Results'));
              for (const [nodeId, step] of Object.entries(steps) as [string, any][]) {
                const icon = step.status === 'success' ? sym.ok : step.status === 'error' ? sym.fail : '·';
                const dur = step.duration != null ? c.dim(` (${(step.duration / 1000).toFixed(2)}s)`) : '';
                console.log(`  ${icon} ${c.id(nodeId)}${dur}`);
                if (step.error) console.log(`    ${c.error(step.error)}`);
                else if (step.output !== undefined) console.log(`    ${JSON.stringify(step.output, null, 2).replace(/\n/g, '\n    ')}`);
              }
            }
          } else {
            console.log(c.dim(`\n  Workflow is ${execution.status}. Use --watch to stream progress.`));
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
            if (e.outputData != null) {
              console.log('\n' + c.label('Output'));
              console.log('  ' + JSON.stringify(e.outputData, null, 2));
            }
            if (e.nodeResults && Object.keys(e.nodeResults).length > 0) {
              console.log('\n' + c.label('Step Results'));
              for (const [nodeId, step] of Object.entries(e.nodeResults) as [string, any][]) {
                const icon = step.status === 'success' ? sym.ok : step.status === 'error' ? sym.fail : '·';
                const dur = step.duration != null ? c.dim(` (${(step.duration / 1000).toFixed(2)}s)`) : '';
                console.log(`  ${icon} ${c.id(nodeId)}${dur}`);
                if (step.error) console.log(`    ${c.error(step.error)}`);
                else if (step.output !== undefined) console.log(`    ${JSON.stringify(step.output, null, 2).replace(/\n/g, '\n    ')}`);
              }
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
