import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
export default function ToolCard({ tool }: { tool: any }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{tool.name}</CardTitle>
        <CardDescription>
          <p>{tool.description}</p>
        </CardDescription>
      </CardHeader>
      <CardContent></CardContent>
      <CardFooter className="flex justify-between"></CardFooter>
    </Card>
  );
}
