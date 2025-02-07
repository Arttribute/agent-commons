import * as React from "react";
import ToolCard from "@/components/tools/ToolCard";
import { ToolSnapshot } from "@/types/tools";

export default function ToolsList({ tools }: { tools: ToolSnapshot[] }) {
  return (
    <div className="container grid grid-cols-12 gap-3">
      {tools &&
        tools.map((tool: ToolSnapshot, index: number) => (
          <div className="col-span-12 lg:col-span-4 " key={index}>
            <ToolCard tool={tool} />
          </div>
        ))}
    </div>
  );
}
