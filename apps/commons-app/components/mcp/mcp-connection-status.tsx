"use client";

import { ServerStatus } from "@/types/mcp";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, AlertCircle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface McpConnectionStatusProps {
  status: ServerStatus;
  className?: string;
  showText?: boolean;
  size?: "sm" | "md" | "lg";
}

export function McpConnectionStatus({
  status,
  className,
  showText = false,
  size = "md",
}: McpConnectionStatusProps) {
  const config = {
    connected: {
      icon: CheckCircle2,
      color: "text-green-500",
      bgColor: "bg-green-50",
      borderColor: "border-green-200",
      text: "Connected",
      variant: "default" as const,
    },
    disconnected: {
      icon: XCircle,
      color: "text-gray-400",
      bgColor: "bg-gray-50",
      borderColor: "border-gray-200",
      text: "Disconnected",
      variant: "secondary" as const,
    },
    error: {
      icon: AlertCircle,
      color: "text-red-500",
      bgColor: "bg-red-50",
      borderColor: "border-red-200",
      text: "Error",
      variant: "destructive" as const,
    },
  };

  const { icon: Icon, color, text, variant } = config[status];

  const iconSize = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  }[size];

  if (showText) {
    return (
      <Badge variant={variant} className={cn("gap-1.5", className)}>
        <Icon className={iconSize} />
        <span>{text}</span>
      </Badge>
    );
  }

  return (
    <div className={cn("relative inline-block", className)}>
      <Icon className={cn(iconSize, color)} />
      {status === "connected" && (
        <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
        </span>
      )}
    </div>
  );
}
