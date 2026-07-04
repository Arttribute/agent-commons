"use client";

import { memo } from "react";
import {
  EdgeProps,
  getBezierPath,
  EdgeLabelRenderer,
  BaseEdge,
} from "reactflow";

export const ColoredEdge = memo(
  ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    markerEnd,
  }: EdgeProps) => {
    const [edgePath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });

    const color = data?.color || "#6b7280";
    // Blend from the source port's color into the target port's color;
    // older saved edges only carry a single color, so fall back to it.
    const sourceColor = data?.sourceColor || color;
    const targetColor = data?.targetColor || color;
    const dataType = data?.dataType || "any";
    const gradientId = `edge-gradient-${id}`;

    return (
      <>
        {sourceColor !== targetColor && (
          <defs>
            <linearGradient
              id={gradientId}
              gradientUnits="userSpaceOnUse"
              x1={sourceX}
              y1={sourceY}
              x2={targetX}
              y2={targetY}
            >
              <stop offset="0%" stopColor={sourceColor} />
              <stop offset="100%" stopColor={targetColor} />
            </linearGradient>
          </defs>
        )}
        <BaseEdge
          id={id}
          path={edgePath}
          markerEnd={markerEnd}
          style={{
            stroke:
              sourceColor !== targetColor ? `url(#${gradientId})` : sourceColor,
            strokeWidth: 1.75,
            opacity: 0.85,
          }}
        />
        {dataType !== "any" && (
          <EdgeLabelRenderer>
            <div
              style={{
                position: "absolute",
                transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                pointerEvents: "all",
              }}
              className="nodrag nopan"
            >
              <div className="flex items-center gap-1 rounded-full border border-border/70 bg-background/95 px-2 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm backdrop-blur-sm">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    background:
                      sourceColor !== targetColor
                        ? `linear-gradient(90deg, ${sourceColor}, ${targetColor})`
                        : sourceColor,
                  }}
                />
                {dataType}
              </div>
            </div>
          </EdgeLabelRenderer>
        )}
      </>
    );
  }
);

ColoredEdge.displayName = "ColoredEdge";
