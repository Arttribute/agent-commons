"use client";

import { useCallback, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera, Loader2 } from "lucide-react";

interface ImageUploaderProps {
  onImageChange: (imageUrl: string) => void;
  defaultImage?: string;
}

export default function ImageUploader({
  onImageChange,
  defaultImage,
}: ImageUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [preview, setPreview] = useState(defaultImage);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Show a local preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);

      setIsUploading(true);
      // Simulate an upload or do a real upload to S3, etc.
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setIsUploading(false);

      // Once done, pass the final URL to the parent
      // If you do a real upload, you'd set the actual CDN URL here
      onImageChange(URL.createObjectURL(file));
    },
    [onImageChange]
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="w-24">
        <input
          type="file"
          name="file"
          id="file"
          className="hidden"
          onChange={handleFileChange}
          accept="image/*"
          disabled={isUploading}
        />
        <label htmlFor="file" className="cursor-pointer w-full">
          <Avatar className="h-20 w-20">
            <AvatarImage src={preview} />
            <AvatarFallback className="bg-muted">
              {isUploading ? (
                <Loader2 className="h-8 w-8 animate-spin" />
              ) : (
                <Camera className="h-8 w-8" />
              )}
            </AvatarFallback>
          </Avatar>
        </label>
      </div>
    </div>
  );
}
