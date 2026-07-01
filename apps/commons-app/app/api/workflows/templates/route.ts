import { NextRequest, NextResponse } from "next/server";
import {
  buildWorkflowTemplate,
  listWorkflowTemplates,
  type WorkflowTemplateContext,
  type WorkflowTemplateName,
} from "@agent-commons/sdk";
import { backendAuthHeaders } from "@/lib/api-headers";
import { requireCurrentCommonsUser } from "@/lib/current-user";

const baseUrl =
  process.env.NEXT_PUBLIC_NEST_API_BASE_URL ||
  process.env.NEST_API_BASE_URL ||
  process.env.AGENT_COMMONS_API_URL ||
  process.env.NEXT_PUBLIC_AGENT_COMMONS_API_URL;

const templateNames = new Set(listWorkflowTemplates().map((template) => template.name));

function apiUrl(path: string) {
  if (!baseUrl) return null;
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

async function backendJson(path: string, init: RequestInit) {
  const url = apiUrl(path);
  if (!url) {
    return {
      ok: false,
      status: 500,
      data: { error: "Server base URL not configured" },
    };
  }

  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({ error: "Bad JSON" }));
  return { ok: response.ok, status: response.status, data };
}

function unwrapData(payload: any) {
  return payload?.data ?? payload;
}

async function createTemplateWorkflow(params: {
  templateName: WorkflowTemplateName;
  ctx: WorkflowTemplateContext;
  isPublic?: boolean;
  headers: Record<string, string>;
}) {
  const template = buildWorkflowTemplate(params.templateName, params.ctx);
  const toolIds: Record<string, string> = {};
  const createdTools: any[] = [];

  for (const tool of template.tools) {
    const result = await backendJson("/v1/tools", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...params.headers },
      body: JSON.stringify({
        ...tool.payload,
        owner: params.ctx.ownerId,
        ownerType: "user",
      }),
    });

    if (!result.ok) {
      throw new Error(result.data?.message || result.data?.error || "Failed to create template tool");
    }

    const createdTool = unwrapData(result.data);
    toolIds[tool.key] = createdTool.toolId;
    createdTools.push(createdTool);
  }

  const workflowResult = await backendJson("/v1/workflows", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...params.headers },
    body: JSON.stringify({
      name: template.name,
      description: template.description,
      ownerId: params.ctx.ownerId,
      ownerType: "user",
      isPublic: params.isPublic,
      category: template.category,
      tags: template.tags,
      definition: template.buildDefinition(toolIds, params.ctx),
    }),
  });

  if (!workflowResult.ok) {
    throw new Error(workflowResult.data?.message || workflowResult.data?.error || "Failed to create workflow");
  }

  return {
    template,
    workflow: unwrapData(workflowResult.data),
    createdTools,
  };
}

export async function GET() {
  const { user, response } = await requireCurrentCommonsUser();
  if (!user) return response;

  return NextResponse.json({
    templates: listWorkflowTemplates().map((template) => {
      const sample = buildWorkflowTemplate(template.name, {
        ownerId: user.userId,
        prefix: "sample",
      });
      return {
        ...template,
        category: sample.category,
        tags: sample.tags,
        sampleInput: sample.sampleInput,
        toolCount: sample.tools.length,
        requiresAgent:
          template.name === "agent-research-summary" ||
          template.name === "multi-agent-field-report",
        supportsReviewerAgent: template.name === "multi-agent-field-report",
        createsChildWorkflow: template.name === "workflow-invocation-smoke",
      };
    }),
  });
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireCurrentCommonsUser();
  if (!user) return response;
  if (!baseUrl) {
    return NextResponse.json({ error: "Server base URL not configured" }, { status: 500 });
  }

  try {
    const body = await request.json();
    const templateName = body.templateName as WorkflowTemplateName;

    if (!templateNames.has(templateName)) {
      return NextResponse.json({ error: "Unknown workflow template" }, { status: 400 });
    }

    const requiresAgent =
      templateName === "agent-research-summary" ||
      templateName === "multi-agent-field-report";
    if (requiresAgent && !body.agentId) {
      return NextResponse.json({ error: "This workflow template requires an agentId" }, { status: 400 });
    }

    const prefix =
      body.prefix ||
      `studio_${templateName.replace(/[^a-z0-9]+/gi, "_")}_${Date.now().toString(36)}`;
    const headers = await backendAuthHeaders({ allowServiceKey: true });

    let childWorkflowId = body.childWorkflowId as string | undefined;
    let childResult: any | undefined;

    if (templateName === "workflow-invocation-smoke" && !childWorkflowId) {
      childResult = await createTemplateWorkflow({
        templateName: "country-weather-brief",
        ctx: {
          ownerId: user.userId,
          prefix: `${prefix}_child`,
        },
        isPublic: body.isPublic,
        headers,
      });
      childWorkflowId = childResult.workflow.workflowId;
    }

    const result = await createTemplateWorkflow({
      templateName,
      ctx: {
        ownerId: user.userId,
        prefix,
        agentId: body.agentId,
        reviewerAgentId: body.reviewerAgentId,
        childWorkflowId,
      },
      isPublic: body.isPublic,
      headers,
    });

    let execution: any | undefined;
    if (body.run) {
      const inputData = body.inputData ?? result.template.sampleInput;
      const executionResult = await backendJson(`/v1/workflows/${result.workflow.workflowId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          agentId: body.agentId,
          inputData,
          userId: user.userId,
        }),
      });
      if (!executionResult.ok) {
        throw new Error(executionResult.data?.message || executionResult.data?.error || "Failed to run workflow");
      }
      execution = unwrapData(executionResult.data);
    }

    return NextResponse.json({
      ...result,
      child: childResult,
      execution,
    });
  } catch (error: any) {
    console.error("Error creating workflow template", error);
    return NextResponse.json(
      { error: error.message || "Failed to create workflow template" },
      { status: 500 },
    );
  }
}
