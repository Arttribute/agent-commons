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
    const dataType = data?.dataType || "any";

    return (
      <>
        <BaseEdge
          id={id}
          path={edgePath}
          markerEnd={markerEnd}
          style={{
            stroke: color,
            strokeWidth: 2,
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
              <div
                className="px-2 py-0.5 rounded text-xs font-medium bg-white border shadow-sm"
                style={{
                  borderColor: color,
                  color: color,
                }}
              >
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
