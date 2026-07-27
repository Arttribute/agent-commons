import { Command } from 'commander';
import { readFileSync } from 'fs';
import { basename } from 'path';
import { makeClient } from '../config.js';
import {
  c,
  detail,
  jsonOut,
  printError,
  relativeTime,
  section,
  spin,
  sym,
  table,
} from '../ui.js';

export function libraryCommand(): Command {
  const command = new Command('library')
    .alias('files')
    .description('Upload, find, and manage files in your Commons library');

  command
    .command('list', { isDefault: true })
    .alias('ls')
    .description('List library items')
    .option('--query <text>', 'Search names and descriptions')
    .option('--source <source>', 'Filter by source')
    .option('--session <sessionId>', 'Filter by session')
    .option('--favorites', 'Show favorites only')
    .option('--limit <n>', 'Maximum items', '50')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = spin('Fetching your library…');
      try {
        const result = await makeClient().library.list({
          query: opts.query,
          source: opts.source,
          sessionId: opts.session,
          favorite: opts.favorites ? true : undefined,
          limit: Number(opts.limit),
        });
        spinner.stop();
        if (opts.json) return jsonOut(result);
        section(`Library (${result.data.length})`);
        table(
          result.data.map((item) => ({
            ID: String(item.itemId ?? item.fileId).slice(0, 10) + '…',
            Name: item.name ?? item.originalName ?? '(untitled)',
            Type: item.mimeType ?? '',
            Size:
              typeof item.size === 'number'
                ? `${Math.ceil(item.size / 1024)} KB`
                : '',
            Favorite: item.isFavorite ? '★' : '',
            Created: item.createdAt ? relativeTime(item.createdAt) : '',
          })),
          ['ID', 'Name', 'Type', 'Size', 'Favorite', 'Created'],
        );
      } catch (error) {
        spinner.stop();
        printError(error);
        process.exit(1);
      }
    });

  command
    .command('get <itemId>')
    .description('Show library item details')
    .option('--json', 'Output as JSON')
    .action(async (itemId: string, opts) => {
      const spinner = spin('Fetching library item…');
      try {
        const result = await makeClient().library.get(itemId);
        spinner.stop();
        if (opts.json) return jsonOut(result.data);
        const item = result.data;
        detail([
          ['Item ID', c.id(String(item.itemId ?? item.fileId))],
          ['Name', item.name ?? item.originalName ?? '(untitled)'],
          ['Description', item.description ?? ''],
          ['Type', item.mimeType ?? ''],
          ['Storage', item.storageProvider ?? ''],
          ['Favorite', item.isFavorite ? 'yes' : 'no'],
          ['Created', item.createdAt ? relativeTime(item.createdAt) : ''],
        ]);
      } catch (error) {
        spinner.stop();
        printError(error);
        process.exit(1);
      }
    });

  command
    .command('upload <paths...>')
    .description('Upload one or more local files')
    .option('--agent <agentId>', 'Associate files with an agent')
    .option('--session <sessionId>', 'Associate files with a session')
    .option('--storage <provider>', 'Storage provider: s3 | ipfs')
    .option('--json', 'Output as JSON')
    .action(async (paths: string[], opts) => {
      const spinner = spin(`Uploading ${paths.length} file${paths.length === 1 ? '' : 's'}…`);
      try {
        if (
          opts.storage &&
          opts.storage !== 's3' &&
          opts.storage !== 'ipfs'
        ) {
          throw new Error('--storage must be either s3 or ipfs.');
        }
        const files = paths.map((path) => ({
          data: new Blob([new Uint8Array(readFileSync(path))]),
          name: basename(path),
        }));
        const result = await makeClient().files.upload(files, {
          agentId: opts.agent,
          sessionId: opts.session,
          storageProvider: opts.storage,
        });
        spinner.stop();
        if (opts.json) return jsonOut(result.data);
        console.log(
          `\n${sym.ok} Uploaded ${result.data.length} file${result.data.length === 1 ? '' : 's'}.`,
        );
        for (const file of result.data) {
          console.log(
            `  ${sym.arrow} ${c.bold(file.name ?? file.originalName ?? file.fileId)} ${c.dim(file.fileId)}`,
          );
        }
      } catch (error) {
        spinner.stop();
        printError(error);
        process.exit(1);
      }
    });

  for (const favorite of [true, false]) {
    command
      .command(`${favorite ? 'favorite' : 'unfavorite'} <itemId>`)
      .description(`${favorite ? 'Add' : 'Remove'} a library item ${favorite ? 'to' : 'from'} favorites`)
      .action(async (itemId: string) => {
        const spinner = spin('Updating library item…');
        try {
          await makeClient().library.update(itemId, {
            isFavorite: favorite,
          });
          spinner.stop();
          console.log(
            `${sym.ok} Item ${favorite ? 'added to' : 'removed from'} favorites.`,
          );
        } catch (error) {
          spinner.stop();
          printError(error);
          process.exit(1);
        }
      });
  }

  command
    .command('delete <itemId>')
    .description('Delete a library item')
    .action(async (itemId: string) => {
      const spinner = spin('Deleting library item…');
      try {
        await makeClient().library.delete(itemId);
        spinner.stop();
        console.log(`${sym.ok} Library item deleted.`);
      } catch (error) {
        spinner.stop();
        printError(error);
        process.exit(1);
      }
    });

  return command;
}
