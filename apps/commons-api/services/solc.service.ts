// @ts-ignore
import * as solc from "solc";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Chain } from "viem";
import { publicClient } from "./coinbase.service.js";

/**
 * We dynamically choose the chain, so the constructor takes a Chain object
 */
export class SolcService {
  constructor(private chain: Chain) {}

  public async compile(
    sourceCode: string,
    contractName: string = "MyContract"
  ) {
    const input = {
      language: "Solidity",
      sources: {
        "contract.sol": { content: sourceCode },
      },
      settings: {
        outputSelection: {
          "*": {
            "*": ["abi", "evm.bytecode"],
          },
        },
      },
    };
    const output = JSON.parse(solc.compile(JSON.stringify(input)));
    if (output.errors && output.errors.length > 0) {
      throw new Error(`Solc errors: ${JSON.stringify(output.errors)}`);
    }
    const compiled = output.contracts["contract.sol"][contractName];
    const abi = compiled.abi;
    const bytecode = compiled.evm.bytecode.object;
    return { abi, bytecode };
  }

  public async deploy(
    privateKey: string,
    abi: any,
    bytecode: string,
    constructorArgs: any[] = []
  ) {
    const walletClient = createWalletClient({
      account: privateKeyToAccount(`0x${privateKey}` as `0x${string}`),
      chain: this.chain,
      transport: http(),
    });

    const hash = await walletClient.deployContract({
      abi,
      bytecode: `0x${bytecode}`,
      args: constructorArgs,
    });
    // Wait
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return receipt.contractAddress;
  }
}
