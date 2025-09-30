import { User } from "lucide-react";
import { cn } from "@/lib/utils";

interface InitiatorMessageProps {
  message: string;
  timestamp: string;
  bgColor?: string;
}

export default function InitiatorMessage({
  message,
  timestamp,
  bgColor,
}: InitiatorMessageProps) {
  return (
    <div className="flex rounded-xl justify-end">
      <div
        className={`rounded-xl ${bgColor || "bg-indigo-100"} my-4 ml-4  p-4`}
      >
        <p className="text-sm">{message}</p>
      </div>
    </div>
  );
}
