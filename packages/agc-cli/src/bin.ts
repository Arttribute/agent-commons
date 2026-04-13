import { Command } from 'commander';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { spawn } from 'child_process';
import { loginCommand, logoutCommand, whoamiCommand, configCommand } from './commands/login.js';
import { agentsCommand } from './commands/agents.js';
import { sessionsCommand } from './commands/sessions.js';
import { toolsCommand } from './commands/tools.js';
import { workflowCommand } from './commands/workflow.js';
import { taskCommand } from './commands/task.js';
import { runCommand } from './commands/run.js';
import { chatCommand } from './commands/chat.js';
import { mcpCommand } from './commands/mcp.js';
import { skillsCommand } from './commands/skills.js';
import { walletCommand } from './commands/wallet.js';
import { modelsCommand } from './commands/models.js';
import { memoryCommand } from './commands/memory.js';
import { usageCommand } from './commands/usage.js';
import { logsCommand } from './commands/logs.js';
import { banner, select, spin, c, sym } from './ui.js';
import { loadConfig, saveConfig, makeClient } from './config.js';

const CONFIG_FILE = join(homedir(), '.agc', 'config.json');

// ── Interactive top-level menu ────────────────────────────────────────────────

async function interactiveMenu(): Promise<void> {
  banner();

  const cfg = loadConfig();
  const isSetup = !!(cfg.apiKey && cfg.initiator);

  // First-run: guide user through login
  if (!isSetup) {
    console.log(c.bold('  Welcome to Agent Commons CLI!'));
    console.log(c.dim('  Looks like this is your first time here — let\'s get you set up.\n'));
    console.log(`  ${sym.arrow} Running ${c.bold('agc login')} to configure your credentials…\n`);
    runSubcommand(['login']);
    return;
  }

  // Show connection context
  console.log(
    `  ${c.dim('Connected to')}  ${c.primary(cfg.apiUrl)}  ${c.dim('·')}  ` +
    `${c.dim('Wallet')} ${c.id(cfg.initiator!.slice(0, 8) + '…' + cfg.initiator!.slice(-4))}\n`,
  );

  type MenuAction =
    | 'chat' | 'run' | 'sessions' | 'agents'
    | 'tasks' | 'workflows' | 'mcp' | 'skills'
    | 'wallet' | 'usage' | 'logs' | 'config' | 'exit';

  const action = await select<MenuAction>('What would you like to do?', [
    { label: 'Chat with an agent',         value: 'chat',      hint: 'agc chat' },
    { label: 'Run an agent (one-shot)',    value: 'run',       hint: 'agc run'  },
    { label: 'View sessions',              value: 'sessions',  hint: 'agc sessions list' },
    { label: 'Manage agents',              value: 'agents',    hint: 'agc agents list'   },
    { label: 'Tasks',                      value: 'tasks',     hint: 'agc task list'     },
    { label: 'Workflows',                  value: 'workflows', hint: 'agc workflow list' },
    { label: 'MCP servers',                value: 'mcp',       hint: 'agc mcp list'      },
    { label: 'Skills',                     value: 'skills',    hint: 'agc skills list'   },
    { label: 'Wallet & balance',           value: 'wallet',    hint: 'agc wallet balance'},
    { label: 'Usage & cost',               value: 'usage',     hint: 'agc usage'         },
    { label: 'Logs',                       value: 'logs',      hint: 'agc logs'          },
    { label: 'Config & credentials',       value: 'config',    hint: 'agc config get'    },
    { label: 'Exit',                       value: 'exit'                                 },
  ]);

  if (action === 'exit') {
    process.exit(0);
  }

  const commandMap: Record<MenuAction, string[]> = {
    chat:      cfg.defaultAgentId ? ['chat', '--agent', cfg.defaultAgentId] : ['chat', '--agent'],
    run:       cfg.defaultAgentId ? ['run', '--agent', cfg.defaultAgentId, '--message'] : ['run', '--agent'],
    sessions:  ['sessions', 'list'],
    agents:    ['agents', 'list'],
    tasks:     ['task', 'list'],
    workflows: ['workflow', 'list'],
    mcp:       ['mcp', 'list'],
    skills:    ['skills', 'list'],
    wallet:    ['wallet', 'balance'],
    usage:     ['usage'],
    logs:      ['logs'],
    config:    ['config', 'get'],
    exit:      [],
  };

  // For commands that need an agent ID, pick one interactively if no default is set
  if ((action === 'chat' || action === 'run') && !cfg.defaultAgentId) {
    const pickedId = await pickAgentInteractively(action);
    if (!pickedId) return;
    runSubcommand([action, '--agent', pickedId]);
    return;
  }

  runSubcommand(commandMap[action]);
}

function runSubcommand(args: string[]): void {
  const child = spawn(process.argv[0], [process.argv[1], ...args], {
    stdio: 'inherit',
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}

/**
 * Fetch agents and show an interactive picker. Returns the chosen agent ID,
 * or null if the user cancels or no agents are accessible.
 * If no agents exist yet, guides the user to create one.
 */
async function pickAgentInteractively(action: 'chat' | 'run'): Promise<string | null> {
  const cfg = loadConfig();
  const spinner = spin('Fetching your agents…');

  let agents: any[] = [];
  try {
    const client = makeClient();
    const res = await client.agents.list(cfg.initiator);
    agents = (res as any)?.data ?? (Array.isArray(res) ? res : []);
    spinner.stop();
  } catch {
    spinner.stop();
    console.log(`\n  ${c.warn('⚠')}  Could not fetch agents. Check your API key and connection.\n`);
    return null;
  }

  if (agents.length === 0) {
    console.log(`\n  ${c.warn('⚠')}  You don't have any agents yet.\n`);
    const choice = await select<'create' | 'cancel'>('What would you like to do?', [
      { label: 'Create a new agent now', value: 'create', hint: 'agc agents create' },
      { label: 'Go back',                value: 'cancel' },
    ]);
    if (choice === 'create') {
      runSubcommand(['agents', 'create']);
    }
    return null;
  }

  console.log();
  const agentId = await select<string>(
    `Choose an agent to ${action} with:`,
    agents.map((a: any) => ({
      label: a.name,
      value: a.agentId,
      hint: `${a.modelProvider}/${a.modelId}`,
    })),
  );

  // Offer to save as default so they don't have to pick every time
  const saveDefault = await select<boolean>('Set as your default agent?', [
    { label: 'Yes — remember this agent for next time', value: true },
    { label: 'No — just this once',                     value: false },
  ]);

  if (saveDefault) {
    saveConfig({ defaultAgentId: agentId });
    const chosen = agents.find((a: any) => a.agentId === agentId);
    console.log(`  ${sym.ok} ${c.dim('Default agent set to')} ${c.bold(chosen?.name ?? agentId)}\n`);
  }

  return agentId;
}

// ── Program setup ─────────────────────────────────────────────────────────────

const program = new Command();

program
  .name('agc')
  .description('Agent Commons CLI — interact with the Agent Commons platform')
  .version('0.1.4', '-v, --version')
  // When invoked with no subcommand, show the interactive menu
  .action(async () => {
    await interactiveMenu();
  });

// Auth & config
program.addCommand(loginCommand());
program.addCommand(logoutCommand());
program.addCommand(whoamiCommand());
program.addCommand(configCommand());

// Core resources
program.addCommand(agentsCommand());
program.addCommand(sessionsCommand());
program.addCommand(toolsCommand());

// Workflows
program.addCommand(workflowCommand());

// Tasks
program.addCommand(taskCommand());

// Convenience run / chat
program.addCommand(runCommand());
program.addCommand(chatCommand());

// MCP
program.addCommand(mcpCommand());

// Skills
program.addCommand(skillsCommand());

// Wallets
program.addCommand(walletCommand());

// Models
program.addCommand(modelsCommand());

// Memory
program.addCommand(memoryCommand());

// Usage & Logs (observability)
program.addCommand(usageCommand());
program.addCommand(logsCommand());

// Unknown command hint
program.on('command:*', () => {
  console.error(
    `\n  ${c.error('Unknown command:')} ${program.args.join(' ')}\n` +
    `  Run ${c.bold('agc --help')} to see available commands, or just ${c.bold('agc')} for the interactive menu.\n`,
  );
  process.exit(1);
});

program.parse(process.argv);
