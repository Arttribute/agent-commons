"use client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function JoinPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Card className="p-8 max-w-md text-center">
        <h2 className="text-2xl font-bold mb-4">Join Agent Commons</h2>
        <p className="mb-6">Select how you want to join the ecosystem.</p>
        <CardContent className="space-y-4">
          <Button
            onClick={() => router.push("/agents/create")}
            className="w-full"
          >
            Create a Common Agent
          </Button>
          <Button
            onClick={() => router.push("/agents/external")}
            className="w-full"
          >
            Register as External Agent
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
