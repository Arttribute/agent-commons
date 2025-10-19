"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Camera,
  Mic,
  MicOff,
  CameraOff,
  Monitor,
  MonitorOff,
  Globe,
  PhoneOff,
  ChevronUp,
  Settings,
  Check,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { WebcapturePickerDialog } from "./webcapture-picker-dialog";
import { WebcaptureApp } from "./webcapture-card";

interface SpaceMediaControlsProps {
  pubAudio: boolean;
  pubVideo: boolean;
  pubScreen: boolean;
  pubUrl: boolean;
  onTogglePublish: (type: "audio" | "video" | "screen" | "url") => void;
  onUrlSubmit: (url: string) => void;
  onEndWebGracefully: () => void;
  onLeaveSpace?: () => void;
}

// Mock data for popular and recent webcaptures
const POPULAR_WEBCAPTURES: WebcaptureApp[] = [
  {
    id: "1",
    name: "Figma",
    description: "Collaborative interface design tool",
    url: "figma.com",
    imageUrl:
      "https://images.unsplash.com/photo-1618761714954-0b8cd0026356?w=400&h=400&fit=crop",
    category: "Design",
    rating: 4.8,
    activeUsers: 12500,
  },
  {
    id: "2",
    name: "Miro",
    description: "Online collaborative whiteboard platform",
    url: "miro.com",
    imageUrl:
      "https://images.unsplash.com/photo-1611224923853-80b023f02d71?w=400&h=400&fit=crop",
    category: "Collaboration",
    rating: 4.7,
    activeUsers: 8300,
  },
  {
    id: "3",
    name: "CodePen",
    description: "Social development environment for front-end designers",
    url: "codepen.io",
    imageUrl:
      "https://images.unsplash.com/photo-1542831371-29b0f74f9713?w=400&h=400&fit=crop",
    category: "Development",
    rating: 4.6,
    activeUsers: 5200,
  },
  {
    id: "4",
    name: "Excalidraw",
    description: "Virtual whiteboard for sketching hand-drawn diagrams",
    url: "excalidraw.com",
    imageUrl:
      "https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?w=400&h=400&fit=crop",
    category: "Drawing",
    rating: 4.9,
    activeUsers: 15000,
  },
];

const RECENT_WEBCAPTURES: WebcaptureApp[] = [
  {
    id: "r1",
    name: "Figma",
    description: "Collaborative design",
    url: "figma.com",
    imageUrl:
      "https://images.unsplash.com/photo-1618761714954-0b8cd0026356?w=100&h=100&fit=crop",
  },
  {
    id: "r2",
    name: "Miro",
    description: "Whiteboard",
    url: "miro.com",
    imageUrl:
      "https://images.unsplash.com/photo-1611224923853-80b023f02d71?w=100&h=100&fit=crop",
  },
];

export function SpaceMediaControls({
  pubAudio,
  pubVideo,
  pubScreen,
  pubUrl,
  onTogglePublish,
  onUrlSubmit,
  onEndWebGracefully,
  onLeaveSpace,
}: SpaceMediaControlsProps) {
  const [showWebcaptureDialog, setShowWebcaptureDialog] = useState(false);
  const [micPopoverOpen, setMicPopoverOpen] = useState(false);
  const [inputVolume, setInputVolume] = useState([80]);
  const [outputVolume, setOutputVolume] = useState([70]);
  const [selectedInputDevice, setSelectedInputDevice] = useState("default");
  const [selectedOutputDevice, setSelectedOutputDevice] = useState("default");

  // Mock devices - in a real app, you'd get these from navigator.mediaDevices.enumerateDevices()
  const inputDevices = [
    { id: "default", label: "Default - MacBook Pro Microphone (Built-in)" },
    { id: "external", label: "External Microphone" },
  ];

  const outputDevices = [
    { id: "default", label: "Default - MacBook Pro Speakers (Built-in)" },
    { id: "headphones", label: "Headphones" },
  ];

  const handleSelectWebcapture = (url: string) => {
    console.log("Webcapture selected:", url);
    onUrlSubmit(url);
    setShowWebcaptureDialog(false);
  };

  const handleToggleActivities = () => {
    if (pubUrl) {
      // If already active, do nothing (use End Activity button)
      return;
    }
    console.log(
      "Opening webcapture dialog, current state:",
      showWebcaptureDialog
    );
    setShowWebcaptureDialog(true);
  };

  const handleLeaveSpace = () => {
    if (onLeaveSpace) {
      if (window.confirm("Are you sure you want to leave this space?")) {
        onLeaveSpace();
      }
    }
  };

  return (
    <div className="p-4 flex justify-center items-center gap-3">
      {/* Group 1: Mic & Camera */}
      <div className="flex items-center gap-1 bg-white rounded-2xl p-1 shadow-lg border border-gray-400">
        {/* Mic button */}
        <Button
          size="sm"
          variant="ghost"
          type="button"
          onClick={() => onTogglePublish("audio")}
          className={`rounded-xl transition-all ${
            pubAudio
              ? "bg-gray-700 text-white hover:bg-gray-600"
              : "bg-red-600 text-white hover:bg-red-700"
          }`}
        >
          {pubAudio ? (
            <Mic className="h-5 w-5" />
          ) : (
            <MicOff className="h-5 w-5" />
          )}
        </Button>

        {/* Mic settings popover */}
        <Popover open={micPopoverOpen} onOpenChange={setMicPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              type="button"
              className="rounded-md w-5 transition-all hover:bg-gray-300"
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="z-[1000] w-80 bg-gray-900 border-gray-700 text-white p-0 mb-2"
            align="center"
            side="top"
          >
            <div className="p-4 space-y-4">
              {/* Input Device */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
                    Input Device
                  </label>
                  <button
                    type="button"
                    className="text-xs text-gray-400 hover:text-white transition-colors"
                  >
                    Custom
                  </button>
                </div>
                <div className="space-y-1">
                  {inputDevices.map((device) => (
                    <button
                      key={device.id}
                      type="button"
                      onClick={() => setSelectedInputDevice(device.id)}
                      className="w-full flex items-center justify-between p-2 rounded-md hover:bg-gray-800 transition-colors text-sm"
                    >
                      <span className="text-gray-200 text-left flex-1 truncate">
                        {device.label}
                      </span>
                      {selectedInputDevice === device.id && (
                        <Check className="h-4 w-4 text-green-400 flex-shrink-0 ml-2" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Input Volume */}
              <div>
                <label className="text-xs font-semibold text-gray-300 uppercase tracking-wide mb-2 block">
                  Input Volume
                </label>
                <Slider
                  value={inputVolume}
                  onValueChange={setInputVolume}
                  max={100}
                  step={1}
                  className="w-full"
                />
                <div className="mt-2 flex gap-0.5">
                  {Array.from({ length: 40 }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-1.5 flex-1 rounded-sm ${
                        i < (inputVolume[0] / 100) * 40
                          ? "bg-green-500"
                          : "bg-gray-700"
                      }`}
                    />
                  ))}
                </div>
              </div>

              <Separator className="bg-gray-700" />

              {/* Output Device */}
              <div>
                <label className="text-xs font-semibold text-gray-300 uppercase tracking-wide mb-2 block">
                  Output Device
                </label>
                <div className="space-y-1">
                  {outputDevices.map((device) => (
                    <button
                      key={device.id}
                      type="button"
                      onClick={() => setSelectedOutputDevice(device.id)}
                      className="w-full flex items-center justify-between p-2 rounded-md hover:bg-gray-800 transition-colors text-sm"
                    >
                      <span className="text-gray-200 text-left flex-1 truncate">
                        {device.label}
                      </span>
                      {selectedOutputDevice === device.id && (
                        <Check className="h-4 w-4 text-green-400 flex-shrink-0 ml-2" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Output Volume */}
              <div>
                <label className="text-xs font-semibold text-gray-300 uppercase tracking-wide mb-2 block">
                  Output Volume
                </label>
                <Slider
                  value={outputVolume}
                  onValueChange={setOutputVolume}
                  max={100}
                  step={1}
                  className="w-full"
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <div className="w-px h-6 bg-gray-700 mx-1" />

        {/* Camera button */}
        <Button
          size="sm"
          variant="ghost"
          type="button"
          onClick={() => onTogglePublish("video")}
          className={`rounded-xl transition-all ${
            pubVideo
              ? "bg-gray-700 text-white hover:bg-gray-600"
              : "bg-red-600 text-white hover:bg-red-700"
          }`}
        >
          {pubVideo ? (
            <Camera className="h-5 w-5" />
          ) : (
            <CameraOff className="h-5 w-5" />
          )}
        </Button>
      </div>

      {/* Group 2: Screen & Webcapture */}
      <div className="flex items-center gap-1 bg-white rounded-2xl  p-1 shadow-2xl border border-gray-400">
        <Button
          size="sm"
          variant="ghost"
          type="button"
          onClick={() => onTogglePublish("screen")}
          className={`rounded-xl transition-all ${
            pubScreen
              ? "bg-green-600 hover:bg-green-700"
              : "bg-transparent text-gray-600 hover:bg-gray-300"
          }`}
        >
          {pubScreen ? (
            <Monitor className="h-5 w-5" />
          ) : (
            <Monitor className="h-5 w-5" />
          )}
        </Button>

        <Button
          size="sm"
          variant="ghost"
          type="button"
          onClick={handleToggleActivities}
          className={`rounded-xl transition-all ${
            pubUrl
              ? "bg-teal-600 hover:bg-teal-700"
              : "bg-transparent text-gray-600 hover:bg-gray-300"
          }`}
          disabled={pubUrl}
        >
          <Globe className="h-5 w-5" />
        </Button>
      </div>

      {/* Conditional buttons */}
      {pubUrl && (
        <Button
          size="sm"
          variant="destructive"
          type="button"
          onClick={onEndWebGracefully}
          className="rounded-full h-10 px-4 bg-red-600 hover:bg-red-700 shadow-lg"
        >
          End Activity
        </Button>
      )}

      {/* Hang up button */}
      {onLeaveSpace && (
        <Button
          size="sm"
          type="button"
          onClick={handleLeaveSpace}
          className="rounded-xl h-10 px-8 py-2 bg-red-600 hover:bg-red-700 shadow-lg transition-all"
        >
          <PhoneOff className="h-5 w-5 text-white" />
        </Button>
      )}

      {/* Webcapture Picker Dialog - render outside of controls container */}
      <WebcapturePickerDialog
        open={showWebcaptureDialog}
        onOpenChange={(open) => {
          console.log("Dialog onOpenChange called with:", open);
          setShowWebcaptureDialog(open);
        }}
        onSelect={handleSelectWebcapture}
        recentApps={RECENT_WEBCAPTURES}
        popularApps={POPULAR_WEBCAPTURES}
      />
    </div>
  );
}
