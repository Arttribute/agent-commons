"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useChainClients } from "@/hooks/useChainClients"; // or however you get your viem clients
import { useCommonToken } from "@/hooks/useCommonToken";
import { EIP1193Provider, useWallets } from "@privy-io/react-auth"; // or your method of obtaining a provider

interface AddToAgentBalanceProps {
  agentAddress: `0x${string}`;
  onFundSuccess?: () => void; // callback to refresh parent UI
}

/**
 * Dialog that lets the current logged-in user fund an agent with Common$.
 */
export function AddToAgentBalance({
  agentAddress,
  onFundSuccess,
}: AddToAgentBalanceProps) {
  const [open, setOpen] = useState(false);
  const [commonsAmount, setCommonsAmount] = useState("1");
  const [provider, setProvider] = useState<EIP1193Provider | null>(null);
  const { wallets } = useWallets();
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

  // chain clients
  const { publicClient, walletClient } = useChainClients(provider);

  const { balanceOf, transfer, buyCommonToken, loading, error } =
    useCommonToken(publicClient, walletClient);

  const [userAddress, setUserAddress] = useState<`0x${string}` | null>(null);
  const [userBalance, setUserBalance] = useState<bigint>(0n);

  // On mount, get user address and check user Common$ balance
  useEffect(() => {
    async function init() {
      if (!walletClient) return;
      const addresses = await walletClient.getAddresses();
      if (!addresses || addresses.length === 0) return;
      setUserAddress(addresses[0]);
    }
    init();
  }, [walletClient]);

  // Whenever userAddress changes, refresh Common$ balance
  useEffect(() => {
    if (!userAddress) return;
    balanceOf(userAddress).then((bal) => setUserBalance(bal));
  }, [userAddress, balanceOf]);

  async function handleAddToAgentBalance() {
    if (!commonsAmount || !agentAddress) return;
    // Convert e.g. "5" to 5n (with decimals if your token has 18 decimals)
    const amountWei = BigInt(Number(commonsAmount) * 1e18);
    await transfer(agentAddress, amountWei);
    setOpen(false);
    setCommonsAmount("1");
    onFundSuccess?.(); // refresh parent UI
  }

  async function handleBuy() {
    if (!commonsAmount) return;
    // In this example, buyCommonToken expects the number of tokens (string).
    // If your contract logic differs, you may need to handle the rate differently.
    await buyCommonToken(commonsAmount);
    // refresh userBalance
    if (userAddress) {
      const updatedBal = await balanceOf(userAddress);
      setUserBalance(updatedBal);
    }
  }

  return (
    <div>
      {/* Show any errors from the hook */}
      {error && <p className="text-red-500 mb-2">{error}</p>}

      <div className="space-y-4">
        {/* If user has 0 tokens, show a "Buy" button */}
        {userBalance === 0n ? (
          <div className="rounded p-2">
            <p className="text-sm text-gray-500 mb-2">
              You currently have <strong>0 Common$</strong>.
            </p>
            <label className="block text-sm font-medium">Buy Amount</label>
            <Input
              type="number"
              value={commonsAmount}
              min="1"
              onChange={(e) => setCommonsAmount(e.target.value)}
              className="mt-1"
            />
            <Button
              onClick={handleBuy}
              disabled={loading}
              className="w-full mt-2"
            >
              {loading ? "Processing..." : "Buy Common$"}
            </Button>
          </div>
        ) : (
          <>
            <div>
              <label className="block text-sm font-medium">
                Amount in Common$
              </label>
              <Input
                type="number"
                value={commonsAmount}
                min="1"
                onChange={(e) => setCommonsAmount(e.target.value)}
                className="mt-1"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
