import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { DatabaseService } from '~/modules/database/database.service';
import * as schema from '#/models/schema';
import { Injectable, NotFoundException } from '@nestjs/common';

type ObservabilityStatus =
  | 'success'
  | 'error'
  | 'failed'
  | 'warning'
  | 'timeout'
  | 'unauthorized'
  | 'cancelled'
  | 'pending'
  | 'running'
  | 'started'
  | 'info';

type ObservabilityToolSignal = {
  id: string;
  source: 'tool_execution_log' | 'agent_log';
  logId?: string;
  toolId?: string;
  toolName: string;
  status: ObservabilityStatus;
  durationMs: number;
  startedAt: string;
  completedAt?: string | null;
  sessionId?: string | null;
  summary?: string | null;
  errorMessage?: string | null;
  rateLimitHit?: boolean;
  inputArgs?: Record<string, any> | null;
  outputData?: any;
};

@Injectable()
export class LogService {
  constructor(private db: DatabaseService) {}

  async createLogEntry(props: {
    agentId: string;
    sessionId?: string;
    action: string; // short label
    message: string; // longer text
    status: string; // success/error/warning/pending
    responseTime?: number;
    tools?: Array<{
      name: string;
      status: string;
      summary?: string;
      duration?: number;
    }>;
  }) {
    await this.db.insert(schema.agentLog).values({
      agentId: props.agentId,
      sessionId: props.sessionId,
      action: props.action,
      message: props.message,
      status: props.status,
      responseTime: props.responseTime || 0,
      tools: props.tools || [],
    });
  }

  async getAllAgentLogs({ agentId }: { agentId: string }) {
    if (!agentId) {
      throw new NotFoundException('Missing agentId');
    }
    const logs = await this.db.query.agentLog.findMany({
      where: (t) => eq(t.agentId, agentId),
      orderBy: (t) => [desc(t.createdAt)],
      limit: 200,
    });
    const out = logs.map((l) => ({
      id: l.logId,
      action: l.action || '',
      status: l.status || 'info',
      message: l.message || '',
      timestamp: l.createdAt.toISOString(),
      responseTime: l.responseTime || 0,
      agent: agentId,
      sessionId: l.sessionId || '',
      tools: l.tools || [],
    }));
    return out;
  }

  async getAgentObservability({
    agentId,
    from,
    to,
    limit,
  }: {
    agentId: string;
    from?: string;
    to?: string;
    limit?: string;
  }) {
    if (!agentId) {
      throw new NotFoundException('Missing agentId');
    }

    const toDate = parseDate(to) ?? new Date();
    const fromDate =
      parseDate(from) ?? new Date(toDate.getTime() - 24 * 60 * 60 * 1000);
    const rowLimit = clamp(parseInt(limit || '200', 10) || 200, 25, 500);

    const logs = await this.db.query.agentLog.findMany({
      where: (t) =>
        and(
          eq(t.agentId, agentId),
          gte(t.createdAt, fromDate),
          lte(t.createdAt, toDate),
        ),
      orderBy: (t) => [desc(t.createdAt)],
      limit: rowLimit,
    });

    const toolExecutions = await this.db.query.toolExecutionLog.findMany({
      where: (t) =>
        and(
          eq(t.agentId, agentId),
          gte(t.startedAt, fromDate),
          lte(t.startedAt, toDate),
        ),
      orderBy: (t) => [desc(t.startedAt)],
      limit: rowLimit,
      with: {
        tool: true,
      },
    });

    const usageEvents = await this.db.query.usageEvent.findMany({
      where: (t) =>
        and(
          eq(t.agentId, agentId),
          gte(t.createdAt, fromDate),
          lte(t.createdAt, toDate),
        ),
      orderBy: (t) => [desc(t.createdAt)],
      limit: rowLimit,
    });

    const tasks = await this.db.query.task.findMany({
      where: (t) =>
        and(
          eq(t.agentId, agentId),
          gte(t.updatedAt, fromDate),
          lte(t.updatedAt, toDate),
        ),
      orderBy: (t) => [desc(t.updatedAt)],
      limit: rowLimit,
    });

    const normalizedLogs = logs.map((log) => ({
      id: log.logId,
      logId: log.logId,
      action: log.action || 'agent_event',
      status: normalizeStatus(log.status),
      message: log.message || '',
      timestamp: log.createdAt.toISOString(),
      createdAt: log.createdAt.toISOString(),
      responseTimeMs: log.responseTime || 0,
      agentId,
      sessionId: log.sessionId,
      tools: log.tools || [],
    }));

    const embeddedToolCalls: ObservabilityToolSignal[] = normalizedLogs.flatMap(
      (log) =>
        (Array.isArray(log.tools) ? log.tools : []).map((tool, index) => ({
          id: `${log.logId}:${tool.name || 'tool'}:${index}`,
          source: 'agent_log' as const,
          logId: log.logId,
          toolName: tool.name || 'Tool call',
          status: normalizeStatus(tool.status || log.status),
          durationMs: Number(tool.duration || log.responseTimeMs || 0),
          startedAt: log.createdAt,
          completedAt: log.createdAt,
          sessionId: log.sessionId,
          summary: tool.summary || log.message,
        })),
    );

    const executionToolCalls: ObservabilityToolSignal[] = toolExecutions.map(
      (execution: any) => ({
        id: execution.logId,
        source: 'tool_execution_log',
        logId: execution.logId,
        toolId: execution.toolId,
        toolName:
          execution.tool?.displayName ||
          execution.tool?.name ||
          execution.toolId ||
          'Tool call',
        status: normalizeStatus(execution.status),
        durationMs: Number(execution.duration || 0),
        startedAt: execution.startedAt.toISOString(),
        completedAt: execution.completedAt?.toISOString() ?? null,
        sessionId: execution.sessionId,
        errorMessage: execution.errorMessage,
        rateLimitHit: Boolean(execution.rateLimitHit),
        inputArgs: execution.inputArgs || null,
        outputData: execution.outputData,
      }),
    );

    const toolSignals =
      executionToolCalls.length > 0 ? executionToolCalls : embeddedToolCalls;
    const responseTimes = normalizedLogs
      .map((log) => log.responseTimeMs)
      .filter((value) => Number.isFinite(value) && value > 0);
    const toolDurations = toolSignals
      .map((tool) => tool.durationMs)
      .filter((value) => Number.isFinite(value) && value > 0);
    const taskDurations = tasks
      .map((task) =>
        task.actualStart && task.actualEnd
          ? task.actualEnd.getTime() - task.actualStart.getTime()
          : 0,
      )
      .filter((value) => Number.isFinite(value) && value > 0);
    const usageDurations = usageEvents
      .map((event) => event.durationMs || 0)
      .filter((value) => Number.isFinite(value) && value > 0);

    const statusCounts = countBy(normalizedLogs, (log) => log.status);
    const taskStatusCounts = countBy(tasks, (task) => normalizeStatus(task.status));
    const successfulEvents = normalizedLogs.filter((log) =>
      isSuccessStatus(log.status),
    ).length;
    const failedEvents = normalizedLogs.filter((log) =>
      isFailureStatus(log.status),
    ).length;
    const warnings = normalizedLogs.filter((log) => log.status === 'warning')
      .length;

    const usageSummary = usageEvents.reduce(
      (summary, event) => {
        summary.inputTokens += event.inputTokens || 0;
        summary.outputTokens += event.outputTokens || 0;
        summary.cachedTokens += event.cachedTokens || 0;
        summary.totalTokens += event.totalTokens || 0;
        summary.totalCostUsd += Number(event.costUsd || 0);
        return summary;
      },
      {
        calls: usageEvents.length,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        totalTokens: 0,
        totalCostUsd: 0,
        avgDurationMs: average(usageDurations),
      },
    );

    const taskSummary = {
      total: tasks.length,
      completed: taskStatusCounts.success || taskStatusCounts.completed || 0,
      failed: taskStatusCounts.failed || taskStatusCounts.error || 0,
      running: (taskStatusCounts.running || 0) + (taskStatusCounts.started || 0),
      pending: taskStatusCounts.pending || 0,
      cancelled: taskStatusCounts.cancelled || 0,
      avgDurationMs: average(taskDurations),
      p95DurationMs: percentile(taskDurations, 95),
    };

    const summary = {
      agentId,
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      totalEvents: normalizedLogs.length,
      successfulEvents,
      failedEvents,
      warnings,
      successRate:
        normalizedLogs.length > 0
          ? Math.round((successfulEvents / normalizedLogs.length) * 100)
          : 0,
      errorRate:
        normalizedLogs.length > 0
          ? Math.round((failedEvents / normalizedLogs.length) * 100)
          : 0,
      toolCalls: toolSignals.length,
      failedToolCalls: toolSignals.filter((tool) => isFailureStatus(tool.status))
        .length,
      rateLimitedToolCalls: toolSignals.filter((tool) => tool.rateLimitHit)
        .length,
      avgResponseTimeMs: average(responseTimes),
      p95ResponseTimeMs: percentile(responseTimes, 95),
      avgToolDurationMs: average(toolDurations),
      p95ToolDurationMs: percentile(toolDurations, 95),
      usage: usageSummary,
      tasks: taskSummary,
      statusCounts,
    };

    return {
      data: {
        summary,
        timeline: buildTimeline({
          from: fromDate,
          to: toDate,
          logs: normalizedLogs,
          tools: toolSignals,
          usageEvents,
          tasks,
        }),
        logs: normalizedLogs,
        toolCalls: executionToolCalls,
        embeddedToolCalls,
        toolRollups: buildToolRollups(toolSignals),
        usage: {
          summary: usageSummary,
          models: buildModelRollups(usageEvents),
          events: usageEvents.map((event) => ({
            eventId: event.eventId,
            provider: event.provider,
            modelId: event.modelId,
            inputTokens: event.inputTokens,
            outputTokens: event.outputTokens,
            cachedTokens: event.cachedTokens,
            totalTokens: event.totalTokens,
            costUsd: event.costUsd,
            durationMs: event.durationMs,
            sessionId: event.sessionId,
            taskId: event.taskId,
            traceId: event.traceId,
            createdAt: event.createdAt.toISOString(),
          })),
        },
        tasks: {
          summary: taskSummary,
          recent: tasks.map((task) => ({
            taskId: task.taskId,
            title: task.title,
            status: normalizeStatus(task.status),
            priority: task.priority,
            progress: task.progress,
            actualStart: task.actualStart?.toISOString() ?? null,
            actualEnd: task.actualEnd?.toISOString() ?? null,
            durationMs:
              task.actualStart && task.actualEnd
                ? task.actualEnd.getTime() - task.actualStart.getTime()
                : null,
            errorMessage: task.errorMessage,
            summary: task.summary,
            sessionId: task.sessionId,
            updatedAt: task.updatedAt.toISOString(),
            createdAt: task.createdAt.toISOString(),
          })),
        },
      },
    };
  }
}

function parseDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeStatus(value?: string | null): ObservabilityStatus {
  const status = String(value || 'info').toLowerCase();
  if (status === 'ok' || status === 'completed' || status === 'complete') {
    return 'success';
  }
  if (status === 'failure') return 'failed';
  if (status === 'warn') return 'warning';
  if (
    [
      'success',
      'error',
      'failed',
      'warning',
      'timeout',
      'unauthorized',
      'cancelled',
      'pending',
      'running',
      'started',
    ].includes(status)
  ) {
    return status as ObservabilityStatus;
  }
  return 'info';
}

function isSuccessStatus(status: string) {
  return ['success', 'info'].includes(normalizeStatus(status));
}

function isFailureStatus(status: string) {
  return ['error', 'failed', 'timeout', 'unauthorized', 'cancelled'].includes(
    normalizeStatus(status),
  );
}

function average(values: number[]) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return Math.round(sorted[clamp(index, 0, sorted.length - 1)] || 0);
}

function countBy<T>(items: T[], picker: (item: T) => string) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const key = picker(item);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function bucketFor(timestamp: string | Date, from: Date, bucketMs: number) {
  const time = timestamp instanceof Date ? timestamp.getTime() : new Date(timestamp).getTime();
  if (!Number.isFinite(time)) return 0;
  return Math.max(0, Math.floor((time - from.getTime()) / bucketMs));
}

function buildTimeline({
  from,
  to,
  logs,
  tools,
  usageEvents,
  tasks,
}: {
  from: Date;
  to: Date;
  logs: Array<{
    createdAt: string;
    status: string;
    responseTimeMs: number;
  }>;
  tools: ObservabilityToolSignal[];
  usageEvents: Array<typeof schema.usageEvent.$inferSelect>;
  tasks: Array<typeof schema.task.$inferSelect>;
}) {
  const bucketCount = 24;
  const rangeMs = Math.max(to.getTime() - from.getTime(), 60 * 1000);
  const bucketMs = Math.ceil(rangeMs / bucketCount);
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    bucket: new Date(from.getTime() + index * bucketMs).toISOString(),
    events: 0,
    successes: 0,
    failures: 0,
    warnings: 0,
    toolCalls: 0,
    failedToolCalls: 0,
    avgResponseTimeMs: 0,
    tokens: 0,
    costUsd: 0,
    tasksCompleted: 0,
    tasksFailed: 0,
    _latencyTotal: 0,
    _latencyCount: 0,
  }));

  logs.forEach((log) => {
    const bucket = buckets[Math.min(bucketFor(log.createdAt, from, bucketMs), bucketCount - 1)];
    bucket.events += 1;
    if (isFailureStatus(log.status)) bucket.failures += 1;
    else if (log.status === 'warning') bucket.warnings += 1;
    else bucket.successes += 1;
    if (log.responseTimeMs > 0) {
      bucket._latencyTotal += log.responseTimeMs;
      bucket._latencyCount += 1;
    }
  });

  tools.forEach((tool) => {
    const bucket = buckets[Math.min(bucketFor(tool.startedAt, from, bucketMs), bucketCount - 1)];
    bucket.toolCalls += 1;
    if (isFailureStatus(tool.status)) bucket.failedToolCalls += 1;
  });

  usageEvents.forEach((event) => {
    const bucket = buckets[Math.min(bucketFor(event.createdAt, from, bucketMs), bucketCount - 1)];
    bucket.tokens += event.totalTokens || 0;
    bucket.costUsd += Number(event.costUsd || 0);
  });

  tasks.forEach((task) => {
    const date = task.actualEnd || task.updatedAt || task.createdAt;
    const bucket = buckets[Math.min(bucketFor(date, from, bucketMs), bucketCount - 1)];
    const status = normalizeStatus(task.status);
    if (status === 'success') bucket.tasksCompleted += 1;
    if (isFailureStatus(status)) bucket.tasksFailed += 1;
  });

  return buckets.map(({ _latencyTotal, _latencyCount, ...bucket }) => ({
    ...bucket,
    avgResponseTimeMs: _latencyCount ? Math.round(_latencyTotal / _latencyCount) : 0,
    costUsd: Number(bucket.costUsd.toFixed(6)),
  }));
}

function buildToolRollups(tools: ObservabilityToolSignal[]) {
  const map = new Map<
    string,
    {
      id: string;
      name: string;
      calls: number;
      successes: number;
      failures: number;
      warnings: number;
      rateLimited: number;
      durations: number[];
      lastCalledAt: string;
    }
  >();

  tools.forEach((tool) => {
    const key = tool.toolId || tool.toolName;
    const existing =
      map.get(key) ||
      {
        id: key,
        name: tool.toolName,
        calls: 0,
        successes: 0,
        failures: 0,
        warnings: 0,
        rateLimited: 0,
        durations: [],
        lastCalledAt: tool.startedAt,
      };
    existing.calls += 1;
    if (isFailureStatus(tool.status)) existing.failures += 1;
    else if (tool.status === 'warning') existing.warnings += 1;
    else existing.successes += 1;
    if (tool.rateLimitHit) existing.rateLimited += 1;
    if (tool.durationMs > 0) existing.durations.push(tool.durationMs);
    if (new Date(tool.startedAt).getTime() > new Date(existing.lastCalledAt).getTime()) {
      existing.lastCalledAt = tool.startedAt;
    }
    map.set(key, existing);
  });

  return Array.from(map.values())
    .map((tool) => ({
      id: tool.id,
      name: tool.name,
      calls: tool.calls,
      successes: tool.successes,
      failures: tool.failures,
      warnings: tool.warnings,
      rateLimited: tool.rateLimited,
      successRate: tool.calls ? Math.round((tool.successes / tool.calls) * 100) : 0,
      avgDurationMs: average(tool.durations),
      p95DurationMs: percentile(tool.durations, 95),
      lastCalledAt: tool.lastCalledAt,
    }))
    .sort((a, b) => b.calls - a.calls);
}

function buildModelRollups(
  events: Array<typeof schema.usageEvent.$inferSelect>,
) {
  const map = new Map<
    string,
    {
      provider: string;
      modelId: string;
      calls: number;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      costUsd: number;
      durations: number[];
    }
  >();

  events.forEach((event) => {
    const key = `${event.provider}:${event.modelId}`;
    const existing =
      map.get(key) ||
      {
        provider: event.provider,
        modelId: event.modelId,
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: 0,
        durations: [],
      };
    existing.calls += 1;
    existing.inputTokens += event.inputTokens || 0;
    existing.outputTokens += event.outputTokens || 0;
    existing.totalTokens += event.totalTokens || 0;
    existing.costUsd += Number(event.costUsd || 0);
    if (event.durationMs) existing.durations.push(event.durationMs);
    map.set(key, existing);
  });

  return Array.from(map.values()).map((model) => ({
    ...model,
    costUsd: Number(model.costUsd.toFixed(6)),
    avgDurationMs: average(model.durations),
  }));
}
