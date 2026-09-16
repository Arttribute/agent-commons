import { Command } from 'commander';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';
import { loadConfig, makeClient } from '../config.js';
import {
  c,
  detail,
  jsonOut,
  printError,
  section,
  spin,
  sym,
  table,
} from '../ui.js';

function agentId(value?: string): string {
  const resolved = value ?? loadConfig().defaultAgentId;
  if (!resolved) {
    throw new Error(
      'Specify --agent <agentId> or set a default with `agc config set defaultAgentId <id>`.',
    );
  }
  return resolved;
}

const SOURCE_EXTENSIONS = /\.(html|css|js|mjs|cjs|ts|tsx|jsx|json|svg|md|txt)$/i;

/** Game source under `root`, as Arcade project files. Skips dependencies and dotfiles. */
function readGameDirectory(root: string): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = [];
  const walk = (directory: string) => {
    for (const name of readdirSync(directory)) {
      if (name.startsWith('.') || name === 'node_modules' || name === 'dist') continue;
      const full = join(directory, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (SOURCE_EXTENSIONS.test(name)) {
        files.push({
          path: relative(root, full).split(sep).join('/'),
          content: readFileSync(full, 'utf8'),
        });
      }
    }
  };
  walk(root);
  if (!files.length) throw new Error(`No game source files found in ${root}.`);
  return files;
}

async function run<T>(label: string, work: () => Promise<T>): Promise<T> {
  const spinner = spin(label);
  try {
    const result = await work();
    spinner.stop();
    return result;
  } catch (error) {
    spinner.stop();
    printError(error);
    process.exit(1);
  }
}

export function arcadeCommand(): Command {
  const command = new Command('arcade').description(
    "Build, test, and publish Common Arcade games in your agent owner's account",
  );

  command
    .command('status')
    .description('Check whether this platform is connected to Common Arcade')
    .option('--agent <agentId>', 'Agent ID')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const result = await run('Checking Arcade connection…', () =>
        makeClient().arcade.status(agentId(opts.agent)),
      );
      if (opts.json) return jsonOut(result.data);
      console.log(
        result.data.connected
          ? `${sym.ok} Connected to Common Arcade.`
          : `${sym.fail} Common Arcade is not connected on this deployment.`,
      );
    });

  command
    .command('list', { isDefault: true })
    .alias('ls')
    .description('List Arcade game projects')
    .option('--agent <agentId>', 'Agent ID')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const result = await run('Fetching Arcade projects…', () =>
        makeClient().arcade.list(agentId(opts.agent)),
      );
      if (opts.json) return jsonOut(result.data);
      section(`Arcade projects (${result.data.length})`);
      table(
        result.data.map((project) => ({
          ID: project.projectId,
          Title: project.title ?? '',
          Published: project.isPublished ? 'yes' : 'no',
          Studio: project.studioUrl,
        })),
        ['ID', 'Title', 'Published', 'Studio'],
      );
    });

  command
    .command('get <projectId>')
    .description('Show an Arcade game project')
    .option('--agent <agentId>', 'Agent ID')
    .option('--json', 'Output as JSON')
    .action(async (projectId: string, opts) => {
      const result = await run('Fetching Arcade project…', () =>
        makeClient().arcade.get(agentId(opts.agent), projectId),
      );
      if (opts.json) return jsonOut(result.data);
      const project = result.data;
      section(project.title ?? project.projectId);
      detail([
        ['Project ID', c.id(project.projectId)],
        ['Revision', String(project.revision)],
        ['Files', project.document.files.map((file) => file.path).join(', ')],
        ['Published', project.isPublished ? 'yes' : 'no'],
        ['Thumbnail', project.hasThumbnail ? 'yes' : 'no'],
        ['Studio', project.studioUrl],
      ]);
    });

  command
    .command('create')
    .description('Create an Arcade game project')
    .requiredOption('--title <title>', 'Game title')
    .option('--description <text>', 'How to play')
    .option('--agent <agentId>', 'Agent ID')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const result = await run('Creating Arcade project…', () =>
        makeClient().arcade.create(agentId(opts.agent), {
          title: opts.title,
          description: opts.description,
        }),
      );
      if (opts.json) return jsonOut(result.data);
      console.log(`\n${sym.ok} Arcade project created.`);
      detail([
        ['Project ID', c.id(result.data.projectId)],
        ['Studio', result.data.studioUrl],
      ]);
    });

  command
    .command('push <projectId> <directory>')
    .description('Upload a local game directory to an Arcade project')
    .option('--agent <agentId>', 'Agent ID')
    .option('--entry <file>', 'HTML entry file (default: index.html)')
    .option('--runtime <file>', 'Authoritative rules file, required to publish')
    .option('--thumbnail <url>', 'HTTPS thumbnail URL, required to publish')
    .option('--replace', 'Remove project files that are not in the directory')
    .option('--json', 'Output as JSON')
    .action(async (projectId: string, directory: string, opts) => {
      const files = readGameDirectory(directory);
      const result = await run(`Uploading ${files.length} files…`, () =>
        makeClient().arcade.write(agentId(opts.agent), projectId, {
          files,
          replaceFiles: Boolean(opts.replace),
          entryFile: opts.entry,
          thumbnail: opts.thumbnail,
          runtime: opts.runtime ? { entryFile: opts.runtime } : undefined,
        }),
      );
      if (opts.json) return jsonOut(result.data);
      console.log(`${sym.ok} Saved revision ${result.data.revision}.`);
      detail([['Studio', result.data.studioUrl]]);
    });

  command
    .command('test <projectId>')
    .description("Run Arcade's validation and runtime harness")
    .option('--agent <agentId>', 'Agent ID')
    .option('--steps <n>', 'Steps to simulate', (value) => Number(value))
    .option('--seed <seed>', 'Deterministic seed')
    .action(async (projectId: string, opts) => {
      const result = await run('Testing game…', () =>
        makeClient().arcade.test(agentId(opts.agent), projectId, {
          steps: opts.steps,
          seed: opts.seed,
        }),
      );
      jsonOut(result.data);
    });

  command
    .command('publish <projectId>')
    .description('Publish an Arcade game as an immutable release')
    .option('--agent <agentId>', 'Agent ID')
    .option('--json', 'Output as JSON')
    .action(async (projectId: string, opts) => {
      const result = await run('Publishing game…', () =>
        makeClient().arcade.publish(agentId(opts.agent), projectId),
      );
      if (opts.json) return jsonOut(result.data);
      console.log(`\n${sym.ok} Game published.`);
      detail([
        ['Release', result.data.releaseId],
        ['Play', result.data.gameUrl],
        ['Studio', result.data.studioUrl],
      ]);
    });

  return command;
}
