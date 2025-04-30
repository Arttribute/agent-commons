import { getChainConfig } from "../lib/chains.js";

/**
 * Fetch a verified contract's ABI from an Etherscan-like explorer.
 * This will work for Etherscan, Arbiscan, Polygonscan, etc.,
 * as long as the chain config is properly set in /lib/chains.ts.
 */
export async function fetchAbiFromExplorer(
  chainName: string,
  contractAddress: string
): Promise<any> {
  const { explorerApiUrl, explorerApiKey } = getChainConfig(chainName);

  // Common Etherscan-like pattern: ?module=contract&action=getabi
  const url = `${explorerApiUrl}?module=contract&action=getabi&address=${contractAddress}&apikey=${
    explorerApiKey || ""
  }`;

  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Explorer API request failed with status ${resp.status}`);
  }

  const data = (await resp.json()) as { status: string; result: string };
  // "status" = "1" => success on Etherscan-like APIs
  if (data.status !== "1" || !data.result) {
    throw new Error(`Explorer API error: ${JSON.stringify(data)}`);
  }

  // data.result is a JSON string containing the ABI
  const abi = JSON.parse(data.result);
  return abi;
}
