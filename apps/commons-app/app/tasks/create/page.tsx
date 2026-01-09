"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function CreateTaskPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to studio tasks page
    router.replace("/studio/tasks");
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-gray-500" />
        <p className="text-sm text-gray-500">Redirecting to tasks...</p>
      </div>
    </div>
  );
}
