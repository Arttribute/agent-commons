"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, Check } from "lucide-react";

interface JsonEditorProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
}

export function JsonEditor({ value, onChange, label }: JsonEditorProps) {
  const [isValid, setIsValid] = useState(true);

  const handleChange = (newValue: string) => {
    try {
      if (newValue) {
        JSON.parse(newValue);
        setIsValid(true);
      }
      onChange(newValue);
    } catch (e) {
      setIsValid(false);
      onChange(newValue);
      console.error("Invalid JSON:", e);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-muted-foreground">
          {label}
        </label>
        {value && (
          <div className="flex items-center gap-1 text-xs">
            {isValid ? (
              <>
                <Check className="h-3 w-3 text-green-500" />
                <span className="text-green-500">Valid JSON</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-3 w-3 text-red-500" />
                <span className="text-red-500">Invalid JSON</span>
              </>
            )}
          </div>
        )}
      </div>
      <Textarea
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        className="font-mono h-32 resize-none bg-muted"
        placeholder="{}"
      />
    </div>
  );
}
