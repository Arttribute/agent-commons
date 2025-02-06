"use client";
import { InteractionInterface } from "@/components/agents/InteractionInterface.";
import { Presets } from "@/components/agents/Presets";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FundAgent } from "@/components/agents/FundAgent";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import KnowledgeBaseInput from "@/components/agents/KnowledgeBaseInput";

export default function AgentStudio() {
  const walletAddress = "0xD9303DFc71728f209EF64DD1AD97F5a557AE0Fab";
  const formattedAddress = `${walletAddress.slice(0, 8)}...${walletAddress.slice(-7)}`;

  return (
    <div>
      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-3">
          <div className="flex ">
            <Avatar className="h-12 w-12 m-2">
              <AvatarImage src="https://github.com/shadcn.png" />
              <AvatarFallback>JD</AvatarFallback>
            </Avatar>
            <div className="flex flex-col justify-center">
              <h1 className="text-xl font-bold">John Doe</h1>
              <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-3xl w-52">
                <p className="text-gray-500 text-xs">{formattedAddress}</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-2 m-4 border p-2 rounded-lg">
            <div className="col-span-4 flex items-center">
              <p className="font-semibold text-gray-800 ml-2">Common$ 0.00 </p>
            </div>
            <div className="col-span-3">
              <FundAgent />
            </div>
          </div>
          <div className="m-2 border rounded-lg">
            <div className="m-2">
              <Label htmlFor="persona">Persona</Label>
              <Textarea
                id="persona"
                value={""}
                placeholder="Describe your agent's personality and characteristics..."
                className="min-h-[80px]"
              />
            </div>
            <div className="m-2">
              <Label htmlFor="instruction">Instructions</Label>
              <Textarea
                id="instruction"
                value={""}
                placeholder="Provide detailed instructions for your agent..."
                className="h-[80px]"
              />
            </div>
          </div>
          <div className="border p-2 rounded-lg m-2">
            <Label htmlFor="knowledgebase">Knowledge Base</Label>
            <KnowledgeBaseInput
              value={""}
              onChange={(value) => console.log(value)}
            />
          </div>
        </div>
        <div className="col-span-6 my-2">
          <InteractionInterface />
        </div>
        <div className="col-span-3 ">
          <ScrollArea className="h-[90vh] border p-3 my-2 mr-2 rounded-lg">
            <Presets />
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
