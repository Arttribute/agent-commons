import { User } from "lucide-react";
import { cn } from "@/lib/utils";

interface InitiatorMessageProps {
  message: string;
  timestamp: string;
}

export default function InitiatorMessage({
  message,
  timestamp,
}: InitiatorMessageProps) {
  return (
    <div className="flex items-start gap-2 justify-end">
      <div className="rounded-lg p-3 max-w-[80%] bg-blue-100 dark:bg-blue-900">
        <p className="text-sm">{message}</p>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {new Date(timestamp).toLocaleTimeString()}
        </span>
      </div>
      <div className="bg-blue-100 dark:bg-blue-900 p-1 rounded">
        <User className="h-4 w-4 text-blue-500" />
      </div>
    </div>
  );
}
