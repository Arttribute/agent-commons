"use client";

import { Globe, Star, Users } from "lucide-react";

export interface WebcaptureApp {
  id: string;
  name: string;
  description: string;
  url: string;
  imageUrl?: string;
  favicon?: string;
  category?: string;
  rating?: number;
  activeUsers?: number;
}

interface WebcaptureCardProps {
  app: WebcaptureApp;
  onSelect: (url: string) => void;
  variant?: "default" | "compact";
}

export function WebcaptureCard({
  app,
  onSelect,
  variant = "default",
}: WebcaptureCardProps) {
  const handleClick = () => {
    onSelect(app.url);
  };

  if (variant === "compact") {
    return (
      <button
        onClick={handleClick}
        type="button"
        className="group relative flex flex-col items-center gap-1.5 shrink-0"
      >
        <div className="w-12 h-12 rounded-lg overflow-hidden bg-white flex items-center justify-center relative border border-gray-400 hover:shadow-md transition-shadow duration-200">
          {app.imageUrl ? (
            <img
              src={app.imageUrl}
              alt={app.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <Globe className="h-6 w-6 text-gray-400" />
          )}
        </div>
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      type="button"
      className="group relative flex flex-col rounded-lg overflow-hidden bg-white hover:bg-gray-50 transition-all duration-200 border border-gray-400 hover:border-gray-500 w-full text-left"
    >
      {/* Image/Thumbnail */}
      <div className="w-full aspect-[16/10] overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 flex-shrink-0 relative">
        {app.imageUrl ? (
          <img
            src={app.imageUrl}
            alt={app.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Globe className="h-10 w-10 text-gray-400" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3">
        <div className="flex items-start gap-2 mb-1">
          {app.favicon && (
            <img src={app.favicon} alt="" className="w-4 h-4 rounded mt-0.5" />
          )}
          <h3 className=" text-gray-900 text-xs leading-tight line-clamp-1">
            {app.name}
          </h3>
        </div>
        <p className="text-[10px] text-gray-600 truncate">{app.description}</p>
      </div>
    </button>
  );
}
