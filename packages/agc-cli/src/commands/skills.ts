import { Command } from 'commander';
import { loadConfig, makeClient } from '../config.js';
import { c, sym, table, detail, section, spin, printError, jsonOut } from '../ui.js';

export function skillsCommand(): Command {
  const cmd = new Command('skills').description('Discover and manage skills');

  // ── list ────────────────────────────────────────────────────────────────────
  cmd
    .command('list')
    .description('List available skills')
    .option('--owner <id>', 'Filter by owner ID')
    .option('--platform', 'Show platform-only skills')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = spin('Fetching skills…');
      try {
        const client = makeClient();
        const filter: any = {};
        if (opts.owner) filter.ownerId = opts.owner;
        if (opts.platform) filter.ownerType = 'platform';
        const res = await client.skills.list(filter);
        const skills = (res as any)?.data ?? res ?? [];
        spinner.stop();
        if (opts.json) return jsonOut(skills);
        section(`Skills (${skills.length})`);
        table(
          skills.map((s: any) => ({
            Slug:        s.slug ?? '',
            Name:        s.name ?? '',
            Description: (s.description ?? '').slice(0, 55),
            Tags:        (s.tags ?? []).join(', '),
            Source:      s.source ?? '',
          })),
          ['Slug', 'Name', 'Description', 'Tags', 'Source'],
        );
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── index ───────────────────────────────────────────────────────────────────
  cmd
    .command('index')
    .description('Show compact skill index (progressive disclosure view)')
    .option('--owner <id>', 'Filter by owner ID')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = spin('Fetching skill index…');
      try {
        const client = makeClient();
        const res = await client.skills.getIndex(opts.owner);
        const index = (res as any)?.data ?? res ?? [];
        spinner.stop();
        if (opts.json) return jsonOut(index);
        section(`Skill Index (${index.length})`);
        table(
          index.map((s: any) => ({
            'Icon': s.icon ?? ' ',
            'Slug': s.slug ?? '',
            'Name': s.name ?? '',
            'Description': (s.description ?? '').slice(0, 55),
            'Triggers': (s.triggers ?? []).slice(0, 3).join(', '),
          })),
          ['Icon', 'Slug', 'Name', 'Description', 'Triggers'],
        );
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── get ─────────────────────────────────────────────────────────────────────
  cmd
    .command('get <skillId>')
    .description('Show full skill details and instructions')
    .option('--json', 'Output as JSON')
    .action(async (skillId: string, opts) => {
      const spinner = spin('Fetching skill…');
      try {
        const client = makeClient();
        const res = await client.skills.get(skillId);
        const skill = (res as any)?.data ?? res;
        spinner.stop();
        if (!skill) { console.error(c.error(`Skill "${skillId}" not found.`)); process.exit(1); }
        if (opts.json) return jsonOut(skill);

        section(skill.name);
        detail([
          ['Skill ID',    c.id(skill.skillId)],
          ['Slug',        skill.slug],
          ['Description', skill.description ?? c.dim('(none)')],
          ['Tags',        (skill.tags ?? []).join(', ') || c.dim('(none)')],
          ['Tools',       (skill.tools ?? []).join(', ') || c.dim('(none)')],
          ['Source',      skill.source ?? c.dim('(none)')],
          ['Version',     skill.version ?? '1.0.0'],
          ['Public',      skill.isPublic ? 'yes' : 'no'],
          ['Usage',       String(skill.usageCount ?? 0)],
        ]);
        if (skill.instructions) {
          console.log('\n  ' + c.label('Instructions'));
          const lines = skill.instructions.split('\n');
          for (const line of lines) {
            console.log('  ' + c.dim(line));
          }
        }
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── create ───────────────────────────────────────────────────────────────────
  cmd
    .command('create')
    .description('Create a new skill')
    .requiredOption('--slug <slug>', 'Unique slug identifier')
    .requiredOption('--name <name>', 'Display name')
    .requiredOption('--description <desc>', 'Short description')
    .requiredOption('--instructions <text>', 'Full skill instructions (markdown)')
    .option('--tools <tools>', 'Comma-separated tool names')
    .option('--triggers <triggers>', 'Comma-separated trigger phrases')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--icon <icon>', 'Emoji icon')
    .option('--public', 'Make skill publicly discoverable')
    .option('--json', 'Output result as JSON')
    .action(async (opts) => {
      const cfg = loadConfig();
      const spinner = spin('Creating skill…');
      try {
        const client = makeClient();
        const res = await client.skills.create({
          slug: opts.slug,
          name: opts.name,
          description: opts.description,
          instructions: opts.instructions,
          tools: opts.tools ? opts.tools.split(',').map((t: string) => t.trim()) : [],
          triggers: opts.triggers ? opts.triggers.split(',').map((t: string) => t.trim()) : [],
          tags: opts.tags ? opts.tags.split(',').map((t: string) => t.trim()) : [],
          icon: opts.icon,
          isPublic: !!opts.public,
          ownerId: cfg.initiator,
          ownerType: 'user',
          source: 'user',
        });
        const skill = (res as any)?.data ?? res;
        spinner.stop();
        if (opts.json) return jsonOut(skill);
        console.log(`${sym.ok} Skill ${c.id(skill.skillId)} created`);
        detail([
          ['Slug', skill.slug],
          ['Name', skill.name],
        ]);
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── install ──────────────────────────────────────────────────────────────────
  cmd
    .command('install <slug>')
    .description('Install a skill by slug (fetch full instructions and print as SKILL.md)')
    .action(async (slug: string) => {
      const spinner = spin('Loading skill…');
      try {
        const client = makeClient();
        const res = await client.skills.get(slug);
        const skill = (res as any)?.data ?? res;
        spinner.stop();
        if (!skill) { console.error(c.error(`Skill "${slug}" not found.`)); process.exit(1); }

        // Print SKILL.md format to stdout — user can redirect to a file
        const md = [
          `# SKILL: ${skill.name}`,
          ``,
          `**Slug:** ${skill.slug}`,
          `**Version:** ${skill.version ?? '1.0.0'}`,
          `**Tags:** ${(skill.tags ?? []).join(', ')}`,
          `**Tools:** ${(skill.tools ?? []).join(', ') || 'none'}`,
          ``,
          `## Description`,
          ``,
          skill.description,
          ``,
          `## Instructions`,
          ``,
          skill.instructions,
        ].join('\n');

        console.log(md);
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── publish ───────────────────────────────────────────────────────────────
  cmd
    .command('publish <slug>')
    .description('Make a skill publicly discoverable')
    .option('--json', 'Output result as JSON')
    .action(async (slug: string, opts) => {
      const spinner = spin(`Publishing skill "${slug}"…`);
      try {
        const client = makeClient();
        const res = await client.skills.update(slug, { isPublic: true });
        const skill = (res as any)?.data ?? res;
        spinner.stop();
        if (opts.json) return jsonOut(skill);
        console.log(`${sym.ok} Skill ${c.id(skill.slug)} is now ${c.success('public')}`);
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── unpublish ──────────────────────────────────────────────────────────────
  cmd
    .command('unpublish <slug>')
    .description('Make a skill private (remove from public marketplace)')
    .option('--json', 'Output result as JSON')
    .action(async (slug: string, opts) => {
      const spinner = spin(`Unpublishing skill "${slug}"…`);
      try {
        const client = makeClient();
        const res = await client.skills.update(slug, { isPublic: false });
        const skill = (res as any)?.data ?? res;
        spinner.stop();
        if (opts.json) return jsonOut(skill);
        console.log(`${sym.ok} Skill ${c.id(skill.slug)} is now ${c.warn('private')}`);
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── update ────────────────────────────────────────────────────────────────
  cmd
    .command('update <slug>')
    .description('Update skill properties')
    .option('--name <name>', 'New display name')
    .option('--description <desc>', 'New description')
    .option('--instructions <text>', 'New instructions (markdown)')
    .option('--tools <tools>', 'Comma-separated tool names (replaces existing)')
    .option('--triggers <triggers>', 'Comma-separated trigger phrases (replaces existing)')
    .option('--tags <tags>', 'Comma-separated tags (replaces existing)')
    .option('--icon <icon>', 'Emoji icon')
    .option('--json', 'Output result as JSON')
    .action(async (slug: string, opts) => {
      const updates: Record<string, any> = {};
      if (opts.name)         updates.name         = opts.name;
      if (opts.description)  updates.description  = opts.description;
      if (opts.instructions) updates.instructions = opts.instructions;
      if (opts.tools)        updates.tools        = opts.tools.split(',').map((t: string) => t.trim());
      if (opts.triggers)     updates.triggers     = opts.triggers.split(',').map((t: string) => t.trim());
      if (opts.tags)         updates.tags         = opts.tags.split(',').map((t: string) => t.trim());
      if (opts.icon)         updates.icon         = opts.icon;

      if (Object.keys(updates).length === 0) {
        console.error(c.warn('No fields to update. Use --name, --description, --instructions, etc.'));
        process.exit(1);
      }

      const spinner = spin(`Updating skill "${slug}"…`);
      try {
        const client = makeClient();
        const res = await client.skills.update(slug, updates);
        const skill = (res as any)?.data ?? res;
        spinner.stop();
        if (opts.json) return jsonOut(skill);
        console.log(`${sym.ok} Skill ${c.id(skill.slug)} updated`);
        detail([
          ['Name',        skill.name],
          ['Description', skill.description ?? c.dim('(none)')],
          ['Public',      skill.isPublic ? c.success('yes') : c.warn('no')],
          ['Tags',        (skill.tags ?? []).join(', ') || c.dim('(none)')],
        ]);
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── delete ────────────────────────────────────────────────────────────────
  cmd
    .command('delete <slug>')
    .description('Permanently delete a skill')
    .option('--yes', 'Skip confirmation prompt')
    .option('--json', 'Output result as JSON')
    .action(async (slug: string, opts) => {
      if (!opts.yes) {
        // Simple inline confirmation without an extra dependency
        const readline = await import('readline');
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const answer = await new Promise<string>((resolve) =>
          rl.question(c.warn(`Delete skill "${slug}"? This cannot be undone. [y/N] `), resolve),
        );
        rl.close();
        if (!['y', 'yes'].includes(answer.trim().toLowerCase())) {
          console.log(c.dim('Aborted.'));
          return;
        }
      }

      const spinner = spin(`Deleting skill "${slug}"…`);
      try {
        const client = makeClient();
        const res = await client.skills.delete(slug);
        spinner.stop();
        if (opts.json) return jsonOut(res);
        console.log(`${sym.ok} Skill ${c.id(slug)} deleted`);
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  return cmd;
}
