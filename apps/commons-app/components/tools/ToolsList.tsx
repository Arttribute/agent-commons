import * as React from "react";
import ToolCard from "@/components/tools/ToolCard";

export default function ToolList({ tools }: { tools: any }) {
  return (
    <div className="container grid grid-cols-12 gap-3">
      {tools &&
        tools.map((tool: any, index: number) => (
          <div className="col-span-12 lg:col-span-3 " key={index}>
            <ToolCard tool={tool} />
          </div>
        ))}
    </div>
  );
}
