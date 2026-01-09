"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface KeyValuePair {
  key: string;
  value: string;
}

interface KeyValueEditorProps {
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  className?: string;
  minRows?: number;
}

export function KeyValueEditor({
  value = {},
  onChange,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
  className,
  minRows = 1,
}: KeyValueEditorProps) {
  const pairs: KeyValuePair[] = Object.entries(value).map(([key, val]) => ({
    key,
    value: val,
  }));

  // Ensure minimum number of empty rows
  const displayPairs = [...pairs];
  while (displayPairs.length < minRows) {
    displayPairs.push({ key: "", value: "" });
  }

  // Add empty row if all rows are filled
  if (displayPairs.length === 0 || displayPairs.every((p) => p.key || p.value)) {
    displayPairs.push({ key: "", value: "" });
  }

  const updatePair = (index: number, field: "key" | "value", newValue: string) => {
    const newPairs = [...displayPairs];
    newPairs[index] = { ...newPairs[index], [field]: newValue };

    // Convert to object, filtering out empty pairs
    const newObj: Record<string, string> = {};
    newPairs.forEach((pair) => {
      if (pair.key.trim()) {
        newObj[pair.key.trim()] = pair.value;
      }
    });

    onChange(newObj);
  };

  const removePair = (index: number) => {
    const pairToRemove = displayPairs[index];
    if (pairToRemove.key) {
      const newObj = { ...value };
      delete newObj[pairToRemove.key];
      onChange(newObj);
    }
  };

  const addNewPair = () => {
    // Just trigger a re-render by setting a dummy value
    // The component will automatically show a new empty row
    onChange(value);
  };

  return (
    <div className={cn("space-y-2", className)}>
      {displayPairs.map((pair, index) => (
        <div key={index} className="flex gap-2 items-center">
          <Input
            placeholder={keyPlaceholder}
            value={pair.key}
            onChange={(e) => updatePair(index, "key", e.target.value)}
            className="flex-1"
          />
          <Input
            placeholder={valuePlaceholder}
            value={pair.value}
            onChange={(e) => updatePair(index, "value", e.target.value)}
            className="flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => removePair(index)}
            disabled={!pair.key && !pair.value}
            className="shrink-0"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addNewPair}
        className="w-full"
      >
        <Plus className="h-4 w-4 mr-2" />
        Add Row
      </Button>
    </div>
  );
}
