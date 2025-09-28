import { Skeleton } from "@/components/ui/skeleton";

export function ChatSkeleton() {
  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sidebar Skeleton */}
      <div className="w-[260px] min-w-[260px] h-screen bg-background border-r border-border border-gray-400 flex flex-col">
        {/* Header */}
        <div className="px-3 pt-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="space-y-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
          <Skeleton className="h-5 w-5" />
        </div>

        {/* New Session Button */}
        <div className="px-3 py-2 mt-1">
          <Skeleton className="h-9 w-full rounded-md" />
        </div>

        {/* Navigation */}
        <nav className="mt-2 px-3">
          <div className="space-y-1">
            <div className="flex items-center gap-3 py-2 px-2">
              <Skeleton className="h-5 w-5" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
        </nav>

        {/* Recent Sessions */}
        <div className="mt-6 flex-1 px-3">
          <div className="mb-2">
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="p-2 rounded-md">
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content Skeleton */}
      <div className="flex-1 overflow-y-auto py-4">
        <div className="container mx-auto max-w-2xl space-y-6">
          {/* Chat Messages Skeleton */}
          <div className="space-y-4">
            {/* User message */}
            <div className="flex justify-end">
              <div className="max-w-[80%] space-y-2">
                <Skeleton className="h-4 w-32 ml-auto" />
                <Skeleton className="h-16 w-full rounded-lg" />
              </div>
            </div>

            {/* AI response */}
            <div className="flex justify-start">
              <div className="max-w-[80%] space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-6 w-6 rounded-full" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </div>
            </div>

            {/* Another user message */}
            <div className="flex justify-end">
              <div className="max-w-[80%] space-y-2">
                <Skeleton className="h-4 w-28 ml-auto" />
                <Skeleton className="h-12 w-full rounded-lg" />
              </div>
            </div>

            {/* Another AI response */}
            <div className="flex justify-start">
              <div className="max-w-[80%] space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-6 w-6 rounded-full" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Chat Input Skeleton */}
        <div className="container mx-auto max-w-2xl mt-8">
          <div className="border rounded-lg p-4 space-y-3">
            <Skeleton className="h-20 w-full" />
            <div className="flex justify-between items-center">
              <div className="flex gap-2">
                <Skeleton className="h-8 w-8 rounded" />
                <Skeleton className="h-8 w-8 rounded" />
              </div>
              <Skeleton className="h-8 w-16 rounded" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
