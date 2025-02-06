// pages/index.jsx
import { InteractionInterface } from "@/components/agents/InteractionInterface.";
import { Presets } from "@/components/agents/Presets";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FundAgent } from "@/components/agents/FundAgent";

export default function () {
  const walletAddress = "0xD9303DFc71728f209EF64DD1AD97F5a557AE0Fab";
  const formattedAddress = `${walletAddress.slice(0, 7)}...${walletAddress.slice(-5)}`;

  return (
    <div>
      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-3">
          <div className="flex ">
            <Avatar className="h-16 w-16 m-2">
              <AvatarImage src="https://github.com/shadcn.png" />
              <AvatarFallback>JD</AvatarFallback>
            </Avatar>
            <div className="flex flex-col justify-center">
              <h1 className="text-2xl font-bold">John Doe</h1>
              <div className="flex items-center gap-2 bg-gray-100 p-2 rounded-3xl w-52">
                <p className="text-gray-500 text-sm">{formattedAddress}</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-2 m-4 border p-2 rounded-lg">
            <div className="col-span-4 flex items-center">
              <p className="text-lg font-semibold text-gray-800 ml-2">
                Common$ 0.00{" "}
              </p>
            </div>
            <div className="col-span-3">
              <FundAgent />
            </div>
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
