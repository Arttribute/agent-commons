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
    if (
      !normalizedUrl.startsWith("http://") &&
      !normalizedUrl.startsWith("https://")
    ) {
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
      <DialogContent className="z-[1001] max-w-md max-h-[800px] p-0 bg-white border-gray-400 text-gray-900 rounded-2xl flex flex-col">
        <DialogHeader className="px-4 py-3 border-b border-gray-400">
          <DialogTitle className="text-sm font-semibold text-gray-900">
            Space apps
          </DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="px-3">
          <div className="relative">
            <Input
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-4 pb-2 px-4">
          {/* Recent Activities */}
          {!searchQuery && recentApps.length > 0 && (
            <div>
              <h3 className="text-xs text-gray-600 mb-1">Recents</h3>
              <div className="flex gap-3 overflow-x-auto pb-2">
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
          <h3 className="text-xs mb-1  text-gray-600">
            {searchQuery ? "Search Results" : "Popular apps"}
          </h3>
          {/* Activities */}
          <ScrollArea className="flex-1 h-60 pb-4 px-2">
            <div>
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
                  <p className="text-sm">No apps found</p>
                  <p className="text-xs mt-1">
                    Try searching with different keywords
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Fixed Custom URL Input at Bottom */}
        <div className="pt-2 pb-3 px-3 border-t border-gray-200 bg-white rounded-b-2xl">
          <div className="flex items-center gap-2 mb-2">
            <LinkIcon className="h-4 w-4 text-gray-500" />
            <h3 className="text-xs font-semibold text-gray-600 ">
              Custom app URL
            </h3>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Enter website URL (e.g., example.com)"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCustomUrlSubmit()}
            />
            <Button
              onClick={handleCustomUrlSubmit}
              disabled={!customUrl.trim()}
              type="button"
            >
              Start App
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
