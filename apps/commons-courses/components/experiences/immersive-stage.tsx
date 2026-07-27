"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { MapPin, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { createDefaultStage } from "@/lib/experience-schema";
import type {
  ExperienceDocument,
  ExperienceScene,
  ExperienceShot,
  ExperienceStage,
  ExperienceStageActor,
  ExperienceStageLayer,
} from "@/types/experience";

const Experience3DStage = dynamic(
  () =>
    import("@/components/experiences/experience-3d-stage").then(
      (module) => module.Experience3DStage,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 animate-pulse bg-slate-950" />
    ),
  },
);

export function ImmersiveStage({
  document,
  scene,
  shot,
  muted,
}: {
  document: ExperienceDocument;
  scene: ExperienceScene;
  shot?: ExperienceShot;
  muted: boolean;
}) {
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [reducedMotion, setReducedMotion] = useState(false);
  const location = document.world.locations.find(
    (candidate) =>
      candidate.id ===
      (scene.stage?.locationId ||
        scene.locationId ||
        document.world.startLocationId),
  );
  const locationBackground = document.assets.find(
    (asset) => asset.id === location?.backgroundAssetId,
  );
  const stage = scene.stage || createDefaultStage(scene.locationId, scene.backgroundUrl);
  const camera = { ...stage.camera, ...(shot?.camera || {}) };
  const layers = useMemo(() => {
    const values = [...stage.layers];
    if (!values.length && (scene.backgroundUrl || locationBackground?.url)) {
      values.push({
        id: "resolved-location-background",
        name: location?.name || "Location background",
        kind: "image",
        url: scene.backgroundUrl || locationBackground?.url,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        depth: -20,
        opacity: 1,
        parallax: 0.08,
        fit: "cover",
        blendMode: "normal",
        animation: "ken-burns",
      });
    }
    return values.sort((a, b) => a.depth - b.depth);
  }, [location?.name, locationBackground?.url, scene.backgroundUrl, stage.layers]);
  const actors =
    shot?.actors?.length
      ? shot.actors
      : stage.actors.length
        ? stage.actors
        : scene.characterId
          ? [defaultActor(scene.characterId)]
          : [];

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return (
    <div
      className="absolute inset-0 overflow-hidden bg-slate-950"
      onPointerMove={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        setPointer({
          x: (event.clientX - bounds.left) / bounds.width - 0.5,
          y: (event.clientY - bounds.top) / bounds.height - 0.5,
        });
      }}
      onPointerLeave={() => setPointer({ x: 0, y: 0 })}
    >
      {stage.mode === "3d" || stage.mode === "hybrid" ? (
        <div className="absolute inset-0">
          <Experience3DStage
            stage={stage}
            assets={document.assets}
            reducedMotion={reducedMotion}
          />
        </div>
      ) : null}

      {stage.mode === "2d" || stage.mode === "hybrid"
        ? layers.map((layer) => (
            <Layer
              key={layer.id}
              layer={layer}
              document={document}
              camera={camera}
              pointer={pointer}
              reducedMotion={reducedMotion}
            />
          ))
        : null}

      {actors.map((actor) => {
        const character = document.characters.find(
          (candidate) => candidate.id === actor.characterId,
        );
        if (!character) return null;
        const portrait = document.assets.find(
          (asset) => asset.id === character.portraitAssetId,
        );
        const imageUrl = portrait?.url || character.imageUrl;
        return (
          <div
            key={`${actor.characterId}-${actor.pose || "default"}`}
            className={cn(
              "pointer-events-none absolute origin-bottom transition-[left,top,transform] duration-700 ease-out",
              !reducedMotion &&
                actor.entrance &&
                actor.entrance !== "none" &&
                `experience-actor-${actor.entrance}`,
            )}
            style={{
              left: `${actor.x}%`,
              top: `${actor.y}%`,
              zIndex: 30 + actor.depth,
              transform: `translate(-50%, -100%) scale(${actor.flip ? -actor.scale : actor.scale}, ${actor.scale})`,
            }}
          >
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt=""
                className="max-h-[78dvh] w-auto max-w-[44vw] object-contain drop-shadow-[0_30px_34px_rgba(0,0,0,0.62)]"
              />
            ) : (
              <div
                className="flex h-56 w-40 items-center justify-center rounded-[48%_48%_26%_26%] border border-white/20 text-5xl font-black text-slate-950 shadow-2xl"
                style={{ background: character.accent }}
              >
                {character.name.slice(0, 1)}
              </div>
            )}
          </div>
        );
      })}

      <Weather
        kind={stage.effects.weather}
        intensity={stage.effects.intensity}
        reducedMotion={reducedMotion}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle at 50% 40%, transparent 28%, rgba(0,0,0,${stage.effects.vignette}) 110%)`,
          zIndex: 80,
        }}
      />
      {stage.effects.grain > 0 ? (
        <div
          className="experience-grain pointer-events-none absolute inset-[-30%]"
          style={{ opacity: stage.effects.grain, zIndex: 81 }}
        />
      ) : null}

      {(scene.missionLabel || scene.objective) && (
        <div className="pointer-events-none absolute left-5 top-20 z-[90] max-w-[min(320px,70vw)] rounded-2xl border border-white/15 bg-slate-950/68 p-3 text-white shadow-2xl backdrop-blur-xl sm:left-7 sm:top-24">
          <p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.18em] text-white/45">
            <Target className="h-3.5 w-3.5 text-lime-300" />
            {scene.missionLabel || "Current objective"}
          </p>
          {scene.objective ? (
            <p className="mt-1.5 text-xs font-bold leading-5">{scene.objective}</p>
          ) : null}
          {location ? (
            <p className="mt-2 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-white/40">
              <MapPin className="h-3 w-3" />
              {location.name}
            </p>
          ) : null}
        </div>
      )}

      <SceneAudio
        document={document}
        locationId={stage.locationId || scene.locationId}
        muted={muted}
      />
    </div>
  );
}

function Layer({
  layer,
  document,
  camera,
  pointer,
  reducedMotion,
}: {
  layer: ExperienceStageLayer;
  document: ExperienceDocument;
  camera: Pick<ExperienceStage["camera"], "x" | "y" | "zoom" | "rotation">;
  pointer: { x: number; y: number };
  reducedMotion: boolean;
}) {
  const asset = document.assets.find((candidate) => candidate.id === layer.assetId);
  const url = asset?.url || layer.url;
  const transform = [
    `translate(${layer.x - camera.x + pointer.x * layer.parallax * -7}%, ${layer.y - camera.y + pointer.y * layer.parallax * -7}%)`,
    `scale(${camera.zoom})`,
    `rotate(${camera.rotation}deg)`,
  ].join(" ");
  const style = {
    width: `${layer.width}%`,
    height: `${layer.height}%`,
    opacity: layer.opacity,
    zIndex: 10 + layer.depth,
    transform,
    mixBlendMode: layer.blendMode,
  } as React.CSSProperties;
  const className = cn(
    "pointer-events-none absolute left-0 top-0 origin-center will-change-transform",
    !reducedMotion &&
      layer.animation !== "none" &&
      `experience-layer-${layer.animation}`,
  );

  if (layer.kind === "image" && url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className={className}
        style={{ ...style, objectFit: layer.fit }}
      />
    );
  }
  if (layer.kind === "video" && url) {
    return (
      <video
        src={url}
        muted
        autoPlay
        playsInline
        loop
        className={className}
        style={{ ...style, objectFit: layer.fit }}
      />
    );
  }
  if (layer.kind === "particles") {
    return (
      <div
        className={cn(className, "experience-particle-field")}
        style={{
          ...style,
          color: layer.color || document.theme.accent,
        }}
      />
    );
  }
  return (
    <div
      className={className}
      style={{
        ...style,
        background:
          layer.kind === "gradient"
            ? `linear-gradient(145deg, ${layer.color || document.theme.background}, ${document.theme.accent}55)`
            : layer.color || document.theme.background,
      }}
    />
  );
}

function Weather({
  kind,
  intensity,
  reducedMotion,
}: {
  kind: NonNullable<ExperienceScene["stage"]>["effects"]["weather"];
  intensity: number;
  reducedMotion: boolean;
}) {
  if (kind === "none" || intensity <= 0) return null;
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 z-[70]",
        `experience-weather-${kind}`,
        reducedMotion && "experience-weather-static",
      )}
      style={{ opacity: Math.max(0.12, intensity) }}
    />
  );
}

function SceneAudio({
  document,
  locationId,
  muted,
}: {
  document: ExperienceDocument;
  locationId?: string;
  muted: boolean;
}) {
  const location = document.world.locations.find(
    (candidate) => candidate.id === locationId,
  );
  const audio = document.assets.find(
    (asset) => asset.id === location?.ambientAudioAssetId,
  );
  if (!audio?.url) return null;
  return <audio src={audio.url} autoPlay loop muted={muted} preload="metadata" />;
}

function defaultActor(characterId: string): ExperienceStageActor {
  return {
    characterId,
    x: 24,
    y: 101,
    scale: 1,
    depth: 5,
    entrance: "rise",
  };
}
