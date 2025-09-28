import type { AgentLog } from "@/components/logs/logs-display";
import { formatDistanceToNow, format } from "date-fns";
import { AlertCircle, CheckCircle, Clock, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

interface LogDetailsProps {
  log: AgentLog;
}

export function LogDetails({ log }: LogDetailsProps) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return (
          <div className="flex items-center gap-1.5 text-green-600 bg-green-50 dark:bg-green-950/30 px-2.5 py-1 rounded-full text-xs font-medium">
            <CheckCircle className="h-3.5 w-3.5" />
            Success
          </div>
        );
      case "warning":
        return (
          <div className="flex items-center gap-1.5 text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-2.5 py-1 rounded-full text-xs font-medium">
            <Clock className="h-3.5 w-3.5" />
            Warning
          </div>
        );
      case "error":
        return (
          <div className="flex items-center gap-1.5 text-red-600 bg-red-50 dark:bg-red-950/30 px-2.5 py-1 rounded-full text-xs font-medium">
            <AlertCircle className="h-3.5 w-3.5" />
            Error
          </div>
        );
      default:
        return null;
    }
  };

  const getToolStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "warning":
        return <Clock className="h-4 w-4 text-amber-600" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return null;
    }
  };

  const getToolStatusClass = (status: string) => {
    switch (status) {
      case "success":
        return "text-green-600 border-green-300 dark:border-green-900";
      case "warning":
        return "text-amber-600 border-amber-300 dark:border-amber-900";
      case "error":
        return "text-red-600 border-red-300 dark:border-red-900";
      default:
        return "";
    }
  };

  return (
    <div className="p-4 space-y-6">
      <div className="flex flex-col">
        <div className="flex justify-between items-start">
          <h3 className="font-medium text-sm">{log.action}</h3>
          {getStatusBadge(log.status ?? "")}
        </div>
        <p className="text-muted-foreground text-xs">{log.message}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-muted-foreground mb-1 text-sm">Session ID</div>
          <div className="font-mono font-medium text-xs">{log.session_id}</div>
        </div>
        <div>
          <div className="text-muted-foreground mb-1 text-sm">Agent</div>
          <div className="font-medium text-xs">{log.agent_id}</div>
        </div>
        <div>
          <div className="text-muted-foreground mb-1 text-sm">
            Response Time
          </div>
          <div className="font-medium text-xs">{log.response_time}ms</div>
        </div>
        <div>
          <div className="text-muted-foreground mb-1 text-sm">Timestamp</div>
          <div className="font-medium text-xs">
            {format(new Date(log.created_at), "PPpp")}
            <div className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(log.created_at), {
                addSuffix: true,
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Tools Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-muted-foreground" />
          <h4 className="font-medium text-sm">Tools Called</h4>
        </div>
        {log.tools && log.tools.length > 0 ? (
          <div className="space-y-3">
            {log.tools.map((tool, index) => (
              <div
                key={index}
                className={cn(
                  "border rounded-lg p-3 text-sm",
                  getToolStatusClass(tool.status)
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {getToolStatusIcon(tool.status)}
                    <span className="font-medium">{tool.name}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {tool.duration}ms
                  </div>
                </div>
                <p className="text-xs">{tool.summary}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground italic">
            No tools were called
          </div>
        )}
      </div>
    </div>
  );
}
