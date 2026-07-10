import { Command } from 'commander';
import type {
  AgentComputer,
  ComputerResizeParams,
  ComputerResourceMode,
  ComputerResourceProfile,
} from '@agent-commons/sdk';
import { loadConfig, makeClient } from '../config.js';
import {
  c,
  sym,
  detail,
  jsonOut,
  printError,
  relativeTime,
  section,
  spin,
  statusBadge,
  table,
} from '../ui.js';

const RESOURCE_PROFILES: ComputerResourceProfile[] = [
  'starter',
  'standard',
  'performance',
  'gpu',
];
const RESOURCE_MODES: ComputerResourceMode[] = ['fixed', 'elastic'];

function resolveAgentId(opts: { agent?: string }): string {
  const agentId = opts.agent ?? loadConfig().defaultAgentId;
  if (!agentId) {
    throw new Error(
      'Specify --agent <agentId> or set defaultAgentId with `agc config set defaultAgentId <id>`.',
    );
  }
  return agentId;
}

function unwrap<T>(response: { data?: T } | T): T {
  return ((response as { data?: T })?.data ?? response) as T;
}

function displayComputer(computer: AgentComputer | null): void {
  if (!computer) {
    section('Persistent cloud computer');
    detail([
      ['Status', statusBadge('disabled')],
      ['Persistence', 'persistent'],
      ['Computer ID', c.dim('(not provisioned)')],
    ]);
    console.log(c.dim('  Enable it with: agc computer enable --agent <agentId>'));
    return;
  }
  const wire = computer as AgentComputer & Record<string, any>;
  const resources = computer.resources ?? {};
  const gpu = resources.gpu ?? (
    wire.gpuCount
      ? { count: wire.gpuCount, type: wire.gpuType }
      : null
  );
  const cpu = resources.vcpu ?? wire.cpuRequest ?? wire.cpuLimit;
  const memory = resources.memoryGiB != null
    ? `${resources.memoryGiB} GiB`
    : wire.memoryRequest ?? wire.memoryLimit;
  const storage = resources.storageGiB != null
    ? `${resources.storageGiB} GiB`
    : wire.storageLimit;

  section('Persistent cloud computer');
  detail([
    ['Computer ID', computer.computerId ? c.id(computer.computerId) : c.dim('(not provisioned)')],
    ['Enabled', computer.enabled === false ? 'no' : c.success('yes')],
    ['Status', statusBadge(computer.status ?? 'disabled')],
    ['Desired state', computer.desiredState ?? c.dim('n/a')],
    ['Persistence', computer.persistence ?? wire.lifecycle ?? 'persistent'],
    ['Profile', computer.resourceProfile ?? c.dim('n/a')],
    ['Mode', computer.resourceMode ?? c.dim('n/a')],
    ['CPU', cpu != null ? String(cpu) : c.dim('n/a')],
    ['Memory', memory != null ? String(memory) : c.dim('n/a')],
    ['Storage', storage != null ? String(storage) : c.dim('n/a')],
    ['GPU', gpu?.count ? `${gpu.count} × ${gpu.type ?? 'provider default'}` : 'none'],
    ['Region', computer.region ?? c.dim('automatic')],
    ['Workspace', computer.workspaceRoot ?? c.dim('not mounted')],
    ['Last activity', computer.lastActivityAt ? relativeTime(computer.lastActivityAt) : c.dim('never')],
    ['Error', computer.errorMessage ?? undefined],
  ]);
}

function parseNumber(value: string | undefined, name: string, options?: { integer?: boolean; allowZero?: boolean }): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  const minimum = options?.allowZero ? 0 : Number.MIN_VALUE;
  if (!Number.isFinite(parsed) || parsed < minimum || (options?.integer && !Number.isInteger(parsed))) {
    const qualifier = options?.integer ? 'whole number' : 'number';
    throw new Error(`${name} must be a ${options?.allowZero ? 'non-negative' : 'positive'} ${qualifier}.`);
  }
  return parsed;
}

async function changeEnabled(agentId: string, enabled: boolean, json: boolean): Promise<void> {
  const spinner = spin(`${enabled ? 'Enabling' : 'Disabling'} persistent cloud computer…`);
  try {
    const response = await makeClient().agents.updateComputerConfig(agentId, { enabled });
    const config = unwrap(response);
    spinner.stop();
    if (json) return jsonOut(config);
    console.log(`\n${sym.ok} Persistent cloud computer ${enabled ? 'enabled' : 'disabled'} for agent ${c.id(agentId)}`);
    if (enabled) {
      console.log(c.dim(`  Wake it now with: agc computer wake --agent ${agentId}`));
    }
  } catch (error) {
    spinner.stop();
    printError(error);
    process.exitCode = 1;
  }
}

async function lifecycleAction(
  action: 'wake' | 'sleep' | 'restart',
  agentId: string,
  reason: string | undefined,
  json: boolean,
): Promise<void> {
  const verb = action === 'wake' ? 'Waking' : action === 'sleep' ? 'Sleeping' : 'Restarting';
  const spinner = spin(`${verb} persistent cloud computer…`);
  try {
    const client = makeClient();
    const response = action === 'wake'
      ? await client.agents.wakeComputer(agentId, reason ? { reason } : undefined)
      : action === 'sleep'
        ? await client.agents.sleepComputer(agentId, reason ? { reason } : undefined)
        : await client.agents.restartComputer(agentId, reason ? { reason } : undefined);
    const computer = unwrap(response);
    spinner.stop();
    if (json) return jsonOut(computer);
    console.log(`\n${sym.ok} Persistent cloud computer ${action === 'sleep' ? 'is sleeping' : action === 'wake' ? 'is awake' : 'restarted'}`);
    displayComputer(computer);
  } catch (error) {
    spinner.stop();
    printError(error);
    process.exitCode = 1;
  }
}

function addAgentOption(command: Command): Command {
  return command.option('--agent <agentId>', 'Agent ID (defaults to configured agent)');
}

export function computerCommand(): Command {
  const command = new Command('computer')
    .description("Manage an agent's one persistent cloud computer");

  addAgentOption(command.command('status').description('Show persistent cloud computer status'))
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      let agentId: string;
      try {
        agentId = resolveAgentId(opts);
      } catch (error) {
        printError(error);
        process.exitCode = 1;
        return;
      }
      const spinner = spin('Fetching persistent cloud computer…');
      try {
        const computer = unwrap(await makeClient().agents.getComputer(agentId));
        spinner.stop();
        if (opts.json) return jsonOut(computer);
        displayComputer(computer);
      } catch (error) {
        spinner.stop();
        printError(error);
        process.exitCode = 1;
      }
    });

  addAgentOption(command.command('enable').description('Enable a persistent cloud computer for an agent'))
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      try {
        await changeEnabled(resolveAgentId(opts), true, !!opts.json);
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  addAgentOption(command.command('disable').description('Disable the agent cloud computer'))
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      try {
        await changeEnabled(resolveAgentId(opts), false, !!opts.json);
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  for (const action of ['wake', 'sleep', 'restart'] as const) {
    const descriptions = {
      wake: 'Wake the persistent cloud computer',
      sleep: 'Sleep compute while preserving the persistent workspace',
      restart: 'Restart the runtime while preserving the persistent workspace',
    };
    addAgentOption(command.command(action).description(descriptions[action]))
      .option('--reason <text>', `Reason for the ${action}`)
      .option('--json', 'Output as JSON')
      .action(async (opts) => {
        try {
          await lifecycleAction(action, resolveAgentId(opts), opts.reason, !!opts.json);
        } catch (error) {
          printError(error);
          process.exitCode = 1;
        }
      });
  }

  addAgentOption(command.command('resize').description('Resize the persistent cloud computer'))
    .option('--profile <profile>', `Resource profile: ${RESOURCE_PROFILES.join(' | ')}`)
    .option('--mode <mode>', `Resource mode: ${RESOURCE_MODES.join(' | ')}`)
    .option('--vcpu <count>', 'Requested virtual CPU count')
    .option('--cpu <count>', 'Alias for --vcpu')
    .option('--memory <gib>', 'Requested memory in GiB')
    .option('--storage <gib>', 'Requested persistent storage in GiB')
    .option('--gpu-type <type>', 'GPU type, such as nvidia-h100')
    .option('--gpu-count <count>', 'GPU count (0 removes GPU allocation)')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      let agentId: string;
      let resize: ComputerResizeParams;
      try {
        agentId = resolveAgentId(opts);
        if (opts.profile && !RESOURCE_PROFILES.includes(opts.profile)) {
          throw new Error(`--profile must be one of: ${RESOURCE_PROFILES.join(', ')}.`);
        }
        if (opts.mode && !RESOURCE_MODES.includes(opts.mode)) {
          throw new Error(`--mode must be one of: ${RESOURCE_MODES.join(', ')}.`);
        }
        if (opts.vcpu !== undefined && opts.cpu !== undefined) {
          throw new Error('Use either --vcpu or --cpu, not both.');
        }
        const vcpu = parseNumber(opts.vcpu ?? opts.cpu, 'CPU');
        const memoryGiB = parseNumber(opts.memory, 'Memory');
        const storageGiB = parseNumber(opts.storage, 'Storage');
        const gpuCount = parseNumber(opts.gpuCount, 'GPU count', { integer: true, allowZero: true });
        const resources = {
          ...(vcpu !== undefined && { vcpu }),
          ...(memoryGiB !== undefined && { memoryGiB }),
          ...(storageGiB !== undefined && { storageGiB }),
          ...((gpuCount !== undefined || opts.gpuType) && {
            gpu: { count: gpuCount ?? 1, ...(opts.gpuType && { type: opts.gpuType }) },
          }),
        };
        resize = {
          ...(opts.profile && { resourceProfile: opts.profile as ComputerResourceProfile }),
          ...(opts.mode && { resourceMode: opts.mode as ComputerResourceMode }),
          ...(Object.keys(resources).length > 0 && { resources }),
        };
        if (Object.keys(resize).length === 0) {
          throw new Error('Specify --profile, --mode, or at least one resource value.');
        }
      } catch (error) {
        printError(error);
        process.exitCode = 1;
        return;
      }

      const spinner = spin('Resizing persistent cloud computer…');
      try {
        const computer = unwrap(await makeClient().agents.resizeComputer(agentId, resize));
        spinner.stop();
        if (opts.json) return jsonOut(computer);
        console.log(`\n${sym.ok} Persistent cloud computer resize requested`);
        displayComputer(computer);
      } catch (error) {
        spinner.stop();
        printError(error);
        process.exitCode = 1;
      }
    });

  addAgentOption(
    command.command('exec')
      .description('Run a command in the persistent cloud computer')
      .argument('<command...>', 'Command and arguments to run'),
  )
    .option('--cwd <path>', 'Working directory')
    .option('--timeout <seconds>', 'Command timeout in seconds', '120')
    .option('--json', 'Output as JSON')
    .action(async (commandParts: string[], opts) => {
      let agentId: string;
      let timeoutSeconds: number | undefined;
      try {
        agentId = resolveAgentId(opts);
        timeoutSeconds = parseNumber(opts.timeout, 'Timeout');
      } catch (error) {
        printError(error);
        process.exitCode = 1;
        return;
      }
      const spinner = spin('Running command in persistent cloud computer…');
      try {
        const result = unwrap(await makeClient().agents.execComputer(agentId, {
          command: commandParts.join(' '),
          ...(opts.cwd && { cwd: opts.cwd }),
          ...(timeoutSeconds !== undefined && { timeoutSeconds }),
        }));
        spinner.stop();
        if (opts.json) return jsonOut(result);
        const stdout = result?.stdout ?? result?.output ?? result?.result ?? '';
        const stderr = result?.stderr ?? '';
        if (stdout) process.stdout.write(String(stdout).replace(/\n?$/, '\n'));
        if (stderr) process.stderr.write(c.error(String(stderr).replace(/\n?$/, '\n')));
        const exitCode = result?.exitCode ?? result?.exit_code;
        if (exitCode !== undefined && exitCode !== 0) process.exitCode = Number(exitCode);
      } catch (error) {
        spinner.stop();
        printError(error);
        process.exitCode = 1;
      }
    });

  addAgentOption(command.command('events').description('List recent persistent cloud computer events'))
    .option('--limit <count>', 'Maximum events', '50')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      let agentId: string;
      let limit: number | undefined;
      try {
        agentId = resolveAgentId(opts);
        limit = parseNumber(opts.limit, 'Limit', { integer: true });
      } catch (error) {
        printError(error);
        process.exitCode = 1;
        return;
      }
      const spinner = spin('Fetching persistent cloud computer events…');
      try {
        const events = unwrap(await makeClient().agents.listComputerEvents(agentId, limit));
        spinner.stop();
        if (opts.json) return jsonOut(events);
        section(`Cloud computer events (${events.length})`);
        table(
          events.map((event: any) => ({
            Event: event.eventType ?? '',
            Summary: event.summary ?? '',
            Actor: event.actorType ?? '',
            When: event.createdAt ? relativeTime(event.createdAt) : '',
          })),
          ['Event', 'Summary', 'Actor', 'When'],
        );
      } catch (error) {
        spinner.stop();
        printError(error);
        process.exitCode = 1;
      }
    });

  return command;
}
