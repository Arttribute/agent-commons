// app/page.tsx
"use client";
import React, { useState, useEffect } from "react";
import { EIP1193Provider, usePrivy, useWallets } from "@privy-io/react-auth"; // or your method of obtaining a provider
import { useChainClients } from "@/hooks/useChainClients";

// Hooks
import { useCommonToken } from "@/hooks/useCommonToken";
import { useAgentRegistry } from "@/hooks/useAgentRegistry";
import { useCommonResource } from "@/hooks/useCommonResource";
import { useAttribution } from "@/hooks/useAttribution";
import { useTaskManager } from "@/hooks/useTaskManager";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  // Example: get EIP-1193 from Privy
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();
  console.log("Wallets from usePrivy:", wallets);
  const [provider, setProvider] = useState<EIP1193Provider | null>(null);

  useEffect(() => {
    if (!wallets || wallets.length === 0) {
      console.log("No wallets available. User may not be signed in.");
      return;
    }
    wallets[0]
      .getEthereumProvider()
      .then((prov) => {
        console.log("Obtained provider:", prov);
        setProvider(prov);
      })
      .catch((err) => {
        console.error("Error getting Ethereum provider:", err);
      });
  }, [wallets]);

  // Once we have `wallets[0]`, ask for the EIP-1193 provider
  useEffect(() => {
    if (!wallets || wallets.length === 0) return;
    wallets[0].getEthereumProvider().then(setProvider).catch(console.error);
    console.log("Got provider:", provider);
    console.log("Wallets:", wallets);
  }, [wallets]);
  useEffect(() => {
    console.log("Got provider:", provider);
    console.log("Wallets:", wallets);
  }, [wallets]);

  // chain clients
  const { publicClient, walletClient } = useChainClients(provider);

  // CommonToken
  const {
    error: tokenError,
    loading: tokenLoading,
    balanceOf,
    transfer,
    mint,
    burn,
  } = useCommonToken(publicClient, walletClient);

  // AgentRegistry
  const {
    error: agentError,
    loading: agentLoading,
    isRegistered,
    registerAgent,
    updateReputation,
  } = useAgentRegistry(publicClient, walletClient);

  // CommonResource
  const {
    error: resourceError,
    loading: resourceLoading,
    createResource,
  } = useCommonResource(publicClient, walletClient);

  // Attribution
  const {
    error: attrError,
    loading: attrLoading,
    recordAttribution,
  } = useAttribution(publicClient, walletClient);

  // TaskManager
  const {
    error: taskError,
    loading: taskLoading,
    createTask,
    joinTask,
  } = useTaskManager(publicClient, walletClient);

  // State for test inputs
  const [balanceAddr, setBalanceAddr] = useState("");
  const [balanceResult, setBalanceResult] = useState<bigint>(0n);

  const [agentAddr, setAgentAddr] = useState("");
  const [agentMeta, setAgentMeta] = useState("");
  const [isCommon, setIsCommon] = useState(false);
  const [isRegResult, setIsRegResult] = useState<boolean | null>(null);

  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState("0.01"); // in ETH => need to parse

  const [buyAmount, setBuyAmount] = useState("0");

  useEffect(() => {
    if (!wallets || wallets.length === 0) {
      return;
    }
    wallets[0].getEthereumProvider().then(setProvider).catch(console.error);
  }, [wallets]);

  const { buyCommonToken, error, loading } = useCommonToken(
    publicClient,
    walletClient
  );

  async function handleBuyCommonToken() {
    if (buyAmount && parseFloat(buyAmount) > 0) {
      await buyCommonToken(buyAmount);
    }
  }

  // ...

  async function handleCheckBalance() {
    if (!balanceAddr) return;
    const bal = await balanceOf(balanceAddr as `0x${string}`);
    setBalanceResult(bal);
  }

  async function handleRegisterAgent() {
    await registerAgent(
      "0xD9303DFc71728f209EF64DD1AD97F5a557AE0Fab" as `0x${string}`,
      agentMeta,
      isCommon
    );
  }

  async function handleCheckRegistered() {
    const res = await isRegistered(agentAddr as `0x${string}`);
    setIsRegResult(res);
  }

  async function handleTransfer() {
    // parse as Ether => bigint in Wei
    const amountWei = parseFloat(transferAmount) * 1e18;
    await transfer(transferTo as `0x${string}`, BigInt(Math.floor(amountWei)));
  }

  async function handleMint() {
    // mint to self or some address
    const amountWei = 1_000_000_000_000_000_000n; // 1 COMMON if decimals=18
    await mint(balanceAddr as `0x${string}`, amountWei);
  }

  async function handleBurn() {
    // burn from the same address
    const amountWei = 500_000_000_000_000_000n; // 0.5 COMMON
    await burn(balanceAddr as `0x${string}`, amountWei);
  }

  return (
    <main style={{ padding: 20 }}>
      <h1>Agent Commons + viem Test UI</h1>
      <p>
        <strong>Privy ready:</strong> {ready ? "Yes" : "No"},{" "}
        <strong>authenticated:</strong> {authenticated ? "Yes" : "No"}
      </p>
      <p>
        {" "}
        <strong>user address:</strong>{" "}
        {wallets.length > 0 ? wallets[0].address : "No address"}
      </p>
      {provider ? <p>Got EIP-1193 provider!</p> : <p>No provider yet</p>}

      <hr />
      <section>
        <h2>CommonToken Tests</h2>
        {tokenError && <p style={{ color: "red" }}>Error: {tokenError}</p>}

        <div>
          <label>BalanceOf address: </label>
          <input
            value={balanceAddr}
            onChange={(e) => setBalanceAddr(e.target.value)}
            placeholder="0x..."
            style={{ width: 220, marginRight: 12 }}
          />
          <button onClick={handleCheckBalance} disabled={tokenLoading}>
            Check Balance
          </button>
          <span style={{ marginLeft: 12 }}>
            Balance: {balanceResult.toString()} (wei)
          </span>
        </div>

        <div style={{ marginTop: 12 }}>
          <button onClick={handleMint} disabled={tokenLoading}>
            Mint 1 COMMON
          </button>
          <button
            onClick={handleBurn}
            disabled={tokenLoading}
            style={{ marginLeft: 8 }}
          >
            Burn 0.5 COMMON
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          <label>Transfer to: </label>
          <input
            value={transferTo}
            onChange={(e) => setTransferTo(e.target.value)}
            placeholder="0x..."
            style={{ width: 200, marginRight: 12 }}
          />
          <label>Amount (in ETH units): </label>
          <input
            value={transferAmount}
            onChange={(e) => setTransferAmount(e.target.value)}
            style={{ width: 80, marginRight: 12 }}
          />
          <button onClick={handleTransfer} disabled={tokenLoading}>
            Transfer
          </button>
        </div>
      </section>

      <div style={{ padding: 20 }}>
        <h1>Buy COMMON$ Token</h1>
        <p>
          <strong>Privy ready:</strong> {ready ? "Yes" : "No"},{" "}
          <strong>authenticated:</strong> {authenticated ? "Yes" : "No"}
        </p>
        <p>
          <strong>User address:</strong>{" "}
          {wallets.length > 0 ? wallets[0].address : "No address"}
        </p>
        {provider ? <p>Got EIP-1193 provider!</p> : <p>No provider yet</p>}

        <hr />
        <section>
          <h2>Buy COMMON$ Token</h2>
          {error && <p style={{ color: "red" }}>Error: {error}</p>}
          <div>
            <label>Amount of COMMON$ to Buy: </label>
            <input
              type="number"
              value={buyAmount}
              onChange={(e) => setBuyAmount(e.target.value)}
              style={{ width: 100, marginRight: 12 }}
            />
            <button
              onClick={handleBuyCommonToken}
              disabled={loading || !buyAmount || parseFloat(buyAmount) <= 0}
            >
              {loading ? "Processing..." : "Buy COMMON$"}
            </button>
          </div>
        </section>
      </div>

      <hr />
      <section>
        <h2>AgentRegistry Tests</h2>
        {agentError && <p style={{ color: "red" }}>Error: {agentError}</p>}

        <div>
          <label>Agent Addr: </label>
          <input
            value={agentAddr}
            onChange={(e) => setAgentAddr(e.target.value)}
            placeholder="0x..."
            style={{ width: 220 }}
          />
        </div>
        <div>
          <label>Metadata: </label>
          <input
            value={agentMeta}
            onChange={(e) => setAgentMeta(e.target.value)}
            style={{ width: 200 }}
          />
        </div>
        <div>
          <label>IsCommonAgent?: </label>
          <input
            type="checkbox"
            checked={isCommon}
            onChange={() => setIsCommon(!isCommon)}
          />
        </div>
        <button onClick={handleRegisterAgent} disabled={agentLoading}>
          RegisterAgent
        </button>
        <button
          onClick={handleCheckRegistered}
          disabled={agentLoading}
          style={{ marginLeft: 8 }}
        >
          Check Registered
        </button>
        {isRegResult !== null && (
          <span style={{ marginLeft: 10 }}>
            Result: {isRegResult ? "Yes" : "No"}
          </span>
        )}

        <div style={{ marginTop: 12 }}>
          <button
            onClick={async () => {
              // example: +10 rep
              await updateReputation(agentAddr as `0x${string}`, 10n);
            }}
            disabled={agentLoading}
          >
            Update Reputation (+10)
          </button>
        </div>
      </section>

      <hr />
      <section>
        <h2>CommonResource Tests</h2>
        {resourceError && (
          <p style={{ color: "red" }}>Error: {resourceError}</p>
        )}
        <Button
          onClick={async () => {
            await createResource(
              "0xD9303DFc71728f209EF64DD1AD97F5a557AE0Fab".toLocaleLowerCase() as `0x${string}`,
              "sample metadata",
              "ipfs://QmSomeResourceFile",
              5n,
              1000000000000000000n, // 1 token usage cost
              [
                "0xD9303DFc71728f209EF64DD1AD97F5a557AE0Fab".toLocaleLowerCase() as `0x${string}`,
              ],
              [100n],
              false
            );
          }}
          disabled={resourceLoading}
        >
          Create Resource
        </Button>
      </section>

      <hr />
      <section>
        <h2>Attribution Tests</h2>
        {attrError && <p style={{ color: "red" }}>Error: {attrError}</p>}
        <button
          onClick={async () => {
            // resourceId=101, parents=[99,100], relation=[0,2], desc=[...]
            await recordAttribution(
              101n,
              [99n, 100n],
              [0, 2],
              ["Derived from 99", "Uses 100"]
            );
          }}
          disabled={attrLoading}
        >
          RecordAttribution
        </button>
      </section>

      <hr />
      <section>
        <h2>TaskManager Tests</h2>
        {taskError && <p style={{ color: "red" }}>Error: {taskError}</p>}
        <button
          onClick={async () => {
            // createTask("MyTask", reward=1 ETH, resourceBased=false, parentTask=0, maxPart=10)
            await createTask(
              "My new test task",
              1000000000000000000n,
              false,
              0n,
              10n
            );
          }}
          disabled={taskLoading}
        >
          Create Task
        </button>

        <button
          onClick={async () => {
            await joinTask(1n); // join task #1
          }}
          disabled={taskLoading}
          style={{ marginLeft: 12 }}
        >
          Join Task #1
        </button>
      </section>
    </main>
  );
}
