"use client";

import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@radix-ui/react-scroll-area";
import { parseCustomMarkdown } from "@/lib/parseMarkdown";

export function InteractionInterface() {
  const message =
    'Here is the information about the agents in the system, arranged in JSON format:\n\n```json\n{\n  "agents": [\n    {\n      "id": "0x4e85f5ceb7e9c06c59ad24741631d34abdeea522",\n      "isCommonAgent": true,\n      "metadata": "https://coral-abstract-dolphin-257.mypinata.cloud/ipfs/bafkreiewjk5fizidkxejplpx34fjva7f6i6azcolanwgtzptanhre6twui",\n      "owner": "0xee5eec85c1e21a392433464174f69cf02491b392",\n      "registrationTime": "1738783366",\n      "reputation": "0"\n    },\n    {\n      "id": "0xd9303dfc71728f209ef64dd1ad97f5a557ae0fab",\n      "isCommonAgent": false,\n      "metadata": "",\n      "owner": "0xd9303dfc71728f209ef64dd1ad97f5a557ae0fab",\n      "registrationTime": "1738882662",\n      "reputation": "0"\n    }\n  ]\n}\n```';
  const parsedHTML = parseCustomMarkdown(message);
  return (
    <div className="space-y-2 rounded-lg bg-gray-100 p-12 h-[90vh]">
      <ScrollArea className="h-[80%]">
        <p className="text-sm text-gray-600">
          <span className="font-semibold">AI Agent:</span> Hello! How can I help
          you today?
        </p>
        {/* <div
          className="text-sm md:text-base leading-relaxed"
          dangerouslySetInnerHTML={{ __html: parsedHTML }}
        /> */}
      </ScrollArea>
      <div className="">
        <Textarea placeholder="Type your message here..." className="w-full" />
        <Button type="submit" className="w-full mt-2">
          Send
        </Button>
      </div>
    </div>
  );
}
