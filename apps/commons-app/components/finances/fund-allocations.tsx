"use client";
import React, { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChevronDown,
  ChevronUp,
  ArrowDownLeft,
  ArrowUpRight,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@radix-ui/react-scroll-area";

export function FundAllocations({ allocations }: { allocations: any[] }) {
  const [expandedAllocations, setExpandedAllocations] = useState<string[]>([]);
  const toggleAllocationExpand = (id: string) => {
    setExpandedAllocations((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };
  // Calculate total allocated and used for each allocator
  const getAllocatorSummary = (allocation: (typeof allocations)[0]) => {
    const totalAllocated = allocation.fundingInstances.reduce(
      (sum, instance) => sum + instance.amount,
      0
    );
    const totalUsed = allocation.usageDetails.reduce(
      (sum, usage) => sum + usage.amount,
      0
    );
    return { totalAllocated, totalUsed };
  };

  return (
    <ScrollArea className="h-72 overflow-y-auto border rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Allocator</TableHead>
            <TableHead>Total Allocated</TableHead>
            <TableHead>Usage</TableHead>
            <TableHead className="hidden md:table-cell">Last Funded</TableHead>
            <TableHead className="text-right"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {allocations.map((allocation) => {
            const { totalAllocated, totalUsed } =
              getAllocatorSummary(allocation);
            // Sort funding instances by date (newest first)
            const sortedFundingInstances = [
              ...allocation.fundingInstances,
            ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
            const lastFundingDate = sortedFundingInstances[0]?.timestamp;
            const usagePercentage = (totalUsed / totalAllocated) * 100;

            return (
              <React.Fragment key={allocation.id}>
                <TableRow
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => toggleAllocationExpand(allocation.id)}
                >
                  <TableCell className="font-mono text-xs">
                    {allocation.allocatorAddress}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center">
                      <span>{totalAllocated}</span>
                      <Badge variant="outline" className="ml-2">
                        {allocation.fundingInstances.length}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 w-32">
                      <div className="flex justify-between text-xs">
                        <span>{totalUsed}</span>
                        <span className="text-muted-foreground">
                          {Math.round(usagePercentage)}%
                        </span>
                      </div>
                      <Progress value={usagePercentage} className="h-2" />
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {lastFundingDate
                      ? format(lastFundingDate, "MMM d, yyyy")
                      : "N/A"}
                  </TableCell>
                  <TableCell className="text-right">
                    {expandedAllocations.includes(allocation.id) ? (
                      <ChevronUp className="ml-auto h-4 w-4" />
                    ) : (
                      <ChevronDown className="ml-auto h-4 w-4" />
                    )}
                  </TableCell>
                </TableRow>
                {expandedAllocations.includes(allocation.id) && (
                  <TableRow>
                    <TableCell colSpan={5} className="p-0">
                      <div className="p-4 bg-muted/30">
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-base">
                              Allocation Details
                            </CardTitle>
                            <CardDescription>
                              Funding and usage for{" "}
                              {allocation.allocatorAddress}
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="mb-6">
                              <div className="flex justify-between items-center mb-2">
                                <h4 className="text-sm font-medium">
                                  Total Allocation Usage
                                </h4>
                                <div className="text-sm">
                                  <span className="font-medium">
                                    {totalUsed}
                                  </span>
                                  <span className="text-muted-foreground">
                                    {" "}
                                    of {totalAllocated} (
                                  </span>
                                  <span>{Math.round(usagePercentage)}%</span>
                                  <span className="text-muted-foreground">
                                    )
                                  </span>
                                </div>
                              </div>
                              <Progress
                                value={usagePercentage}
                                className="h-2"
                              />
                            </div>

                            <div className="space-y-6">
                              <div>
                                <h4 className="text-sm font-medium mb-2">
                                  Funding History
                                </h4>
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Amount</TableHead>
                                      <TableHead>Date</TableHead>
                                      <TableHead>Description</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {sortedFundingInstances.map((instance) => (
                                      <TableRow key={instance.id}>
                                        <TableCell>
                                          <div className="flex items-center">
                                            <ArrowDownLeft className="mr-2 h-4 w-4 text-green-500" />
                                            <span>{instance.amount}</span>
                                          </div>
                                        </TableCell>
                                        <TableCell>
                                          {format(
                                            instance.timestamp,
                                            "MMM d, yyyy h:mm a"
                                          )}
                                        </TableCell>
                                        <TableCell>
                                          {instance.description}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>

                              <div>
                                <h4 className="text-sm font-medium mb-2">
                                  Usage History
                                </h4>
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Amount</TableHead>
                                      <TableHead>Date</TableHead>
                                      <TableHead>Description</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {/* Sort usage details by date (newest first) */}
                                    {[...allocation.usageDetails]
                                      .sort(
                                        (a, b) =>
                                          b.timestamp.getTime() -
                                          a.timestamp.getTime()
                                      )
                                      .map((usage) => (
                                        <TableRow key={usage.id}>
                                          <TableCell>
                                            <div className="flex items-center">
                                              <ArrowUpRight className="mr-2 h-4 w-4 text-red-500" />
                                              <span>{usage.amount}</span>
                                            </div>
                                          </TableCell>
                                          <TableCell>
                                            {format(
                                              usage.timestamp,
                                              "MMM d, yyyy h:mm a"
                                            )}
                                          </TableCell>
                                          <TableCell>
                                            {usage.description}
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    {allocation.usageDetails.length === 0 && (
                                      <TableRow>
                                        <TableCell
                                          colSpan={3}
                                          className="text-center py-4 text-muted-foreground"
                                        >
                                          No usage records found
                                        </TableCell>
                                      </TableRow>
                                    )}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          </CardContent>
                          <CardFooter className="bg-muted/30 p-4">
                            <div className="flex justify-between w-full">
                              <div>
                                <p className="text-sm font-medium">
                                  Total Allocated
                                </p>
                                <p className="font-medium text-green-500">
                                  +{totalAllocated}
                                </p>
                              </div>
                              <div>
                                <p className="text-sm font-medium">
                                  Total Used
                                </p>
                                <p className="font-medium text-red-500">
                                  -{totalUsed}
                                </p>
                              </div>
                              <div>
                                <p className="text-sm font-medium">Remaining</p>
                                <p className="font-medium">
                                  {totalAllocated - totalUsed}
                                </p>
                              </div>
                            </div>
                          </CardFooter>
                        </Card>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            );
          })}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}
