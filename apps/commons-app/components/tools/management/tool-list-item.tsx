"use client";

import { Tool } from "@/types/tool";
import {
  MoreVertical,
  Lock,
  Globe,
  Building2,
  Trash2,
  Edit,
  Key,
  Users,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

interface ToolListItemProps {
  tool: Tool;
  onOpen?: (tool: Tool) => void;
  onEdit: (tool: Tool) => void;
  onDelete: (tool: Tool) => void;
  onManageKeys: (tool: Tool) => void;
  onManagePermissions: (tool: Tool) => void;
}

const visibilityIcons = {
  private: Lock,
  public: Globe,
  platform: Building2,
};

const visibilityColors = {
  private: "bg-muted text-foreground",
  public: "bg-green-200 text-green-700",
  platform: "bg-blue-200 text-blue-700",
};

export function ToolListItem({
  tool,
  onOpen,
  onEdit,
  onDelete,
  onManageKeys,
  onManagePermissions,
}: ToolListItemProps) {
  const VisibilityIcon = visibilityIcons[tool.visibility];

  return (
    <div
      className="cursor-pointer rounded-lg border border-border bg-background p-4 transition-colors hover:border-foreground/30 hover:bg-muted/20"
      onClick={() => onOpen?.(tool)}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-base">
              {tool.displayName || tool.name}
            </h3>
            <Badge
              variant="outline"
              className={`text-xs ${visibilityColors[tool.visibility]}`}
            >
              <VisibilityIcon className="h-3 w-3 mr-1" />
              {tool.visibility}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2">
            {tool.description}
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            className="hover:bg-accent rounded p-1"
            onClick={(event) => event.stopPropagation()}
          >
            <MoreVertical className="h-5 w-5 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={(event) => { event.stopPropagation(); onEdit(tool); }}>
              <Edit className="h-4 w-4 mr-2" />
              Edit Tool
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(event) => { event.stopPropagation(); onManageKeys(tool); }}>
              <Key className="h-4 w-4 mr-2" />
              Manage Keys
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(event) => { event.stopPropagation(); onManagePermissions(tool); }}>
              <Users className="h-4 w-4 mr-2" />
              Permissions
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={(event) => { event.stopPropagation(); onDelete(tool); }}
              className="text-red-600 focus:text-red-600"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-2 mt-3">
        {tool.tags && tool.tags.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {tool.tags.slice(0, 3).map((tag, idx) => (
              <Badge key={idx} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
            {tool.tags.length > 3 && (
              <Badge variant="secondary" className="text-xs">
                +{tool.tags.length - 3}
              </Badge>
            )}
          </div>
        )}
        {tool.version && (
          <span className="text-xs text-muted-foreground ml-auto">v{tool.version}</span>
        )}
      </div>
    </div>
  );
}
