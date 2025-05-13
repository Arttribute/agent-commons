import type React from "react";
import {
  LineChart as RechartsLineChart,
  Line as RechartsLine,
  XAxis as RechartsXAxis,
  YAxis as RechartsYAxis,
  CartesianGrid as RechartsCartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer as RechartsResponsiveContainer,
  AreaChart as RechartsAreaChart,
  Area as RechartsArea,
} from "recharts";

export const Chart = ({ children }: { children: React.ReactNode }) => {
  return <div className="w-full">{children}</div>;
};

export const ChartContainer = ({
  children,
}: {
  children: React.ReactElement;
}) => {
  return (
    <RechartsResponsiveContainer width="100%" height={300}>
      {children}
    </RechartsResponsiveContainer>
  );
};

export const ChartTooltip = RechartsTooltip;
export const ChartTooltipContent = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <div className="bg-white border rounded-md shadow-md p-2">{children}</div>
  );
};

// Export recharts components with their original names
export const LineChart = RechartsLineChart;
export const AreaChart = RechartsAreaChart;
export const Line = RechartsLine;
export const XAxis = RechartsXAxis;
export const YAxis = RechartsYAxis;
export const CartesianGrid = RechartsCartesianGrid;
export const Tooltip = RechartsTooltip;
export const ResponsiveContainer = RechartsResponsiveContainer;
export const Area = RechartsArea;
