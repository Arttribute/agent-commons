"use client";

import { useEffect, useState } from "react";

interface TopLoadingBarProps {
  isLoading: boolean;
  className?: string;
}

export function TopLoadingBar({
  isLoading,
  className = "",
}: TopLoadingBarProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (isLoading) {
      setProgress(0);
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) return prev;
          return prev + Math.random() * 10;
        });
      }, 200);

      return () => clearInterval(interval);
    } else {
      setProgress(100);
      const timeout = setTimeout(() => setProgress(0), 300);
      return () => clearTimeout(timeout);
    }
  }, [isLoading]);

  if (progress === 0) return null;

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 h-1 bg-gray-200 ${className}`}
    >
      <div
        className="h-full bg-blue-500 transition-all duration-300 ease-out"
        style={{
          width: `${progress}%`,
          opacity: progress === 100 ? 0 : 1,
        }}
      />
    </div>
  );
}
