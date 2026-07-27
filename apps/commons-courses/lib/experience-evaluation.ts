import type { ExperienceScene } from "@/types/experience";

export type ExperienceInteractionAnswer = {
  itemIds?: string[];
  placements?: Record<string, string>;
  order?: string[];
};

export type ExperienceSceneEvaluation = {
  correct: boolean;
  nextSceneId?: string;
};

export function evaluateExperienceScene(
  scene: ExperienceScene,
  answerId?: string,
  answer?: ExperienceInteractionAnswer,
): ExperienceSceneEvaluation {
  if (scene.type === "choice") {
    const choice = scene.choices?.find((item) => item.id === answerId);
    return { correct: Boolean(choice), nextSceneId: choice?.nextSceneId };
  }
  if (scene.type === "quiz") {
    const option = scene.options?.find((item) => item.id === answerId);
    return {
      correct: Boolean(option?.correct),
      nextSceneId: option?.correct ? scene.nextSceneId : undefined,
    };
  }
  if (scene.type === "hotspot") {
    const hotspot = scene.hotspots?.find((item) => item.id === answerId);
    return {
      correct: Boolean(hotspot?.correct),
      nextSceneId: hotspot?.correct ? scene.nextSceneId : undefined,
    };
  }
  if (scene.type === "collect") {
    const collected = new Set(answer?.itemIds || []);
    const correct =
      Boolean(scene.items?.length) &&
      scene.items!.every((item) => collected.has(item.id));
    return {
      correct,
      nextSceneId: correct ? scene.nextSceneId : undefined,
    };
  }
  if (scene.type === "sort" || scene.type === "match") {
    const placements = answer?.placements || {};
    const correct =
      Boolean(scene.items?.length) &&
      scene.items!.every(
        (item) => item.targetId && placements[item.id] === item.targetId,
      );
    return {
      correct,
      nextSceneId: correct ? scene.nextSceneId : undefined,
    };
  }
  if (scene.type === "sequence") {
    const order = answer?.order || [];
    const correct =
      order.length === (scene.items?.length || 0) &&
      scene.items?.every((item, index) => order[index] === item.id);
    return {
      correct: Boolean(correct),
      nextSceneId: correct ? scene.nextSceneId : undefined,
    };
  }
  return { correct: true, nextSceneId: scene.nextSceneId };
}
