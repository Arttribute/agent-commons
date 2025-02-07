import * as React from "react";
import ResourceCard from "@/components/resources/ResourceCard";

export default function ResourceList({ resources }: { resources: any }) {
  return (
    <div className="container grid grid-cols-10 gap-3">
      {resources &&
        resources.map((resource: any, index: number) => (
          <div className="col-span-10 lg:col-span-2 " key={index}>
            <ResourceCard resource={resource} />
          </div>
        ))}
    </div>
  );
}
