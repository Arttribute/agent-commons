"use client";
import { CreateToolWizard } from "@/components/tools/create-tool-wizard";

export default function Page() {
  return (
    <div className="h-screen overflow-hidden">
      <div className="h-screen overflow-y-auto">
        <CreateToolWizard />
      </div>
    </div>
  );
}
