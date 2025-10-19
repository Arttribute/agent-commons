// components/layout/DashboardBar.tsx
import { FC, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Earth, Folder } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import Image from "next/image";
import { Button } from "@/components/ui/button";

interface DashboardBarProps {
  // values: 'studio' | 'spaces' | 'files'
  activeTab: string;
  rightSlot?: ReactNode;
}

export const DashboardBar: FC<DashboardBarProps> = ({
  activeTab,
  rightSlot,
}) => {
  const router = useRouter();
  const { authState, login } = useAuth();
  const { idToken } = authState;
  const isAuthenticated = !!idToken;

  /** Navigate to Studio/Spaces/Files */
  const handleNavigation = (section: string) => {
    if (section === "studio") {
      router.push(`/studio/agents`);
      return;
    }
    if (section === "spaces") {
      router.push(`/spaces`);
      return;
    }
    if (section === "files") {
      router.push(`/files`);
      return;
    }
  };

  return (
    <div className="w-full ">
      <div className="flex justify-between items-center mb-2 px-1">
        <div className="rounded-full border border-gray-500 p-[1px] bg-white">
          <div className="rounded-full border ">
            <Image
              src="/ac-icon.svg"
              alt="Agent Commons Logo"
              width={20}
              height={20}
              className="object-cover rounded-full"
            />
          </div>
        </div>
        <div>{rightSlot}</div>
      </div>
      <div className="flex flex-col gap-1">
        <Button
          variant="ghost"
          className={`justify-start px-2 w-full ${
            activeTab === "studio" ? "bg-accent text-accent-foreground" : ""
          }`}
          onClick={() => handleNavigation("studio")}
        >
          <Sparkles className="h-4 w-4" />
          <span>Studio</span>
        </Button>
        <Button
          variant="ghost"
          className={`justify-start px-2 w-full ${
            activeTab === "spaces" ? "bg-accent text-accent-foreground" : ""
          }`}
          onClick={() => handleNavigation("spaces")}
        >
          <Earth className="h-4 w-4" />
          <span>Spaces</span>
        </Button>
        <Button
          variant="ghost"
          className={`justify-start px-2 w-full ${
            activeTab === "files" ? "bg-accent text-accent-foreground" : ""
          }`}
          onClick={() => handleNavigation("files")}
        >
          <Folder className="h-4 w-4" />
          <span>Files</span>
        </Button>
      </div>
    </div>
  );
};
