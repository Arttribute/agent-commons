import { NextRequest, NextResponse } from "next/server";
import { requireEducator } from "@/lib/educator-auth";
import {
  ensureEducatorCopilotProfile,
  resolveCopilotModel,
  type CopilotUser,
} from "@/lib/educator-copilot-agent";
import EducatorCopilotPreference, {
  type IEducatorCopilotPreference,
} from "@/models/EducatorCopilotPreference";
import User from "@/models/User";

async function loadCopilotUser(sessionUser: {
  userId: string;
  email?: string | null;
  role: "learner" | "educator" | "admin";
}): Promise<CopilotUser> {
  const userDoc = (await User.findById(sessionUser.userId)
    .select("name")
    .lean()) as { name?: string } | null;
  return {
    id: sessionUser.userId,
    email: sessionUser.email,
    name: userDoc?.name,
    role: sessionUser.role,
  };
}

function serializeProfile(profile: IEducatorCopilotPreference, agentReady: boolean) {
  const model = resolveCopilotModel(profile);
  return {
    actionMode: profile.actionMode || "manual",
    agentId: profile.agentId,
    agentReady,
    copilotName: profile.copilotName || "Educator Copilot",
    customInstructions: profile.customInstructions || "",
    modelProvider: profile.modelProvider || "",
    modelId: profile.modelId || "",
    effectiveModel: `${model.provider}/${model.modelId}`,
  };
}

export async function GET(req: NextRequest) {
  const result = await requireEducator();
  if (result.error || !result.session) return result.error;

  const user = await loadCopilotUser(result.session);
  const { profile, client, agentReady } = await ensureEducatorCopilotProfile(user);

  const full = req.nextUrl.searchParams.get("full") === "1";
  if (!full || !client || !profile.agentId) {
    return NextResponse.json({ profile: serializeProfile(profile, agentReady) });
  }

  const [modelsResult, memoryStatsResult] = await Promise.allSettled([
    client.models.list(),
    client.memory.stats(profile.agentId),
  ]);

  return NextResponse.json({
    profile: serializeProfile(profile, agentReady),
    models:
      modelsResult.status === "fulfilled"
        ? (modelsResult.value.data || []).map((model: Record<string, unknown>) => ({
            provider: model.provider,
            modelId: model.modelId || model.id,
            name: model.name || model.modelId || model.id,
          }))
        : [],
    memoryStats:
      memoryStatsResult.status === "fulfilled" ? memoryStatsResult.value.data : null,
  });
}

export async function PATCH(req: NextRequest) {
  const result = await requireEducator();
  if (result.error || !result.session) return result.error;

  const body = (await req.json().catch(() => ({}))) as {
    actionMode?: "manual" | "auto";
    copilotName?: string;
    customInstructions?: string;
    modelProvider?: string;
    modelId?: string;
  };

  const update: Record<string, unknown> = {};
  if (body.actionMode === "auto" || body.actionMode === "manual") {
    update.actionMode = body.actionMode;
  }
  if (typeof body.copilotName === "string") {
    update.copilotName = body.copilotName.trim().slice(0, 60);
  }
  if (typeof body.customInstructions === "string") {
    update.customInstructions = body.customInstructions.trim().slice(0, 6000);
  }
  if (typeof body.modelProvider === "string") {
    update.modelProvider = body.modelProvider.trim().slice(0, 40);
  }
  if (typeof body.modelId === "string") {
    update.modelId = body.modelId.trim().slice(0, 80);
  }

  await EducatorCopilotPreference.findOneAndUpdate(
    { userId: result.session.userId },
    { $set: update },
    { new: true, upsert: true }
  );

  // Re-provision so instruction/model changes reach the platform agent.
  const user = await loadCopilotUser(result.session);
  const { profile, agentReady } = await ensureEducatorCopilotProfile(user);

  return NextResponse.json({ profile: serializeProfile(profile, agentReady) });
}
