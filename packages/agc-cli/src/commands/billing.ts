import { Command } from 'commander';
import { makeClient } from '../config.js';
import { c, section, detail, spin, jsonOut, openBrowser } from '../ui.js';

export function creditsCommand(): Command {
  const cmd = new Command('credits').description('View your credit balance and ledger');

  cmd
    .command('balance', { isDefault: true })
    .description('Show your current credit balance')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = spin('Fetching balance…');
      try {
        const client = makeClient();
        const res: any = await client.credits.balance();
        spinner.stop();
        if (opts.json) return jsonOut(res.data);
        section('Credits');
        detail([['Balance', String(res?.data?.balance ?? 0)]]);
      } catch (e: any) {
        spinner.stop();
        console.error(c.error(e.message));
        process.exit(1);
      }
    });

  cmd
    .command('ledger')
    .description('Show recent credit ledger entries')
    .option('--limit <n>', 'Max entries', '20')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = spin('Fetching ledger…');
      try {
        const client = makeClient();
        const res: any = await client.credits.ledger({ limit: Number(opts.limit) });
        spinner.stop();
        const rows = res?.data ?? [];
        if (opts.json) return jsonOut(rows);
        section('Credit ledger');
        for (const e of rows) {
          const sign = e.amount >= 0 ? '+' : '';
          console.log(
            `${c.dim(new Date(e.createdAt).toLocaleString())}  ${sign}${e.amount}  ${e.description || e.eventType}`,
          );
        }
        if (!rows.length) console.log(c.dim('No entries.'));
      } catch (e: any) {
        spinner.stop();
        console.error(c.error(e.message));
        process.exit(1);
      }
    });

  return cmd;
}

export function billingCommand(): Command {
  const cmd = new Command('billing').description('Manage your subscription and top-ups');

  cmd
    .command('status', { isDefault: true })
    .description('Show your current plan and entitlements')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = spin('Fetching plan…');
      try {
        const client = makeClient();
        const res: any = await client.billing.subscription();
        spinner.stop();
        if (opts.json) return jsonOut(res.data);
        const d = res.data;
        section('Subscription');
        detail([
          ['Plan', `${d.planName} (${d.planKey})`],
          ['Status', d.status],
          ['Monthly credits', String(d.monthlyCredits)],
          ['Computer use', d.entitlements?.computerUse ? 'yes' : 'no'],
          [
            'Renews',
            d.currentPeriodEnd
              ? new Date(d.currentPeriodEnd).toLocaleDateString()
              : undefined,
          ],
        ]);
      } catch (e: any) {
        spinner.stop();
        console.error(c.error(e.message));
        process.exit(1);
      }
    });

  cmd
    .command('upgrade <plan>')
    .description('Start a checkout to upgrade (plus | pro | max)')
    .action(async (plan: string) => {
      try {
        const client = makeClient();
        const res: any = await client.billing.subscribe(plan as any);
        const url = res?.data?.url;
        if (!url) {
          console.error(c.error('Could not create checkout session'));
          process.exit(1);
        }
        console.log(c.dim('Opening checkout in your browser:'));
        console.log(url);
        await openBrowser(url);
      } catch (e: any) {
        console.error(c.error(e.message));
        process.exit(1);
      }
    });

  cmd
    .command('topup <pack>')
    .description('Buy a one-time credit pack (small | medium | large)')
    .action(async (pack: string) => {
      try {
        const client = makeClient();
        const res: any = await client.billing.topup(pack);
        const url = res?.data?.url;
        if (!url) {
          console.error(c.error('Could not create checkout session'));
          process.exit(1);
        }
        console.log(url);
        await openBrowser(url);
      } catch (e: any) {
        console.error(c.error(e.message));
        process.exit(1);
      }
    });

  return cmd;
}
