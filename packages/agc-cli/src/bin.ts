import { Command } from 'commander';
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

const program = new Command();

program
  .name('agc')
  .description('Agent Commons CLI — interact with the Agent Commons platform')
  .version('0.1.0', '-v, --version');

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
  console.error(`Unknown command: ${program.args.join(' ')}\nRun \`agc --help\` to see available commands.`);
  process.exit(1);
});

program.parse(process.argv);
