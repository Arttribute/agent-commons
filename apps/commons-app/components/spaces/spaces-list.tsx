"use client";
import { SpaceCard } from "@/components/spaces/space-card";

interface Props {
  spaces: any[];
  emptyMessage?: string;
}

export function SpacesList({ spaces, emptyMessage = "No spaces" }: Props) {
  if (!spaces.length) {
    return (
      <div className="text-xs text-gray-500 border rounded-lg p-6 text-center bg-white">
        {emptyMessage}
      </div>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {spaces.map((s) => (
        <SpaceCard key={s.spaceId} space={s} />
      ))}
    </div>
  );
}
