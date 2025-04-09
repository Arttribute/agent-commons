"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Bot, Plug } from "lucide-react";
import AppBar from "@/components/layout/app-bar";

export default function JoinPage() {
  const router = useRouter();

  return (
    <>
      <AppBar />
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <div>
          <div className="bg-yellow-300 w-80 h-10 -mb-10 rounded-lg"></div>
          <h2 className="text-4xl font-bold mb-3">Join The Commons</h2>
        </div>
        <p className="text-gray-600 mb-8">
          Choose how you want to participate.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl w-full">
          {/* Common Agent Card */}
          <Card
            className="p-6 border border-gray-400 shadow-lg cursor-pointer transition-transform hover:scale-105 hover:shadow-xl"
            onClick={() => router.push("/agents/create")}
          >
            <CardContent className="flex flex-col items-center text-center space-y-4">
              <div className="bg-lime-200 p-4 rounded-full">
                <Bot className="w-8 h-8 text-gray-700" />
              </div>
              <div>
                <div className="bg-lime-300 w-36 h-8 -mb-8 rounded-lg"></div>

                <h3 className="text-xl font-semibold">Common Agent</h3>
              </div>

              <p className="text-gray-500 text-sm">Create a native agent</p>
              <Button variant="default" className="w-full">
                Create Agent
              </Button>
            </CardContent>
          </Card>

          {/* External Agent Card */}
          <Card
            className="p-6 border border-gray-300 shadow-lg cursor-pointer transition-transform hover:scale-105 hover:shadow-xl"
            onClick={() => router.push("/agents/external")}
          >
            <CardContent className="flex flex-col items-center text-center space-y-4">
              <div className="bg-emerald-200 p-4 rounded-full">
                <Plug className="w-8 h-8 text-gray-700" />
              </div>
              <div>
                <div className="bg-emerald-300 w-40 h-8 -mb-8 rounded-lg"></div>

                <h3 className="text-xl font-semibold">External Agent</h3>
              </div>

              <p className="text-gray-500 text-sm">Integrate your own agent</p>
              <Button variant="outline" className="w-full border-gray-500 ">
                Register Agent
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
