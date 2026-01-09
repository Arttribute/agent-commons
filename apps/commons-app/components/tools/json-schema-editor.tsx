"use client";

import { useState, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AlertCircle, Check, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface JsonSchemaEditorProps {
  value: any;
  onChange: (value: any) => void;
  label?: string;
  placeholder?: string;
  height?: string;
  className?: string;
}

export function JsonSchemaEditor({
  value,
  onChange,
  label = "JSON Schema",
  placeholder = "Enter JSON schema...",
  height = "h-[300px]",
  className,
}: JsonSchemaEditorProps) {
  const [textValue, setTextValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isValid, setIsValid] = useState(true);

  // Initialize text value from prop
  useEffect(() => {
    if (value) {
      try {
        setTextValue(JSON.stringify(value, null, 2));
        setError(null);
        setIsValid(true);
      } catch (e) {
        setTextValue(String(value));
      }
    } else {
      setTextValue("");
    }
  }, []);

  const validateAndUpdate = (text: string) => {
    setTextValue(text);

    if (!text.trim()) {
      setError(null);
      setIsValid(true);
      onChange(null);
      return;
    }

    try {
      const parsed = JSON.parse(text);
      setError(null);
      setIsValid(true);
      onChange(parsed);
    } catch (e: any) {
      setError(e.message);
      setIsValid(false);
    }
  };

  const formatJson = () => {
    try {
      const parsed = JSON.parse(textValue);
      const formatted = JSON.stringify(parsed, null, 2);
      setTextValue(formatted);
      setError(null);
      setIsValid(true);
      onChange(parsed);
    } catch (e: any) {
      setError(e.message);
      setIsValid(false);
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          {label}
          {isValid && textValue.trim() && (
            <Check className="h-4 w-4 text-green-500" />
          )}
          {!isValid && textValue.trim() && (
            <AlertCircle className="h-4 w-4 text-red-500" />
          )}
        </Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={formatJson}
          disabled={!textValue.trim() || !isValid}
        >
          <Wand2 className="h-4 w-4 mr-2" />
          Format
        </Button>
      </div>

      <Textarea
        value={textValue}
        onChange={(e) => validateAndUpdate(e.target.value)}
        placeholder={placeholder}
        className={cn(
          height,
          "font-mono text-sm",
          !isValid && "border-red-500 focus-visible:ring-red-500"
        )}
      />

      {error && (
        <div className="flex items-start gap-2 text-sm text-red-500">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
