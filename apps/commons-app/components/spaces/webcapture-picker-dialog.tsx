"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Link as LinkIcon, Clock, TrendingUp } from "lucide-react";
import { WebcaptureCard, WebcaptureApp } from "./webcapture-card";
import { ScrollArea } from "@/components/ui/scroll-area";

interface WebcapturePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (url: string) => void;
  recentApps?: WebcaptureApp[];
  popularApps?: WebcaptureApp[];
}

export function WebcapturePickerDialog({
  open,
  onOpenChange,
  onSelect,
  recentApps = [],
  popularApps = [],
}: WebcapturePickerDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [customUrl, setCustomUrl] = useState("");

  const handleSelectApp = (url: string) => {
    onSelect(url);
    onOpenChange(false);
    setSearchQuery("");
    setCustomUrl("");
  };

  const handleCustomUrlSubmit = () => {
    if (!customUrl.trim()) return;

    // Normalize the URL - add https:// if no protocol is specified
    let normalizedUrl = customUrl.trim();
    if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    console.log("Custom URL submitted:", normalizedUrl);
    handleSelectApp(normalizedUrl);
  };

  const filteredPopularApps = popularApps.filter(
    (app) =>
      app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[1001] max-w-3xl h-[600px] p-0 bg-white border-gray-300 text-gray-900 rounded-2xl">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-200">
          <DialogTitle className="text-xl font-bold text-gray-900">
            Choose an Activity
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 pt-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search activities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-gray-50 border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 rounded-xl"
            />
          </div>
        </div>

        <ScrollArea className="flex-1 px-6">
          <div className="space-y-6 pb-6">
            {/* Recent Activities */}
            {!searchQuery && recentApps.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="h-4 w-4 text-gray-500" />
                  <h3 className="text-sm font-semibold text-gray-700">
                    Recents
                  </h3>
                </div>
                <div className="grid grid-cols-6 gap-2">
                  {recentApps.slice(0, 6).map((app) => (
                    <WebcaptureCard
                      key={app.id}
                      app={app}
                      onSelect={handleSelectApp}
                      variant="compact"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Popular Activities */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-700">
                  {searchQuery ? "Search Results" : "Popular"}
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {filteredPopularApps.map((app) => (
                  <WebcaptureCard
                    key={app.id}
                    app={app}
                    onSelect={handleSelectApp}
                  />
                ))}
              </div>

              {filteredPopularApps.length === 0 && searchQuery && (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-sm">No activities found</p>
                  <p className="text-xs mt-1">
                    Try searching with different keywords
                  </p>
                </div>
              )}
            </div>

            {/* Custom URL Input */}
            <div className="pt-4 border-t border-gray-200">
              <div className="flex items-center gap-2 mb-3">
                <LinkIcon className="h-4 w-4 text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-700">
                  Custom URL
                </h3>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter website URL (e.g., example.com)"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && handleCustomUrlSubmit()
                  }
                  className="bg-gray-50 border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 rounded-xl"
                />
                <Button
                  onClick={handleCustomUrlSubmit}
                  disabled={!customUrl.trim()}
                  type="button"
                  className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl"
                >
                  Add
                </Button>
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
