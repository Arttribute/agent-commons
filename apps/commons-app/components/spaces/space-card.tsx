"use client";
import Link from "next/link";
import {
  getIntenseGradientForKey,
  getShapesForKey,
} from "@/lib/gradient-utils";
import RandomAvatar from "@/components/account/random-avatar";

export interface SpaceCardProps {
  space: {
    spaceId: string;
    name: string;
    description?: string;
    image?: string;
    createdAt: string;
    members?: Array<{ memberId: string; memberType: string }>;
    maxMembers?: number | null;
    isPublic: boolean;
  };
}

export function SpaceCard({ space }: SpaceCardProps) {
  // Use intense gradient for more vibrant space cards
  const gradient = getIntenseGradientForKey(space.spaceId);
  // Generate random shapes for visual interest
  const shapes = getShapesForKey(space.spaceId, 4);
  const memberCount = space.members ? space.members.length : undefined;
  return (
    <Link
      href={`/spaces/${space.spaceId}`}
      rel="noopener noreferrer"
      className="block border border-gray-400 rounded-lg bg-white hover:shadow-sm transition-colors overflow-hidden"
    >
      <div className="relative w-full h-16 bg-gray-50 overflow-hidden">
        {space.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={space.image}
            alt={space.name}
            className="w-full h-full object-cover scale-105"
          />
        ) : (
          <>
            {/* Intense gradient background */}
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(135deg, ${gradient.from} 0%, ${gradient.via} 50%, ${gradient.to} 100%)`,
              }}
            />

            {/* Random geometric shapes */}
            {shapes.map((shape, idx) => {
              const shapeStyle = {
                position: "absolute" as const,
                left: `${shape.x}%`,
                top: `${shape.y}%`,
                width: `${shape.size}px`,
                height: `${shape.size}px`,
                transform: `rotate(${shape.rotation}deg)`,
                opacity: shape.opacity,
              };

              if (shape.type === "circle") {
                return (
                  <div
                    key={idx}
                    className="rounded-full bg-white/30 backdrop-blur-sm"
                    style={shapeStyle}
                  />
                );
              } else if (shape.type === "square") {
                return (
                  <div
                    key={idx}
                    className="bg-white/30 backdrop-blur-sm rounded-sm"
                    style={shapeStyle}
                  />
                );
              } else {
                // Triangle using border trick
                return (
                  <div
                    key={idx}
                    className="bg-transparent"
                    style={{
                      ...shapeStyle,
                      width: 0,
                      height: 0,
                      borderLeft: `${shape.size / 2}px solid transparent`,
                      borderRight: `${shape.size / 2}px solid transparent`,
                      borderBottom: `${shape.size}px solid rgba(255, 255, 255, ${shape.opacity})`,
                    }}
                  />
                );
              }
            })}
          </>
        )}
        {/* Soft white overlay to reduce visual weight slightly */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/40 via-white/20 to-transparent" />
      </div>
      <div className="p-3 flex items-center justify-between">
        <h3 className="font-medium text-sm truncate max-w-[200px]">
          {space.name}
        </h3>
        {memberCount !== undefined && (
          <div className="flex items-center gap-2">
            {/* Stacked member avatars */}
            <div className="flex -space-x-3">
              {(space.members || []).slice(0, 3).map((m, idx) => (
                <div
                  key={`${m.memberType}-${m.memberId}-${idx}`}
                  className="inline-flex items-center justify-center rounded-full shadow-sm transition-transform hover:scale-110 hover:z-10 border border-gray-400 bg-white p-0.5"
                  style={{ width: 26, height: 26, zIndex: 3 - idx }}
                >
                  <RandomAvatar username={m.memberId} size={20} />
                </div>
              ))}
            </div>
            <span className="text-xs font-medium text-gray-600 min-w-[1.5ch] text-right">
              {memberCount}
            </span>
          </div>
        )}
      </div>
      {space.description && (
        <p className="px-3 text-xs text-gray-500 line-clamp-2">
          {space.description}
        </p>
      )}
      <div className="px-3 pb-3 mt-2 flex items-center gap-2 text-[10px] text-gray-400">
        <span>{space.isPublic ? "Public" : "Private"}</span>
        {space.maxMembers && <span>• max {space.maxMembers}</span>}
      </div>
    </Link>
  );
}
