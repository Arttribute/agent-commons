import * as React from "react";
import Link from "next/link";
//import Image from "next/image";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { ChartNoAxesColumn } from "lucide-react";
import { Resource } from "@/types/agent";

export default function ResourceCard({ resource }: { resource: Resource }) {
  return (
    <div
      className="relative cursor-pointer border border-gray-400 shadow-md rounded-xl overflow-hidden "
      style={{
        backgroundImage: `url(${"https://res.cloudinary.com/arttribute/image/upload/v1723823036/m25z496he3yykfk3elsz.jpg"})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="absolute inset-0 bg-black bg-opacity-30" />
      <Link
        href={`/${resource}/worlds/${resource}`}
        className="relative z-10 block px-4"
      >
        <div>
          <div className="h-36"></div>
          <div className="flex flex-col">
            <Label className="text-base text-white">
              {resource.title || "Untitled"}
            </Label>
          </div>
        </div>
      </Link>
      <div className="relative z-10 flex flex-col px-4 text-white pb-2">
        <div className="flex items-center">
          <div className="flex items-center mt-1 mb-2">
            <Avatar className="w-6 h-6 mr-1">
              <AvatarImage src={resource.image} alt="@shadcn" />
              <AvatarFallback>@</AvatarFallback>
            </Avatar>
            <Label className="text-sm text-white">
              by{" "}
              <Link
                href={`/${resource.image}`}
                className="font-semibold text-white"
              >
                {"anonymous"}
              </Link>
            </Label>
          </div>
          <div className="flex items-center ml-auto">
            <div className="flex items-center text-white">
              <ChartNoAxesColumn className="h-4 w-4" />
              <p className="text-sm ml-1">{0}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
