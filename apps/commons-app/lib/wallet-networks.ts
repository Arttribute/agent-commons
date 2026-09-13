/** Current Arcade payment rails. Mainnet balances stay separate from test funds. */
export const WALLET_NETWORKS = [
  {
    chainId: "84532",
    name: "Base Sepolia",
    symbol: "ETH",
    explorer: "https://sepolia.basescan.org",
    testnet: true,
  },
  {
    chainId: "5042002",
    name: "Arc Testnet",
    symbol: "USDC",
    explorer: "https://testnet.arcscan.app",
    testnet: true,
  },
  {
    chainId: "296",
    name: "Hedera Testnet",
    symbol: "HBAR",
    explorer: "https://hashscan.io/testnet",
    testnet: true,
  },
  {
    chainId: "11142220",
    name: "Celo Sepolia",
    symbol: "CELO",
    explorer: "https://celo-sepolia.blockscout.com",
    testnet: true,
  },
  {
    chainId: "8453",
    name: "Base",
    symbol: "ETH",
    explorer: "https://basescan.org",
    testnet: false,
  },
] as const;
export const walletNetwork = (chainId: string) =>
  WALLET_NETWORKS.find((n) => n.chainId === chainId);
export interface NetworkBalance {
  address: string;
  chainId: string;
  usdc: string;
  native: string;
}
export function parseWalletBalance(
  value: unknown,
  chainId: string,
): NetworkBalance {
  const data =
    value && typeof value === "object" && "data" in value ? value.data : value;
  const balance = data as NetworkBalance | null;
  if (
    !balance ||
    balance.chainId !== chainId ||
    !/^0x[\da-f]{40}$/i.test(balance.address) ||
    ![balance.usdc, balance.native].every(
      (n) => typeof n === "string" && /^\d+(\.\d+)?$/.test(n),
    )
  )
    throw new Error("Balance response did not match this network");
  return balance;
}
export function balanceQuery(chainId: string | null): string {
  if (chainId === null) return "";
  if (!walletNetwork(chainId)) throw new Error("Unsupported wallet network");
  return `?chainId=${chainId}`;
}
