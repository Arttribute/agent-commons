"use client";
import React, { useState } from "react";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChevronDown,
  ChevronUp,
  ArrowUpRight,
  ArrowDownLeft,
} from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

export function AgentTransactions({ transactions }: { transactions: any[] }) {
  const [expandedTransactions, setExpandedTransactions] = useState<string[]>(
    []
  );

  const toggleTransactionExpand = (id: string) => {
    setExpandedTransactions((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  return (
    <ScrollArea className="h-72 overflow-y-auto border rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead className="hidden md:table-cell">Address</TableHead>
            <TableHead className="hidden md:table-cell">Date</TableHead>
            <TableHead className="text-right"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((transaction) => (
            <React.Fragment key={transaction.id}>
              <TableRow
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => toggleTransactionExpand(transaction.id)}
              >
                <TableCell>
                  <div className="flex items-center">
                    {transaction.type === "incoming" ? (
                      <ArrowDownLeft className="mr-2 h-4 w-4 text-green-500" />
                    ) : (
                      <ArrowUpRight className="mr-2 h-4 w-4 text-red-500" />
                    )}
                    <span className="hidden md:inline">
                      {transaction.type === "incoming" ? "Received" : "Sent"}
                    </span>
                  </div>
                </TableCell>
                <TableCell
                  className={
                    transaction.type === "incoming"
                      ? "text-green-500"
                      : "text-red-500"
                  }
                >
                  {transaction.type === "incoming" ? "+" : "-"}
                  {transaction.amount}
                </TableCell>
                <TableCell className="hidden md:table-cell font-mono text-xs">
                  {transaction.walletAddress}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {format(transaction.timestamp, "MMM d, yyyy")}
                </TableCell>
                <TableCell className="text-right">
                  {expandedTransactions.includes(transaction.id) ? (
                    <ChevronUp className="ml-auto h-4 w-4" />
                  ) : (
                    <ChevronDown className="ml-auto h-4 w-4" />
                  )}
                </TableCell>
              </TableRow>
              {expandedTransactions.includes(transaction.id) && (
                <TableRow>
                  <TableCell colSpan={5} className="p-0">
                    <div className="p-4 bg-muted/30">
                      <Card>
                        <CardContent className="p-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-sm font-medium">
                                Transaction Details
                              </p>
                              <p className="text-sm text-muted-foreground mt-1">
                                {transaction.description}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm font-medium">Date & Time</p>
                              <p className="text-sm text-muted-foreground mt-1">
                                {format(
                                  transaction.timestamp,
                                  "MMM d, yyyy h:mm a"
                                )}
                              </p>
                            </div>
                            <div className="col-span-2">
                              <p className="text-sm font-medium">
                                Wallet Address
                              </p>
                              <p className="text-sm font-mono text-muted-foreground mt-1">
                                {transaction.walletAddress}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </React.Fragment>
          ))}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}
