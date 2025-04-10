"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

interface TagInputProps {
  tags: string[];
  setTags: (tags: string[]) => void;
  placeholder?: string;
}

export function TagInput({ tags, setTags, placeholder }: TagInputProps) {
  const [inputValue, setInputValue] = useState("");

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      if (inputValue.trim() !== "") {
        setTags([...tags, inputValue.trim()]);
        setInputValue("");
      }
    }
  };

  const removeTag = (index: number) => {
    const newTags = [...tags];
    newTags.splice(index, 1);
    setTags(newTags);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {tags.map((tag, i) => (
          <div
            key={i}
            className="bg-muted text-sm px-2 py-1 rounded flex items-center"
          >
            {tag}
            <button
              type="button"
              className="ml-2 text-red-500 hover:text-red-700"
              onClick={() => removeTag(i)}
            >
              x
            </button>
          </div>
        ))}
      </div>
      <Input
        type="text"
        placeholder={placeholder || "Enter tag"}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
