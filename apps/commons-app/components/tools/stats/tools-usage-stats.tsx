"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ToolsUsageGraph } from "@/components/tools/stats/tools-usage-graph";
import { ToolsUsageTable } from "@/components/tools/stats/tools-usage-table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, subHours, subDays, subMonths } from "date-fns";

/** A single agent_log row. Adjust to match your schema if needed. */
interface AgentLog {
  log_id: string;
  agent_id: string;
  session_id?: string;
  status?: string; // "success" | "error" | "warning" | ...
  response_time?: number;
  created_at: string; // timestamp
  tools?: Array<{
    name: string;
    status: string;
    summary?: string;
    duration?: number;
  }>;
}

/** Tools usage shape for ToolsUsageTable */
interface ToolsUsageData {
  id: string; // e.g. the tool name or an internal ID
  name: string; // e.g. the tool name
  calls: number; // how many times it was called
  avgDuration: number; // average time
  successRate: number; // fraction of calls that succeeded
  errorRate: number; // fraction that errored
  warningRate: number; // fraction that were warnings
}

// Time span options
const TIME_SPANS = [
  { value: "24h", label: "24 Hours" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "3m", label: "3 Months" },
  { value: "12m", label: "12 Months" },
  { value: "24m", label: "24 Months" },
];

function getTimeRange(timeSpan: string): { start: Date; end: Date } {
  const now = new Date();

  switch (timeSpan) {
    case "24h":
      return { start: subHours(now, 24), end: now };
    case "7d":
      return { start: subDays(now, 7), end: now };
    case "30d":
      return { start: subDays(now, 30), end: now };
    case "3m":
      return { start: subMonths(now, 3), end: now };
    case "12m":
      return { start: subMonths(now, 12), end: now };
    case "24m":
      return { start: subMonths(now, 24), end: now };
    default:
      // default to 7 days
      return { start: subDays(now, 7), end: now };
  }
}

interface UsageStatisticsProps {
  agentId: string;
}

/**
 * Fetch usage data from agent_log, derive stats, and display in your charts/tables.
 */
export function ToolsUsageStatistics({ agentId }: UsageStatisticsProps) {
  const [timeSpan, setTimeSpan] = useState("7d");
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [loading, setLoading] = useState(false);

  // 1) FETCH LOGS VIA SUPABASE
  useEffect(() => {
    async function fetchLogs() {
      if (!agentId) return;
      console.log("Fetching logs for agent", agentId);

      setLoading(true);

      const { start, end } = getTimeRange(timeSpan);

      // We'll query logs for this agent between start and end
      // Make sure your `agent_log` has a `created_at` or date column
      // You might also need to convert your times to a string or timestamp for comparison
      const { data, error } = await supabase
        .from("agent_log")
        .select("*")
        .eq("agent_id", agentId)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
        .order("created_at", { ascending: true }); // earliest first

      setLoading(false);

      if (error) {
        console.error("Error fetching agent logs:", error);
        return;
      }

      if (data) {
        setLogs(data as AgentLog[]);
      }
      console.log("Fetched logs:", data);
      console.log("Error:", error);
    }

    fetchLogs();
  }, [agentId, timeSpan]);

  // 2) COMPUTE BASIC STATS (TOTAL, AVERAGE, SUCCESS RATE)
  const totalCalls = useMemo(() => logs.length, [logs]);

  const averageDuration = useMemo(() => {
    if (!logs.length) return 0;
    const sum = logs.reduce((acc, log) => acc + (log.response_time ?? 0), 0);
    return Math.round(sum / logs.length);
  }, [logs]);

  const successRate = useMemo(() => {
    if (!logs.length) return 0;
    const successCount = logs.filter((log) => log.status === "success").length;
    return Math.round((successCount / logs.length) * 100);
  }, [logs]);

  // 3) CONSTRUCT TIME-SERIES DATA FOR UsageGraph
  //    We'll group by day or hour. For simplicity, let's do day-based grouping
  //    except for 24h we do hour-based.
  const usageData = useMemo(() => {
    if (!logs.length) return [];

    let formatStr = "yyyy-MM-dd"; // daily grouping
    if (timeSpan === "24h") {
      formatStr = "yyyy-MM-dd HH:00"; // group by hour
    }

    // Map of dateString -> count
    const map: Record<string, number> = {};
    logs.forEach((log) => {
      const dateKey = format(new Date(log.created_at), formatStr);
      map[dateKey] = (map[dateKey] || 0) + 1;
    });

    // Convert map to array sorted by date
    const result = Object.entries(map).map(([date, value]) => {
      // We can try to parse the date with a standard format
      // Then output date.toISOString() for usage in chart
      // We'll guess the date is in local time for the grouping
      // Or you can parse again if needed.
      const [ymd, hour] = date.split(" ");
      let isoString = new Date(ymd).toISOString();
      if (hour) {
        // If there's an hour, rebuild the date with that hour
        const newDate = new Date(ymd);
        const [hh] = hour.split(":");
        newDate.setHours(Number(hh));
        isoString = newDate.toISOString();
      }
      return { date: isoString, value };
    });

    // Sort by date
    result.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    return result;
  }, [logs, timeSpan]);

  // 4) BUILD TOOL USAGE STATS
  //    Summation of calls, durations, success/error/warning from "tools" or from log-level "status"
  //    In this example, we do it at the *tool* level from the `tools` array in each log.
  const toolsData: ToolsUsageData[] = useMemo(() => {
    // We'll store intermediate data in a map keyed by toolName
    // Then convert to the array that ToolsUsageTable expects
    const toolMap: Record<
      string,
      {
        name: string;
        calls: number;
        totalDuration: number;
        successCount: number;
        errorCount: number;
        warningCount: number;
      }
    > = {};

    logs.forEach((log) => {
      // If there's a tools array
      if (log.tools && log.tools.length > 0) {
        log.tools.forEach((tool) => {
          const tName = tool.name;
          if (!toolMap[tName]) {
            toolMap[tName] = {
              name: tName,
              calls: 0,
              totalDuration: 0,
              successCount: 0,
              errorCount: 0,
              warningCount: 0,
            };
          }
          toolMap[tName].calls += 1;
          toolMap[tName].totalDuration += tool.duration ?? 0;

          // We can interpret the status from the tool’s `status` field
          // (“success”, “error”, “warning”), etc.
          switch (tool.status) {
            case "success":
              toolMap[tName].successCount += 1;
              break;
            case "error":
              toolMap[tName].errorCount += 1;
              break;
            case "warning":
              toolMap[tName].warningCount += 1;
              break;
            default:
              // If there's something else, handle or skip
              break;
          }
        });
      }
    });

    // Convert to ToolsUsageData array
    return Object.entries(toolMap).map(([toolName, info]) => {
      const successRate = info.calls ? info.successCount / info.calls : 0;
      const errorRate = info.calls ? info.errorCount / info.calls : 0;
      const warningRate = info.calls ? info.warningCount / info.calls : 0;

      return {
        id: toolName, // or a unique ID if you have it
        name: toolName,
        calls: info.calls,
        avgDuration: info.calls
          ? Math.round(info.totalDuration / info.calls)
          : 0,
        successRate,
        errorRate,
        warningRate,
      };
    });
  }, [logs]);

  // RENDER
  if (loading) {
    return <div>Loading usage data...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Usage Overview</h2>
          <p className="text-muted-foreground">
            Monitor your agent&apos;s activity and tool usage
          </p>
        </div>

        {/* Let user select timeframe */}
        <Tabs
          value={timeSpan}
          onValueChange={setTimeSpan}
          className="w-full md:w-auto"
        >
          <TabsList className="grid grid-cols-3 md:grid-cols-6 w-full md:w-auto">
            {TIME_SPANS.map((span) => (
              <TabsTrigger key={span.value} value={span.value}>
                {span.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Calls</CardDescription>
            <CardTitle className="text-2xl">
              {totalCalls.toLocaleString()}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg. Response Time</CardDescription>
            <CardTitle className="text-2xl">{averageDuration}ms</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Success Rate</CardDescription>
            <CardTitle className="text-2xl">{successRate}%</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Usage Over Time chart */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        <Card className="col-span-1 md:col-span-5">
          <CardHeader>
            <CardTitle>Usage Over Time</CardTitle>
            <CardDescription>
              Total number of calls over the selected time period
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              {/* The same <UsageGraph> from your code, but now we pass `usageData`. */}
              <ToolsUsageGraph data={usageData} timeSpan={timeSpan} />
            </div>
          </CardContent>
        </Card>

        {/* Tools usage */}
        <Card className="col-span-1 md:col-span-7">
          <CardHeader>
            <CardTitle>Tool Usage Statistics</CardTitle>
            <CardDescription>
              Detailed usage statistics for each tool
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* The same ToolsUsageTable, but we pass our computed toolsData */}
            <ToolsUsageTable data={toolsData} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
