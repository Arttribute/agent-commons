import type { ElementType } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Clock,
  XCircle,
} from "lucide-react";

export const statusConfig: Record<string, { label: string; icon: ElementType; className: string }> = {
  pending: {
    label: "Todo",
    icon: Circle,
    className: "text-slate-500",
  },
  started: {
    label: "Started",
    icon: Clock,
    className: "text-blue-600",
  },
  running: {
    label: "In Progress",
    icon: Clock,
    className: "text-amber-600",
  },
  completed: {
    label: "Done",
    icon: CheckCircle2,
    className: "text-emerald-600",
  },
  failed: {
    label: "Failed",
    icon: AlertCircle,
    className: "text-red-600",
  },
  cancelled: {
    label: "Canceled",
    icon: XCircle,
    className: "text-muted-foreground",
  },
};

export const statusOrder = ["running", "started", "pending", "completed", "failed", "cancelled"];
