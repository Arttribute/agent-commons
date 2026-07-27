import { Command } from 'commander';
import { readFileSync } from 'fs';
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

function projectFiles(path?: string): Array<{ path: string; content: string }> | undefined {
  if (!path) return undefined;
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  const files = Array.isArray(parsed) ? parsed : parsed.files;
  if (!Array.isArray(files)) {
    throw new Error('The files document must be an array or an object with a files array.');
  }
  return files;
}

export function projectsCommand(): Command {
  const command = new Command('projects')
    .alias('project')
    .description('Build, publish, and export agent code projects');

  command
    .command('list', { isDefault: true })
    .alias('ls')
    .description('List projects for an agent')
    .option('--agent <agentId>', 'Agent ID')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = spin('Fetching projects…');
      try {
        const result = await makeClient().projects.list(agentId(opts.agent));
        spinner.stop();
        if (opts.json) return jsonOut(result.data);
        section(`Projects (${result.data.length})`);
        table(
          result.data.map((project) => ({
            ID: project.projectId.slice(0, 10) + '…',
            Name: project.name,
            Files: String(project.files?.length ?? ''),
            Preview: project.previewUrl ?? project.previewSlug ?? '',
            Updated: project.updatedAt ?? '',
          })),
          ['ID', 'Name', 'Files', 'Preview', 'Updated'],
        );
      } catch (error) {
        spinner.stop();
        printError(error);
        process.exit(1);
      }
    });

  command
    .command('get <projectId>')
    .description('Show a code project')
    .option('--agent <agentId>', 'Agent ID')
    .option('--json', 'Output as JSON')
    .action(async (projectId: string, opts) => {
      const spinner = spin('Fetching project…');
      try {
        const result = await makeClient().projects.get(
          agentId(opts.agent),
          projectId,
        );
        spinner.stop();
        if (opts.json) return jsonOut(result.data);
        const project = result.data;
        section(project.name);
        detail([
          ['Project ID', c.id(project.projectId)],
          ['Agent ID', project.agentId],
          ['Description', project.description ?? ''],
          ['Files', String(project.files?.length ?? 0)],
          ['Preview', project.previewUrl ?? project.previewSlug ?? ''],
          ['Updated', project.updatedAt ?? ''],
        ]);
      } catch (error) {
        spinner.stop();
        printError(error);
        process.exit(1);
      }
    });

  command
    .command('create')
    .description('Create a code project')
    .requiredOption('--name <name>', 'Project name')
    .option('--description <text>', 'Project description')
    .option('--agent <agentId>', 'Agent ID')
    .option('--session <sessionId>', 'Associated session')
    .option('--files <json>', 'JSON file containing [{ path, content }]')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = spin('Creating project…');
      try {
        const result = await makeClient().projects.create(
          agentId(opts.agent),
          {
            name: opts.name,
            description: opts.description,
            sessionId: opts.session,
            files: projectFiles(opts.files),
          },
        );
        spinner.stop();
        if (opts.json) return jsonOut(result.data);
        console.log(`\n${sym.ok} Project created.`);
        detail([
          ['Project ID', c.id(result.data.projectId)],
          ['Name', result.data.name],
        ]);
      } catch (error) {
        spinner.stop();
        printError(error);
        process.exit(1);
      }
    });

  command
    .command('write <projectId> <json>')
    .description('Write project files from a JSON document')
    .option('--agent <agentId>', 'Agent ID')
    .option('--replace', 'Replace all existing files')
    .option('--json', 'Output as JSON')
    .action(async (projectId: string, json: string, opts) => {
      const spinner = spin('Writing project files…');
      try {
        const result = await makeClient().projects.writeFiles(
          agentId(opts.agent),
          projectId,
          projectFiles(json) ?? [],
          Boolean(opts.replace),
        );
        spinner.stop();
        if (opts.json) return jsonOut(result.data);
        console.log(`${sym.ok} Project files updated.`);
      } catch (error) {
        spinner.stop();
        printError(error);
        process.exit(1);
      }
    });

  command
    .command('publish <projectId>')
    .description('Build and publish a project preview')
    .option('--agent <agentId>', 'Agent ID')
    .option('--json', 'Output as JSON')
    .action(async (projectId: string, opts) => {
      const spinner = spin('Building and publishing project…');
      try {
        const result = await makeClient().projects.publish(
          agentId(opts.agent),
          projectId,
        );
        spinner.stop();
        if (opts.json) return jsonOut(result.data);
        console.log(`\n${sym.ok} Project published.`);
        jsonOut(result.data);
      } catch (error) {
        spinner.stop();
        printError(error);
        process.exit(1);
      }
    });

  command
    .command('export <projectId>')
    .description('Export a project to the agent computer')
    .option('--agent <agentId>', 'Agent ID')
    .option('--directory <path>', 'Destination directory')
    .option('--session <sessionId>', 'Associated session')
    .option('--json', 'Output as JSON')
    .action(async (projectId: string, opts) => {
      const spinner = spin('Exporting project…');
      try {
        const result = await makeClient().projects.exportToComputer(
          agentId(opts.agent),
          projectId,
          { directory: opts.directory, sessionId: opts.session },
        );
        spinner.stop();
        if (opts.json) return jsonOut(result.data);
        console.log(`${sym.ok} Project exported to the agent computer.`);
        jsonOut(result.data);
      } catch (error) {
        spinner.stop();
        printError(error);
        process.exit(1);
      }
    });

  command
    .command('github <projectId>')
    .description('Export a project to a GitHub repository')
    .option('--agent <agentId>', 'Agent ID')
    .option('--repository <name>', 'Repository name')
    .option('--public', 'Create a public repository')
    .option('--json', 'Output as JSON')
    .action(async (projectId: string, opts) => {
      const spinner = spin('Exporting project to GitHub…');
      try {
        const result = await makeClient().projects.exportToGitHub(
          agentId(opts.agent),
          projectId,
          {
            repositoryName: opts.repository,
            private: !opts.public,
          },
        );
        spinner.stop();
        if (opts.json) return jsonOut(result.data);
        console.log(`${sym.ok} Project exported to GitHub.`);
        jsonOut(result.data);
      } catch (error) {
        spinner.stop();
        printError(error);
        process.exit(1);
      }
    });

  return command;
}
