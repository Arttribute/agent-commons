import { Command } from 'commander';
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

async function resolveProject(projectId?: string) {
  const projects = (await makeClient().developer.listProjects()).data;
  const project = projectId
    ? projects.find((candidate) => candidate.id === projectId)
    : projects[0];
  if (!project) {
    throw new Error(
      projectId
        ? `Developer project "${projectId}" was not found.`
        : 'No developer project exists. Create one with `agc keys projects create --name <name>`.',
    );
  }
  return project;
}

export function apiKeysCommand(): Command {
  const command = new Command('keys')
    .alias('api-keys')
    .description('Create and manage project-scoped developer API keys');

  command
    .command('list', { isDefault: true })
    .alias('ls')
    .description('List API keys for a developer project')
    .option('--project <projectId>', 'Developer project ID (defaults to newest)')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = spin('Fetching developer keys…');
      try {
        const project = await resolveProject(opts.project);
        const result = await makeClient().developer.listApiKeys(project.id);
        spinner.stop();
        if (opts.json) {
          return jsonOut({ project, keys: result.data });
        }
        section(`${project.name} · API keys (${result.data.length})`);
        table(
          result.data.map((key) => ({
            ID: key.id.slice(0, 10) + '…',
            Name: key.name,
            Prefix: key.keyPrefix,
            Status: key.status,
            Scopes: String(key.scopes.length),
            Expires: key.expiresAt
              ? new Date(key.expiresAt).toLocaleDateString()
              : 'never',
            Used: key.lastUsedAt
              ? new Date(key.lastUsedAt).toLocaleDateString()
              : 'never',
          })),
          ['ID', 'Name', 'Prefix', 'Status', 'Scopes', 'Expires', 'Used'],
        );
      } catch (error) {
        spinner.stop();
        printError(error);
        process.exit(1);
      }
    });

  command
    .command('create')
    .description('Create a project-scoped API key')
    .requiredOption('--name <name>', 'Key name')
    .option('--project <projectId>', 'Developer project ID (defaults to newest)')
    .option('--scopes <scopes>', 'Comma-separated scopes (defaults to all project scopes)')
    .option('--expires <iso>', 'Expiration timestamp in ISO 8601 format')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = spin('Creating developer key…');
      try {
        const project = await resolveProject(opts.project);
        const scopes = opts.scopes
          ? String(opts.scopes)
              .split(',')
              .map((scope) => scope.trim())
              .filter(Boolean)
          : undefined;
        const result = await makeClient().developer.createApiKey(project.id, {
          name: opts.name,
          scopes,
          expiresAt: opts.expires,
        });
        spinner.stop();
        if (opts.json) return jsonOut(result.data);
        console.log(`\n${sym.ok} ${c.success('Developer API key created')}`);
        detail([
          ['Project', project.name],
          ['Name', result.data.name],
          ['Scopes', result.data.scopes.join(', ')],
          ['Expires', result.data.expiresAt ?? 'never'],
        ]);
        console.log(
          `\n  ${c.warn('Copy this key now. It will not be shown again.')}`,
        );
        console.log(`\n  ${c.bold(result.data.key)}\n`);
      } catch (error) {
        spinner.stop();
        printError(error);
        process.exit(1);
      }
    });

  command
    .command('revoke <keyId>')
    .description('Revoke a developer API key')
    .action(async (keyId: string) => {
      const spinner = spin('Revoking developer key…');
      try {
        await makeClient().developer.revokeApiKey(keyId);
        spinner.stop();
        console.log(`${sym.ok} Developer API key revoked.`);
      } catch (error) {
        spinner.stop();
        printError(error);
        process.exit(1);
      }
    });

  command
    .command('scopes')
    .description('List supported developer API scopes')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = spin('Fetching API scopes…');
      try {
        const result = await makeClient().developer.scopes();
        spinner.stop();
        if (opts.json) return jsonOut(result.data);
        section('Developer API scopes');
        for (const scope of result.data) {
          console.log(`  ${sym.bullet} ${scope}`);
        }
      } catch (error) {
        spinner.stop();
        printError(error);
        process.exit(1);
      }
    });

  const projects = command
    .command('projects')
    .description('Manage developer projects');

  projects
    .command('list', { isDefault: true })
    .alias('ls')
    .description('List developer projects')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = spin('Fetching developer projects…');
      try {
        const result = await makeClient().developer.listProjects();
        spinner.stop();
        if (opts.json) return jsonOut(result.data);
        section(`Developer projects (${result.data.length})`);
        table(
          result.data.map((project) => ({
            ID: project.id,
            Name: project.name,
            Environment: project.environment,
            Status: project.status,
          })),
          ['ID', 'Name', 'Environment', 'Status'],
        );
      } catch (error) {
        spinner.stop();
        printError(error);
        process.exit(1);
      }
    });

  projects
    .command('create')
    .description('Create a developer project')
    .requiredOption('--name <name>', 'Project name')
    .option(
      '--environment <environment>',
      'production | development | staging',
      'development',
    )
    .option('--workspace <workspaceId>', 'Workspace ID (defaults to signed-in workspace)')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const workspaceId = opts.workspace ?? loadConfig().workspaceId;
      if (!workspaceId) {
        throw new Error(
          'No workspace is configured. Pass --workspace or sign in again.',
        );
      }
      if (!['production', 'development', 'staging'].includes(opts.environment)) {
        throw new Error(
          '--environment must be production, development, or staging.',
        );
      }
      const spinner = spin('Creating developer project…');
      try {
        const result = await makeClient().developer.createProject({
          workspaceId,
          name: opts.name,
          environment: opts.environment,
        });
        spinner.stop();
        if (opts.json) return jsonOut(result.data);
        console.log(`\n${sym.ok} Developer project created.`);
        detail([
          ['Project ID', c.id(result.data.id)],
          ['Name', result.data.name],
          ['Environment', result.data.environment],
        ]);
      } catch (error) {
        spinner.stop();
        printError(error);
        process.exit(1);
      }
    });

  return command;
}
