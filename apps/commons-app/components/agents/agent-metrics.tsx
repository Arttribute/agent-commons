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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogsDisplay } from "@/components/logs/logs-display";
import { ToolsUsageStatistics } from "@/components/tools/stats/tools-usage-stats";
import { ScrollArea } from "@radix-ui/react-scroll-area";
import { Scroll, XIcon, Maximize2 } from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

interface AgentMetrics {
  agentId: string;
}

const chartData = [
  { month: "January", desktop: 186 },
  { month: "February", desktop: 305 },
  { month: "March", desktop: 237 },
  { month: "April", desktop: 73 },
  { month: "May", desktop: 209 },
  { month: "June", desktop: 214 },
];
const chartConfig = {
  desktop: {
    label: "Desktop",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;

export function AgentMetrics({ agentId }: AgentMetrics) {
  return (
    <Drawer>
      <DrawerTrigger asChild>
        <div className="bg-white cursor-pointer border border-gray-400 rounded-lg p-2  hover:border-gray-700 transition-colors m-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold"> Agent Metrics</p>
            <div className="ml-auto">
              <Maximize2 className=" h-4 w-4 text-gray-500 hover:text-gray-700 cursor-pointer" />
            </div>
          </div>
          <div className="border border-gray-400 rounded-lg p-2 mx-1 mt-2 mb-3">
            <p className="text-xs ">Total requests</p>
            <p className="text-xl font-semibold">500</p>
          </div>
          <ChartContainer
            config={chartConfig}
            className="h-24 w-full rounded-lg"
          >
            <AreaChart accessibilityLayer data={chartData}>
              <CartesianGrid vertical={false} />

              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent indicator="line" />}
              />
              <Area dataKey="desktop" type="natural" fillOpacity={0.4} />
            </AreaChart>
          </ChartContainer>
        </div>
      </DrawerTrigger>
      <DrawerContent className="h-[94vh]">
        <div className="px-4 pb-2">
          <ScrollArea className="h-full overflow-y-auto ">
            <Tabs defaultValue="usage">
              <div className="flex items-center justify-between">
                <TabsList className="grid w-96 grid-cols-2">
                  <TabsTrigger value="usage">Tools usage</TabsTrigger>
                  <TabsTrigger value="logs">Logs</TabsTrigger>
                </TabsList>

                <DrawerClose className="text-muted-foreground hover:text-foreground ml-auto">
                  <XIcon className="h-5 w-5" />
                </DrawerClose>
              </div>
              <TabsContent value="usage">
                {/* Pass the agentId down to UsageStatistics */}
                <ToolsUsageStatistics agentId={agentId} />
              </TabsContent>

              <TabsContent value="logs">
                {" "}
                <LogsDisplay agentId={agentId} />
              </TabsContent>
            </Tabs>
          </ScrollArea>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
