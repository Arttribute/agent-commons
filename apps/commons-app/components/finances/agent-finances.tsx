"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AgentTransactions } from "@/components/finances/agent-transactions";
import { FundAllocations } from "@/components/finances/fund-allocations";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AddToAgentBalance } from "@/components/finances/add-to-agent-balance";
import { BadgeCentIcon } from "lucide-react";

// Mock data for demonstration
const mockTransactions = [
  {
    id: "tx1",
    type: "incoming",
    amount: 100,
    walletAddress: "0x1234...5678",
    timestamp: new Date(2023, 5, 15, 10, 30),
    description: "Initial funding",
  },
  {
    id: "tx2",
    type: "outgoing",
    amount: 25,
    walletAddress: "0x8765...4321",
    timestamp: new Date(2023, 5, 16, 14, 45),
    description: "Payment for services",
  },
  {
    id: "tx3",
    type: "incoming",
    amount: 50,
    walletAddress: "0x2468...1357",
    timestamp: new Date(2023, 5, 17, 9, 15),
    description: "Additional funding",
  },
  {
    id: "tx4",
    type: "outgoing",
    amount: 35,
    walletAddress: "0x9876...5432",
    timestamp: new Date(2023, 5, 18, 16, 20),
    description: "API subscription payment",
  },
];

const mockAllocations = [
  {
    id: "alloc1",
    allocatorAddress: "0x1234...5678",
    fundingInstances: [
      {
        id: "fund1",
        amount: 100,
        timestamp: new Date(2023, 5, 15, 10, 30),
        description: "Initial allocation",
      },
      {
        id: "fund2",
        amount: 50,
        timestamp: new Date(2023, 5, 17, 9, 15),
        description: "Additional allocation",
      },
      {
        id: "fund3",
        amount: 75,
        timestamp: new Date(2023, 5, 20, 11, 45),
        description: "Top-up allocation",
      },
    ],
    usageDetails: [
      {
        id: "usage1",
        amount: 50,
        timestamp: new Date(2023, 5, 16, 10, 30),
        description: "Data processing task",
      },
      {
        id: "usage2",
        amount: 40,
        timestamp: new Date(2023, 5, 17, 15, 45),
        description: "API integration service",
      },
      {
        id: "usage3",
        amount: 30,
        timestamp: new Date(2023, 5, 18, 14, 20),
        description: "Content generation",
      },
    ],
  },
  {
    id: "alloc2",
    allocatorAddress: "0x8765...4321",
    fundingInstances: [
      {
        id: "fund4",
        amount: 150,
        timestamp: new Date(2023, 5, 11, 14, 30),
        description: "Initial allocation",
      },
    ],
    usageDetails: [
      {
        id: "usage4",
        amount: 25,
        timestamp: new Date(2023, 5, 13, 9, 15),
        description: "Research task",
      },
      {
        id: "usage5",
        amount: 50,
        timestamp: new Date(2023, 5, 15, 11, 20),
        description: "Development work",
      },
    ],
  },
];

export default function AgentFinances() {
  const totalBalance = mockTransactions.reduce(
    (acc, tx) => acc + (tx.type === "incoming" ? tx.amount : -tx.amount),
    0
  );
  const allocatedFunds = mockAllocations.reduce(
    (acc, alloc) =>
      acc + alloc.fundingInstances.reduce((sum, fund) => sum + fund.amount, 0),
    0
  );
  return (
    <Drawer direction="left">
      <DrawerTrigger asChild>
        <div className="cursor-pointer border border-gray-400 rounded-lg p-2 hover:border-gray-700 transition-colors ">
          <div className="flex items-center gap-1">
            <BadgeCentIcon className="h-4 w-4 " />
            <h3 className="text-sm font-semibold">Common$</h3>
          </div>
          <div className="grid grid-cols-2 gap-1 mt-1">
            <div className="col-span-1 border border-gray-300 py-1 px-2 rounded-lg">
              <p className="text-xl font-semibold">500</p>
              <p className="text-xs ">Balance</p>
            </div>
            <div className="col-span-1 border border-gray-300 py-1 px-2 rounded-lg">
              <p className="text-xl font-semibold">2000</p>
              <p className="text-xs ">Used</p>
            </div>
          </div>
        </div>
      </DrawerTrigger>
      <DrawerContent className=" max-w-5xl">
        <div className="p-4 pb-0 ">
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-8">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Total Balance</CardDescription>
                    <CardTitle className="text-4xl">{totalBalance}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Allocated</CardDescription>
                    <CardTitle className="text-4xl">{allocatedFunds}</CardTitle>
                  </CardHeader>
                </Card>
              </div>
              <Tabs defaultValue="transactions" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="transactions">Transactions</TabsTrigger>
                  <TabsTrigger value="allocations">Allocations</TabsTrigger>
                </TabsList>
                <TabsContent value="transactions">
                  <div className="space-y-4">
                    <AgentTransactions transactions={mockTransactions} />
                  </div>
                </TabsContent>
                <TabsContent value="allocations">
                  <div className="space-y-4">
                    <FundAllocations allocations={mockAllocations} />
                  </div>
                </TabsContent>
              </Tabs>
            </div>
            <div className="col-span-4">
              <AddToAgentBalance
                agentAddress="0x1234...5678"
                onFundSuccess={() => {}}
              />
            </div>
          </div>
        </div>
        <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="outline">close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
