"use client";

import { useEffect, useState, useCallback } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Zap, Clock, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface AutonomyStatus {
  enabled: boolean;
  intervalSec: number;
  isArmed: boolean;
  lastBeatAt: string | null;
  nextBeatAt: string | null;
}

interface AgentAutonomyProps {
  agentId: string;
  isOwner: boolean;
}

export function AgentAutonomy({ agentId, isOwner }: AgentAutonomyProps) {
  const [status, setStatus] = useState<AutonomyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [intervalSec, setIntervalSec] = useState(300);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${agentId}/autonomy`);
      if (res.ok) {
        const data = await res.json();
        const s: AutonomyStatus = data.data;
        setStatus(s);
        setIntervalSec(s.intervalSec || 300);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    fetchStatus();
    // Poll status every 30 s to keep lastBeatAt fresh
    const interval = setInterval(fetchStatus, 30_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleToggle = async (enabled: boolean) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/autonomy`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, intervalSec }),
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data.data);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleIntervalSave = async () => {
    if (!status?.enabled) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/autonomy`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true, intervalSec }),
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data.data);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleTriggerNow = async () => {
    setTriggering(true);
    try {
      await fetch(`/api/agents/${agentId}/autonomy/trigger`, { method: "POST" });
      // Refresh status after trigger
      setTimeout(fetchStatus, 2000);
    } finally {
      setTriggering(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-xs p-3">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Loading autonomy…</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border p-3 space-y-3">
      <div className="flex items-center gap-2">
        <div className="bg-purple-100 dark:bg-purple-900/30 p-1 rounded">
          <Zap className="h-3.5 w-3.5 text-purple-500" />
        </div>
        <span className="text-xs font-semibold">Autonomy</span>
        {status?.isArmed && (
          <Badge variant="secondary" className="text-xs ml-auto">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 mr-1 animate-pulse inline-block" />
            Active
          </Badge>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="text-xs font-medium">Heartbeat</Label>
          <p className="text-xs text-muted-foreground">
            Agent checks for work autonomously
          </p>
        </div>
        <Switch
          checked={status?.enabled ?? false}
          onCheckedChange={isOwner ? handleToggle : undefined}
          disabled={saving || !isOwner}
        />
      </div>

      {status?.enabled && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Interval (seconds)</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                min={30}
                step={30}
                value={intervalSec}
                onChange={(e) => setIntervalSec(parseInt(e.target.value) || 300)}
                className="h-7 text-xs"
                disabled={!isOwner}
              />
              {isOwner && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs px-2"
                  onClick={handleIntervalSave}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Min 30s · Currently every{" "}
              {intervalSec >= 3600
                ? `${(intervalSec / 3600).toFixed(1)}h`
                : intervalSec >= 60
                ? `${Math.round(intervalSec / 60)}m`
                : `${intervalSec}s`}
            </p>
          </div>

          <div className="space-y-1 text-xs text-muted-foreground">
            {status.lastBeatAt && (
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>
                  Last beat:{" "}
                  {new Date(status.lastBeatAt).toLocaleTimeString()}
                </span>
              </div>
            )}
            {status.nextBeatAt && (
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>
                  Next beat:{" "}
                  {new Date(status.nextBeatAt).toLocaleTimeString()}
                </span>
              </div>
            )}
          </div>

          {isOwner && (
            <Button
              size="sm"
              variant="outline"
              className="w-full h-7 text-xs"
              onClick={handleTriggerNow}
              disabled={triggering}
            >
              {triggering ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <RefreshCw className="h-3 w-3 mr-1" />
              )}
              Trigger now
            </Button>
          )}
        </>
      )}
    </div>
  );
}
