"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ToolForm() {
  const handleSubmit = (e: React.FormEvent) => {
    console.log("Form submitted", e);
  };

  return (
    <form onSubmit={handleSubmit} className=" ">
      <div className="w-full mb-2">
        <Label htmlFor="name">Tool Name</Label>
        <Input
          id="name"
          value={""}
          placeholder="My Awesome Tool"
          className="w-full"
        />
      </div>

      <div className="grid gap-2 mb-2">
        <Label htmlFor="persona">Description</Label>
        <Textarea
          id="description"
          value={""}
          placeholder="Describe your tools functionality and purpose..."
          className="min-h-[50px]"
        />
      </div>
      <div>
        <Label htmlFor="custom-json">Custom Tool JSON</Label>
        <Textarea
          id="custom-json"
          placeholder="Paste your custom tool JSON here..."
          value={""}
          className="h-[200px]"
        />
      </div>
    </form>
  );
}
