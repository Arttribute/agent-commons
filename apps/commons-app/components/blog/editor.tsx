"use client";

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  minHeight?: string;
}

function EditorComponent({ value, onChange, minHeight }: EditorProps) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-full p-4 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
      style={{ minHeight: minHeight }}
    />
  );
}

EditorComponent.displayName = "Editor";

export const Editor = EditorComponent;
