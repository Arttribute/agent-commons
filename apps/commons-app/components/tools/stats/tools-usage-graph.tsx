"use client";

import { useMemo } from "react";
import {
  Chart,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  XAxis,
  YAxis,
  CartesianGrid,
  Area,
  AreaChart,
} from "@/components/ui/custom-chart";
import { format, parseISO } from "date-fns";

interface UsageGraphProps {
  data: Array<{
    date: string;
    value: number;
  }>;
  timeSpan: string;
}

export function ToolsUsageGraph({ data, timeSpan }: UsageGraphProps) {
  // Format the date based on the selected time span
  const formatDate = (date: string) => {
    const parsedDate = parseISO(date);

    switch (timeSpan) {
      case "24h":
        return format(parsedDate, "HH:mm");
      case "7d":
        return format(parsedDate, "EEE");
      case "30d":
        return format(parsedDate, "dd MMM");
      case "3m":
      case "12m":
      case "24m":
        return format(parsedDate, "MMM yyyy");
      default:
        return format(parsedDate, "dd MMM");
    }
  };

  // Calculate appropriate tick interval based on time span
  const tickInterval = useMemo(() => {
    switch (timeSpan) {
      case "24h":
        return 4; // Every 4 hours
      case "7d":
        return 1; // Every day
      case "30d":
        return 5; // Every 5 days
      case "3m":
        return 2; // Every 2 weeks
      case "12m":
      case "24m":
        return 2; // Every 2 months
      default:
        return 1;
    }
  }, [timeSpan]);

  // Filter ticks to show only at the interval
  const ticks = useMemo(() => {
    return data
      .map((item, index) => index)
      .filter((index) => index % tickInterval === 0);
  }, [data, tickInterval]);

  return (
    <Chart>
      <ChartContainer>
        <AreaChart
          data={data}
          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor="hsl(var(--primary))"
                stopOpacity={0.3}
              />
              <stop
                offset="95%"
                stopColor="hsl(var(--primary))"
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            ticks={ticks}
            tick={{ fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(value) => value.toLocaleString()}
            tick={{ fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="hsl(var(--muted))"
          />
          <ChartTooltip
            content={
              <CustomTooltip
                timeSpan={timeSpan}
                active={false}
                payload={[]}
                label={""}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="hsl(var(--primary))"
            fillOpacity={1}
            fill="url(#colorValue)"
            strokeWidth={2}
          />
        </AreaChart>
      </ChartContainer>
    </Chart>
  );
}

// Custom tooltip component
function CustomTooltip({
  active,
  payload,
  label,
  timeSpan,
}: {
  active: boolean;
  payload: Array<{ value: number }>;
  label: string;
  timeSpan: string;
}) {
  if (active && payload && payload.length) {
    const date = parseISO(label);

    // Format the date in the tooltip based on the time span
    let formattedDate;
    switch (timeSpan) {
      case "24h":
        formattedDate = format(date, "h:mm a, MMM d");
        break;
      case "7d":
        formattedDate = format(date, "EEE, MMM d");
        break;
      default:
        formattedDate = format(date, "MMM d, yyyy");
    }

    return (
      <ChartTooltipContent>
        <div className="px-3 py-2">
          <div className="text-sm font-medium">{formattedDate}</div>
          <div className="text-sm font-semibold text-primary">
            {payload[0].value.toLocaleString()} calls
          </div>
        </div>
      </ChartTooltipContent>
    );
  }

  return null;
}
