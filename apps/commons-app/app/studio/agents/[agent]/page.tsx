// pages/index.jsx
import { InteractionInterface } from "@/components/agents/InteractionInterface.";
import { Presets } from "@/components/agents/Presets";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function () {
  return (
    <div>
      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-3"></div>
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
