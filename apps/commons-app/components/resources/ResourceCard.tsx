import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
//import { usePathname } from "next/navigation";

import { ChartNoAxesColumn } from "lucide-react";

export default function ResourceCard({ resource }: { resource: any }) {
  //const pathname = usePathname();
  //const isProfile = pathname === `/${resource.owner.username}`;
  return (
    <div className="cursor-pointer border border-gray-400 bg-white shadow-md rounded-xl">
      <Link href={`/${resource.owner?.username}/worlds/${resource._id}`}>
        <div className="p-1 pb-0">
          <Image
            src={
              resource.banner_url ||
              "https://res.cloudinary.com/arttribute/image/upload/v1723823036/m25z496he3yykfk3elsz.jpg"
            }
            width={400}
            height={400}
            alt={"resource"}
            className="aspect-[5/4] w-full h-auto object-cover rounded-t-lg rounded-b-lg border border-gray-400"
          />
          <div className="flex flex-col mt-4 ml-2">
            <Label className="font-semibold text-lg">{resource.name}</Label>
          </div>
        </div>
      </Link>

      <div className="flex flex-col ml-2 mb-3 p-2 pt-0">
        <div className="flex items-center mt-1 mb-2">
          <Avatar className="w-6 h-6 mr-1">
            <AvatarImage src={resource.owner?.profile_image} alt="@shadcn" />
            <AvatarFallback>@</AvatarFallback>
          </Avatar>
          <Label className="text-sm text-gray-500">
            {" "}
            by{" "}
            <Link href={`/${resource.owner?.username}`}>
              <span className="text-gray-700 font-semibold">
                {resource.owner?.username}
              </span>
            </Link>
          </Label>
        </div>
        <div className="flex items-center">
          <div className="flex items-center text-gray-500">
            <ChartNoAxesColumn className="h-4 w-4" />
            <p className="text-sm ml-1">{resource.usage || 0}</p>
          </div>

          {/* <div className="flex items-center ml-1 mr-3">
            <HeartIcon className="w-4 h-4 mr-1 text-gray-500" />
            <Label className="text-sm text-gray-500">
              {resource.likes_count || 0}
            </Label>
          </div>
          <div className="flex items-center">
            <PointerIcon className="w-4 h-4 mr-1 text-gray-500" />
            <Label className="text-sm text-gray-500">
              {resource.likes_count || 0}
            </Label>
          </div>
          */}
        </div>
      </div>
    </div>
  );
}
