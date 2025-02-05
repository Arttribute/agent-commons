"use client";

import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@radix-ui/react-scroll-area";

export function InteractionInterface() {
  return (
    <div className="space-y-2 rounded-lg bg-gray-100 p-12 h-[90vh]">
      <ScrollArea className="h-[80%]">
        <p className="text-sm text-gray-600">
          <span className="font-semibold">AI Agent:</span> Hello! How can I help
          you today?
        </p>
      </ScrollArea>
      <div className="">
        <Textarea placeholder="Type your message here..." className="w-full" />
        <Button type="submit" className="w-full mt-2">
          Send
        </Button>
      </div>
    </div>
  );
}
