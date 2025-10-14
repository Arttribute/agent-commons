"use client";
import Link from "next/link";

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
  const memberCount = space.members ? space.members.length : undefined;
  return (
    <Link
      href={`/spaces/${space.spaceId}`}
      rel="noopener noreferrer"
      className="block border rounded-lg bg-white hover:shadow-sm transition-colors overflow-hidden"
    >
      <div className="w-full h-28 bg-gray-100 overflow-hidden">
        {space.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={space.image}
            alt={space.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200" />
        )}
      </div>
      <div className="p-3 flex items-center justify-between">
        <h3 className="font-medium text-sm truncate max-w-[200px]">
          {space.name}
        </h3>
        {memberCount !== undefined && (
          <span className="text-[10px] text-gray-500">{memberCount} mem</span>
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
