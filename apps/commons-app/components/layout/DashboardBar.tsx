import { Bot, CreditCard, BadgePlus, Wrench, User } from "lucide-react";

import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Button } from "../ui/button";

export function DashboardBar() {
  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-2">
        <h2 className="font-semibold">Commons Studio</h2>
        <Button size="sm">
          <BadgePlus /> <p className="text-sm -ml-1">Create Agent</p>
        </Button>
      </div>
      <Command className="rounded-lg">
        <CommandList>
          <CommandGroup heading="Creations">
            <CommandItem>
              <Bot />
              <span>Agents</span>
            </CommandItem>
            <CommandItem>
              <Wrench />
              <span>Tools</span>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Account">
            <CommandItem>
              <User />
              <span>Profile</span>
            </CommandItem>
            <CommandItem>
              <CreditCard />
              <span>Balances</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  );
}
