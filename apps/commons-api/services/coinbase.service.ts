import { Coinbase, Wallet } from "@coinbase/coinbase-sdk";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "../lib/baseSepolia.js";

export const coinbase = Coinbase.configure({
  apiKeyName: process.env.COINBASE_API_KEY_NAME!,
  privateKey: process.env.COINBASE_API_KEY_SECRET!.replace(/\\n/g, "\n"),
});

export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});
