"use client";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
} from "@/components/ui/drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogsDisplay } from "@/components/logs/logs-display";
import { ToolsUsageStatistics } from "@/components/tools/stats/tools-usage-stats";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BarChart2, XIcon } from "lucide-react";
import { useState } from "react";

interface AgentMetricsProps {
  agentId: string;
}

export function AgentMetrics({ agentId }: AgentMetricsProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="w-full gap-2"
        onClick={() => setOpen(true)}
      >
        <BarChart2 className="h-3.5 w-3.5" />
        Observability
      </Button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="h-[94vh]">
          <div className="px-4 pb-2 h-full flex flex-col">
            <Tabs defaultValue="logs" className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between py-3">
                <TabsList>
                  <TabsTrigger value="logs">Logs</TabsTrigger>
                  <TabsTrigger value="usage">Tool Usage</TabsTrigger>
                </TabsList>
                <DrawerClose asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <XIcon className="h-4 w-4" />
                  </Button>
                </DrawerClose>
              </div>
              <ScrollArea className="flex-1">
                <TabsContent value="logs" className="mt-0">
                  <LogsDisplay agentId={agentId} />
                </TabsContent>
                <TabsContent value="usage" className="mt-0">
                  <ToolsUsageStatistics agentId={agentId} />
                </TabsContent>
              </ScrollArea>
            </Tabs>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
