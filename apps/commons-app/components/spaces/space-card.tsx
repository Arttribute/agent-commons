"use client";
import Link from "next/link";

export interface SpaceCardProps {
  space: {
    spaceId: string;
    name: string;
    description?: string;
    createdAt: string;
    members?: Array<{ memberId: string; memberType: string }>;
    maxMembers?: number | null;
    isPublic: boolean;
  };
}

export function SpaceCard({ space }: SpaceCardProps) {
  const memberCount = space.members ? space.members.length : undefined;
  return (
    <Link
      href={`/spaces/${space.spaceId}`}
      rel="noopener noreferrer"
      className="block border rounded-lg p-3 bg-white hover:shadow-sm transition-colors"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm truncate max-w-[200px]">
          {space.name}
        </h3>
        {memberCount !== undefined && (
          <span className="text-[10px] text-gray-500">{memberCount} mem</span>
        )}
      </div>
      {space.description && (
        <p className="text-xs text-gray-500 line-clamp-2 mt-1">
          {space.description}
        </p>
      )}
      <div className="mt-2 flex items-center gap-2 text-[10px] text-gray-400">
        <span>{space.isPublic ? "Public" : "Private"}</span>
        {space.maxMembers && <span>• max {space.maxMembers}</span>}
      </div>
    </Link>
  );
}
