"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { LogItem } from "./log-item";
import { LogDetails } from "./log-details";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type AgentLog = {
  timestamp: string | number | Date;
  log_id: string;
  agent_id: string;
  action?: string;
  status?: string;
  message?: string;
  created_at: string;
  response_time?: number;
  session_id?: string;
  tools?: Array<{
    name: string;
    status: string;
    summary?: string;
    duration?: number;
  }>;
};

interface LogsDisplayProps {
  agentId: string;
}

export function LogsDisplay({ agentId }: LogsDisplayProps) {
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<AgentLog | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    async function fetchLogs() {
      if (!agentId) return;
      const { data, error } = await supabase
        .from("agent_log")
        .select("*")
        .eq("agent_id", agentId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching logs:", error);
        return;
      }
      if (data) {
        setLogs(data as AgentLog[]);
      }
    }
    fetchLogs();
  }, [agentId]);

  const filteredLogs = logs.filter((log) => {
    const text = `${log.action ?? ""} ${log.message ?? ""} ${
      log.session_id ?? ""
    }`.toLowerCase();
    return text.includes(searchTerm.toLowerCase());
  });

  return (
    <div className="flex flex-col md:flex-row gap-4 h-[calc(100vh-120px)]">
      <div
        className={cn(
          "flex-1 border rounded-lg shadow-sm overflow-hidden",
          selectedLog ? "md:w-2/3" : "w-full"
        )}
      >
        <div className="p-4 border-b bg-muted/30">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search logs..."
              className="pl-8"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {/* headings, etc. */}
        </div>
        <div className="overflow-y-auto max-h-[calc(100vh-220px)]">
          {filteredLogs.length > 0 ? (
            filteredLogs.map((log) => (
              <LogItem
                key={log.log_id}
                log={log}
                isSelected={selectedLog?.log_id === log.log_id}
                onClick={() => setSelectedLog(log)}
              />
            ))
          ) : (
            <div className="p-8 text-center text-muted-foreground">
              No logs found
            </div>
          )}
        </div>
      </div>

      {selectedLog && (
        <div className="md:w-1/3 border rounded-lg shadow-sm overflow-hidden">
          <div className="border-b bg-muted/30 flex justify-between items-center">
            {/* details or a close button */}
          </div>
          <div className="overflow-y-auto max-h-[calc(100vh-220px)]">
            <LogDetails log={selectedLog} />
          </div>
        </div>
      )}
    </div>
  );
}
