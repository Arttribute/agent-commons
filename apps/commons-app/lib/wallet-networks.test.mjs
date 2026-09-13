import assert from "node:assert/strict";
import test from "node:test";
import {
  WALLET_NETWORKS,
  parseWalletBalance,
  balanceQuery,
} from "./wallet-networks.ts";
test("all four testnets retain distinct balance queries and native symbols", () => {
  assert.deepEqual(
    WALLET_NETWORKS.filter((n) => n.testnet).map((n) => n.symbol),
    ["ETH", "USDC", "HBAR", "CELO"],
  );
  for (const network of WALLET_NETWORKS)
    assert.equal(balanceQuery(network.chainId), `?chainId=${network.chainId}`);
  assert.equal(balanceQuery(null), "");
  assert.throws(() => balanceQuery("1"));
});
test("balance API uses native/usdc and never invents zero for invalid or wrong-chain responses", () => {
  const value = {
    address: "0x" + "1".repeat(40),
    chainId: "296",
    usdc: "0.000001",
    native: "2.5",
  };
  assert.deepEqual(parseWalletBalance(value, "296"), value);
  assert.deepEqual(parseWalletBalance({ data: value }, "296"), value);
  for (const bad of [
    { ...value, chainId: "84532" },
    { error: "RPC failed" },
    { nativeBalance: "0", usdcBalance: "0" },
    null,
  ])
    assert.throws(() => parseWalletBalance(bad, "296"));
});
