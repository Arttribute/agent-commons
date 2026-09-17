import { formatUnits } from 'viem';
import type { WalletActivityDto, WalletActivityItem } from '../dto/wallet.dto';
import { walletChain } from './chains';

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

interface BlockscoutAddress {
  hash: string;
}

interface BlockscoutTokenTransfer {
  transaction_hash: string;
  timestamp: string | null;
  method: string | null;
  from: BlockscoutAddress;
  to: BlockscoutAddress | null;
  token: { address_hash: string; symbol: string | null };
  total: { value: string; decimals: string | null } | null;
}

interface BlockscoutTransaction {
  hash: string;
  timestamp: string | null;
  method: string | null;
  status: 'ok' | 'error' | null;
  value: string;
  from: BlockscoutAddress;
  to: BlockscoutAddress | null;
}

const PAGE_LIMIT = 50;

/**
 * Read the most recent USDC transfers and native transactions for an address
 * from the network's Blockscout index. Token transfers win over the
 * transaction that carried them so a USDC send is listed once, as USDC.
 */
export async function readWalletActivity(
  address: string,
  chainId: string,
  fetcher: Fetcher = fetch,
): Promise<WalletActivityDto> {
  const network = walletChain(chainId);
  const result: WalletActivityDto = {
    address,
    chainId: String(network.chain.id),
    supported: Boolean(network.activityApi),
    items: [],
  };
  if (!network.activityApi) return result;

  const base = `${network.activityApi}/addresses/${address}`;
  const [transfers, transactions] = await Promise.all([
    readItems<BlockscoutTokenTransfer>(
      fetcher,
      `${base}/token-transfers?type=ERC-20&token=${network.token}`,
    ),
    readItems<BlockscoutTransaction>(fetcher, `${base}/transactions`),
  ]);

  const self = address.toLowerCase();
  const direction = (from: string, to?: string | null) => {
    const outgoing = from.toLowerCase() === self;
    const incoming = to?.toLowerCase() === self;
    return outgoing && incoming ? 'self' : outgoing ? 'out' : 'in';
  };
  const statusOf = (tx?: BlockscoutTransaction) =>
    tx?.status === 'error'
      ? 'failed'
      : tx && !tx.timestamp
        ? 'pending'
        : 'success';

  const byHash = new Map(transactions.map((tx) => [tx.hash.toLowerCase(), tx]));
  const tokenHashes = new Set<string>();
  const items: WalletActivityItem[] = [];

  for (const transfer of transfers) {
    if (
      transfer.token.address_hash.toLowerCase() !== network.token.toLowerCase()
    )
      continue;
    const hash = transfer.transaction_hash.toLowerCase();
    tokenHashes.add(hash);
    items.push({
      hash: transfer.transaction_hash,
      chainId: result.chainId,
      kind: 'token',
      direction: direction(transfer.from.hash, transfer.to?.hash),
      asset: 'USDC',
      amount: formatUnits(
        BigInt(transfer.total?.value ?? '0'),
        Number(transfer.total?.decimals ?? 6),
      ),
      from: transfer.from.hash,
      to: transfer.to?.hash ?? null,
      timestamp: transfer.timestamp,
      status: statusOf(byHash.get(hash)),
      method: transfer.method,
    });
  }

  for (const tx of transactions) {
    if (tokenHashes.has(tx.hash.toLowerCase())) continue;
    const value = BigInt(tx.value || '0');
    const outgoing = tx.from.hash.toLowerCase() === self;
    // Zero-value incoming calls are someone else's contract interaction.
    if (value === 0n && !outgoing) continue;
    items.push({
      hash: tx.hash,
      chainId: result.chainId,
      kind: value === 0n ? 'call' : 'native',
      direction: direction(tx.from.hash, tx.to?.hash),
      asset: network.chain.nativeCurrency.symbol,
      amount: formatUnits(value, network.chain.nativeCurrency.decimals),
      from: tx.from.hash,
      to: tx.to?.hash ?? null,
      timestamp: tx.timestamp,
      status: statusOf(tx),
      method: tx.method,
    });
  }

  result.items = items
    .sort(
      (a, b) =>
        (b.timestamp ? Date.parse(b.timestamp) : Number.MAX_SAFE_INTEGER) -
        (a.timestamp ? Date.parse(a.timestamp) : Number.MAX_SAFE_INTEGER),
    )
    .slice(0, PAGE_LIMIT);
  return result;
}

async function readItems<T>(fetcher: Fetcher, url: string): Promise<T[]> {
  const response = await fetcher(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  // Blockscout answers 404 for addresses it has never seen on chain.
  if (response.status === 404) return [];
  if (!response.ok)
    throw new Error(`Activity index returned ${response.status}`);
  const payload = (await response.json()) as { items?: T[] };
  return Array.isArray(payload?.items) ? payload.items : [];
}
