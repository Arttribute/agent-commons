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
        className="group relative flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-gray-100 transition-all duration-200"
      >
        <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center relative border border-gray-200">
          {app.imageUrl ? (
            <img
              src={app.imageUrl}
              alt={app.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <Globe className="h-8 w-8 text-gray-400" />
          )}
        </div>
        <span className="text-xs font-medium text-gray-700 text-center line-clamp-2 max-w-[80px]">
          {app.name}
        </span>
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      type="button"
      className="group relative flex items-start gap-4 p-4 rounded-xl bg-gray-50 hover:bg-gray-100 transition-all duration-200 border border-gray-200 hover:border-gray-300 w-full text-left"
    >
      {/* Image/Thumbnail */}
      <div className="w-24 h-24 rounded-xl overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 flex-shrink-0 relative">
        {app.imageUrl ? (
          <img
            src={app.imageUrl}
            alt={app.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Globe className="h-10 w-10 text-gray-400" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex items-center gap-2">
            {app.favicon && (
              <img src={app.favicon} alt="" className="w-5 h-5 rounded" />
            )}
            <h3 className="font-semibold text-gray-900 text-base group-hover:text-blue-600 transition-colors line-clamp-1">
              {app.name}
            </h3>
          </div>
        </div>

        <p className="text-sm text-gray-600 line-clamp-2 mb-2">
          {app.description}
        </p>

        {/* Metadata */}
        <div className="flex items-center gap-3 text-xs text-gray-500">
          {app.rating && (
            <div className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
              <span>{app.rating.toFixed(1)}</span>
            </div>
          )}
          {app.activeUsers && (
            <div className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              <span>{app.activeUsers.toLocaleString()}</span>
            </div>
          )}
          {app.category && (
            <span className="px-2 py-0.5 bg-gray-200 rounded-full text-gray-700">
              {app.category}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
