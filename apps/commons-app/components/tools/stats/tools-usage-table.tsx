"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CheckCircle,
  AlertCircle,
  Clock,
  Search,
  ArrowUpDown,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";

interface ToolData {
  id: string;
  name: string;
  calls: number;
  avgDuration: number;
  successRate: number;
  errorRate: number;
  warningRate: number;
}

interface ToolsUsageTableProps {
  data: ToolData[];
}

type SortField = "id" | "name" | "calls" | "avgDuration" | "successRate";
type SortDirection = "asc" | "desc";

export function ToolsUsageTable({ data }: ToolsUsageTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<SortField>("calls");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const { toast } = useToast();

  // Filter tools based on search term
  const filteredTools = useMemo(() => {
    return data.filter(
      (tool) =>
        tool.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tool.id.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [data, searchTerm]);

  // Sort tools based on sort field and direction
  const sortedTools = useMemo(() => {
    return [...filteredTools].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case "id":
          comparison = a.id.localeCompare(b.id);
          break;
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "calls":
          comparison = a.calls - b.calls;
          break;
        case "avgDuration":
          comparison = a.avgDuration - b.avgDuration;
          break;
        case "successRate":
          comparison = a.successRate - b.successRate;
          break;
        default:
          comparison = 0;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [filteredTools, sortField, sortDirection]);

  // Handle sort click
  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  // Render sort indicator
  const renderSortIndicator = (field: SortField) => {
    if (field === sortField) {
      return (
        <ArrowUpDown
          className={`ml-1 h-4 w-4 ${
            sortDirection === "asc" ? "rotate-180" : ""
          }`}
        />
      );
    }
    return <ArrowUpDown className="ml-1 h-4 w-4 opacity-20" />;
  };

  // Copy tool ID to clipboard
  const copyToClipboard = (id: string) => {
    navigator.clipboard.writeText(id);
    toast({
      title: "Tool ID copied",
      description: `${id} has been copied to clipboard`,
      duration: 2000,
    });
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search tools by name or ID..."
          className="pl-8"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Button
                  variant="ghost"
                  className="p-0 font-medium"
                  onClick={() => handleSort("id")}
                >
                  Tool ID {renderSortIndicator("id")}
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  className="p-0 font-medium"
                  onClick={() => handleSort("name")}
                >
                  Tool Name {renderSortIndicator("name")}
                </Button>
              </TableHead>
              <TableHead className="text-right">
                <Button
                  variant="ghost"
                  className="p-0 font-medium"
                  onClick={() => handleSort("calls")}
                >
                  Calls {renderSortIndicator("calls")}
                </Button>
              </TableHead>
              <TableHead className="text-right">
                <Button
                  variant="ghost"
                  className="p-0 font-medium"
                  onClick={() => handleSort("avgDuration")}
                >
                  Avg. Duration {renderSortIndicator("avgDuration")}
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  className="p-0 font-medium"
                  onClick={() => handleSort("successRate")}
                >
                  Status Distribution {renderSortIndicator("successRate")}
                </Button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedTools.length > 0 ? (
              sortedTools.map((tool) => (
                <TableRow key={tool.id}>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">
                        {tool.id}
                      </code>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => copyToClipboard(tool.id)}
                            >
                              <Copy className="h-3 w-3" />
                              <span className="sr-only">Copy ID</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Copy tool ID</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{tool.name}</TableCell>
                  <TableCell className="text-right">
                    {tool.calls.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {tool.avgDuration}ms
                  </TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      <div className="flex gap-1">
                        <div className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3 text-green-500" />
                          <span className="text-xs">
                            {(tool.successRate * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                          <Clock className="h-3 w-3 text-amber-500" />
                          <span className="text-xs">
                            {(tool.warningRate * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                          <AlertCircle className="h-3 w-3 text-red-500" />
                          <span className="text-xs">
                            {(tool.errorRate * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="bg-green-500 h-full"
                          style={{ width: `${tool.successRate * 100}%` }}
                        />
                        <div
                          className="bg-amber-500 h-full"
                          style={{ width: `${tool.warningRate * 100}%` }}
                        />
                        <div
                          className="bg-red-500 h-full"
                          style={{ width: `${tool.errorRate * 100}%` }}
                        />
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center py-6 text-muted-foreground"
                >
                  No tools found matching your search criteria
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
