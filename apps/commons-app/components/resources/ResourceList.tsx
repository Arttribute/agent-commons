import * as React from "react";
import ResourceCard from "@/components/resources/ResourceCard";
import { Resource } from "@/types/agent";

export default function ResourceList({ resources }: { resources: Resource[] }) {
  return (
    <div className="container grid grid-cols-10 gap-3">
      {resources &&
        resources.map((resource: Resource, index: number) => (
          <div className="col-span-10 lg:col-span-2 " key={index}>
            <ResourceCard resource={resource} />
          </div>
        ))}
    </div>
  );
}
