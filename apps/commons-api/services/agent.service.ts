import { eq } from "drizzle-orm";
import { database as db } from "./database.service.js";
import { agent } from "../models/schema.js";
import { HTTPException } from "hono/http-exception";
import { Wallet } from "@coinbase/coinbase-sdk";
import type { WalletData } from "@coinbase/coinbase-sdk";
import { createWalletClient, http } from "viem";
import crypto from "crypto";
import { HDKey } from "@scure/bip32";
import { privateKeyToAccount } from "viem/accounts";
import { getChainByName } from "../lib/chains.js";
import { parseUnits } from "viem";
import { publicClient } from "./coinbase.service.js";
import { COMMON_TOKEN_ADDRESS } from "../lib/addresses.js";
import { baseSepolia } from "../lib/baseSepolia.js";

function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export class AgentService {
  public seedToPrivateKey(seed: string) {
    const seedBuffer = Buffer.from(seed, "hex");
    const hmac = crypto.createHmac("sha512", "Bitcoin seed");
    hmac.update(seedBuffer);

    const node = HDKey.fromMasterSeed(seedBuffer);
    const childNode = node.derive("m/44'/60'/0'/0/0"); // Standard Ethereum path
    const privateKey = Buffer.from(childNode.privateKey!).toString("hex");
    return privateKey;
  }

  public async createAgent(opts: {
    name: string;
    owner: string;
    isLiaison: boolean;
  }) {
    // 1) Create a new MPC wallet for the user-chosen network
    const { name, owner } = opts;
    const isLiaison = opts.isLiaison || false;

    // Create with coinbase sdk
    const wallet = await Wallet.create();
    // Possibly faucet if testnet
    const faucetTx = await wallet.faucet();
    await faucetTx.wait();
    // If it’s Ethereum mainnet or any other chain, skip faucet

    const agentId = (await wallet.getDefaultAddress())?.getId().toLowerCase();

    let liaisonKey: string | undefined;
    let liaisonKeyHash: string | undefined;
    let liaisonKeyDisplay: string | undefined;
    if (isLiaison) {
      liaisonKey = crypto.randomBytes(32).toString("hex");
      liaisonKeyHash = hashKey(liaisonKey);
      liaisonKeyDisplay = `slk-${liaisonKey.slice(0, 14)}...${liaisonKey.slice(
        -14
      )}`;
    }

    const inserted = await db
      .insert(agent)
      .values({
        agentId,
        wallet: wallet.export() as WalletData,
        owner,
        name,
        isLiaison,
        liaisonKeyHash,
        liaisonKeyDisplay,
      })
      .returning();
    if (!inserted[0]) {
      throw new HTTPException(500, { message: "Failed to insert agent" });
    }

    return { agent: inserted[0], liaisonKey };
  }

  public async getAgent(agentId: string) {
    const row = await db.query.agent.findFirst({
      where: (tbl) => eq(tbl.agentId, agentId),
    });
    if (!row) {
      throw new HTTPException(404, { message: "Agent not found" });
    }
    return row;
  }

  public async getAgents() {
    return db.query.agent.findMany();
  }

  public async purchaseCommons(props: {
    agentId: string;
    amountInCommon: string;
  }) {
    const row = await this.getAgent(props.agentId);
    const wallet = await Wallet.import(row.wallet);

    // parse
    const amountInWei = BigInt(parseUnits(props.amountInCommon, 18));
    const pk = await this.seedToPrivateKey(row.wallet.seed);

    // dynamically pick chain
    // const chain = getChainByName(row.network || "base");
    const walletClient = createWalletClient({
      account: privateKeyToAccount(`0x${pk}` as `0x${string}`),
      chain: baseSepolia,
      transport: http(),
    });

    const txHash = await walletClient.sendTransaction({
      to: COMMON_TOKEN_ADDRESS as `0x${string}`,
      value: amountInWei,
      chain: undefined,
    });
    await publicClient.waitForTransactionReceipt({ hash: txHash });
  }

  public async checkCommonsBalance(agentId: string) {
    const row = await this.getAgent(agentId);
    const wallet = await Wallet.import(row.wallet);
    const balance = await wallet.getBalance(COMMON_TOKEN_ADDRESS);
    return balance.toNumber();
  }
}

export const agentService = new AgentService();
