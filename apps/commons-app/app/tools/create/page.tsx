"use client";
import { CreateToolWizard } from "@/components/tools/create-tool-wizard";
import AppBar from "@/components/layout/app-bar";

export default function Page() {
  return (
    <div className="h-screen overflow-hidden">
      <AppBar />
      <div className="h-[calc(100vh-64px)] mt-16 overflow-y-auto">
        <CreateToolWizard />
      </div>
    </div>
  );
}
