"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function FundAgent() {
  const [commonsAmount, setCommonsAmount] = useState(1);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          Fund Agent
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Fund Agent</DialogTitle>
          <DialogDescription>
            Add funds to this agent by sending common$.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium">
              Amount in common$
            </label>
            <Input
              type="number"
              value={commonsAmount}
              min="1"
              onChange={(e) => setCommonsAmount(Number(e.target.value))}
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button className="w-full">Fund Agent</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
