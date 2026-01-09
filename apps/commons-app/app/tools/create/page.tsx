"use client";
import { CreateToolWizard } from "@/components/tools/create-tool-wizard";
import AppBar from "@/components/layout/app-bar";

export default function Page() {
  return (
    <>
      <AppBar />
      <div className="min-h-screen mt-16">
        <CreateToolWizard />
      </div>
    </>
  );
}
