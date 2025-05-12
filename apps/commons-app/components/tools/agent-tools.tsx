"use client";

import { useState } from "react";
import { Search, Plus, X, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ToolCard } from "./tool-card";
import { ScrollArea } from "@/components/ui/scroll-area";

// Types
interface Tool {
  id: string;
  name: string;
  description: string;
  detailedDescription?: string;
  isLoaded?: boolean;
  requiresPermission?: boolean;
  owner?: string;
  creator?: string;
  createdAt?: string;
  version?: string;
  category?: string;
  tags?: string[];
  usageExamples?: string[];
  schema?: string;
  rating?: number;
  rawSchema?: string; // Full schema object as string including name, customJson, and description
}

const CURRENT_USER = {
  id: "user-1",
  name: "John Doe",
  email: "john.doe@example.com",
};

export default function AgentTools() {
  // Mock data - in a real app, this would come from props or API
  const [loadedTools, setLoadedTools] = useState<Tool[]>([
    {
      id: "tool-1",
      name: "Web Search",
      description: "Search the web for information",
      isLoaded: true,
      creator: "Search Systems Inc.",
      createdAt: "2023-05-15",
      version: "2.1.0",
      category: "Information Retrieval",
      tags: ["search", "web", "information"],
      rating: 4.8,
    },
    {
      id: "tool-2",
      name: "Calculator",
      description: "Perform mathematical calculations",
      isLoaded: true,
      creator: "Math Tools LLC",
      createdAt: "2023-03-10",
      version: "1.5.2",
      category: "Mathematics",
      tags: ["math", "calculation", "arithmetic"],
      rating: 4.5,
    },
    {
      id: "my-tool-1",
      name: "Personal Notes",
      description: "Access and manage your personal notes",
      isLoaded: true,
      creator: CURRENT_USER.name,
      createdAt: "2023-08-15",
      version: "1.0.0",
      category: "Productivity",
      tags: ["notes", "personal", "productivity"],
      rating: 4.9,
    },
  ]);

  const [commonTools, setCommonTools] = useState<Tool[]>([
    {
      id: "tool-1",
      name: "Web Search",
      description: "Search the web for information",
      detailedDescription:
        "This tool allows agents to search the web for up-to-date information on any topic. It uses a combination of search engines to provide comprehensive results and can filter by recency, relevance, and source credibility.",
      isLoaded: true,
      creator: "Search Systems Inc.",
      createdAt: "2023-05-15",
      version: "2.1.0",
      category: "Information Retrieval",
      tags: ["search", "web", "information"],
      usageExamples: [
        "Search for 'latest AI research papers'",
        "Find information about 'climate change solutions'",
        "Look up 'recipe for chocolate cake'",
      ],
      schema: `{
  "name": "webSearch",
  "parameters": {
    "type": "object",
    "required": ["query"],
    "properties": {
      "query": {
        "type": "string",
        "description": "The search query"
      },
      "recency": {
        "type": "string",
        "enum": ["day", "week", "month", "year", "any"],
        "description": "Filter results by recency"
      },
      "limit": {
        "type": "number",
        "description": "Maximum number of results to return",
        "default": 5
      }
    }
  },
  "description": "Search the web for information on any topic"
}`,
      rating: 4.8,
    },
    {
      id: "tool-2",
      name: "Calculator",
      description: "Perform mathematical calculations",
      detailedDescription:
        "A powerful calculator tool that can handle complex mathematical operations, including algebra, calculus, statistics, and more. It supports various number formats and can provide step-by-step solutions.",
      isLoaded: true,
      creator: "Math Tools LLC",
      createdAt: "2023-03-10",
      version: "1.5.2",
      category: "Mathematics",
      tags: ["math", "calculation", "arithmetic"],
      usageExamples: [
        "Calculate '(5 + 3) * 2 / 4'",
        "Solve equation 'x^2 + 3x - 4 = 0'",
        "Compute the derivative of 'x^3 + 2x^2 - 5x + 1'",
      ],
      schema: `{
  "name": "calculator",
  "parameters": {
    "type": "object",
    "required": ["expression"],
    "properties": {
      "expression": {
        "type": "string",
        "description": "The mathematical expression to evaluate"
      },
      "precision": {
        "type": "number",
        "description": "Number of decimal places in the result",
        "default": 2
      },
      "showSteps": {
        "type": "boolean",
        "description": "Whether to show step-by-step solution",
        "default": false
      }
    }
  },
  "description": "Evaluate mathematical expressions and solve equations"
}`,
      rating: 4.5,
    },
    {
      id: "tool-3",
      name: "Weather",
      description: "Get current weather information",
      detailedDescription:
        "This tool provides real-time weather data for any location worldwide. It can retrieve current conditions, forecasts, historical data, and weather alerts. The data is sourced from multiple meteorological services for accuracy.",
      isLoaded: false,
      creator: "Weather Data Systems",
      createdAt: "2023-06-22",
      version: "3.0.1",
      category: "Weather & Climate",
      tags: ["weather", "forecast", "meteorology"],
      usageExamples: [
        "Get current weather in 'New York, NY'",
        "Check 5-day forecast for 'Tokyo, Japan'",
        "Find historical weather data for 'London' on 'January 15, 2023'",
      ],
      schema: `{
  "name": "weatherInfo",
  "parameters": {
    "type": "object",
    "required": ["location"],
    "properties": {
      "location": {
        "type": "string",
        "description": "City name or geographic coordinates"
      },
      "forecastDays": {
        "type": "number",
        "description": "Number of days to forecast",
        "default": 1
      },
      "units": {
        "type": "string",
        "enum": ["metric", "imperial"],
        "description": "Unit system for temperature and wind speed",
        "default": "metric"
      }
    }
  },
  "description": "Get weather information for a specific location"
}`,
      rating: 4.7,
    },
    {
      id: "tool-4",
      name: "Calendar",
      description: "Access calendar information",
      detailedDescription:
        "A calendar tool that allows agents to check dates, schedule events, set reminders, and manage appointments. It can integrate with popular calendar services and supports recurring events, notifications, and time zone conversions.",
      isLoaded: false,
      creator: "Productivity Tools Inc.",
      createdAt: "2023-04-05",
      version: "2.3.4",
      category: "Productivity",
      tags: ["calendar", "scheduling", "time management"],
      usageExamples: [
        "Schedule meeting on 'June 15, 2023 at 2:00 PM'",
        "Check availability for 'next Tuesday afternoon'",
        "Set reminder for 'project deadline on Friday'",
      ],
      schema: `{
  "name": "calendarTool",
  "parameters": {
    "type": "object",
    "required": ["action"],
    "properties": {
      "action": {
        "type": "string",
        "enum": ["check", "schedule", "remind", "list"],
        "description": "The calendar action to perform"
      },
      "date": {
        "type": "string",
        "description": "Date in ISO format or natural language"
      },
      "title": {
        "type": "string",
        "description": "Title of the event or reminder"
      },
      "duration": {
        "type": "number",
        "description": "Duration in minutes",
        "default": 30
      }
    }
  },
  "description": "Manage calendar events and check date information"
}`,
      rating: 4.2,
    },
    {
      id: "tool-5",
      name: "Translation",
      description: "Translate text between languages",
      detailedDescription:
        "A powerful translation tool that can convert text between over 100 languages. It uses advanced neural machine translation models to provide accurate and natural-sounding translations, with support for idioms, slang, and technical terminology.",
      isLoaded: false,
      creator: "Linguistic AI Corp",
      createdAt: "2023-07-18",
      version: "4.1.2",
      category: "Language",
      tags: ["translation", "language", "multilingual"],
      usageExamples: [
        "Translate 'Hello, how are you?' to Spanish",
        "Convert Japanese text 'こんにちは' to English",
        "Translate technical document from German to French",
      ],
      schema: `{
  "name": "translator",
  "parameters": {
    "type": "object",
    "required": ["text", "targetLanguage"],
    "properties": {
      "text": {
        "type": "string",
        "description": "The text to translate"
      },
      "targetLanguage": {
        "type": "string",
        "description": "The language code to translate to (e.g., 'es', 'fr', 'ja')"
      },
      "sourceLanguage": {
        "type": "string",
        "description": "The language code of the source text (auto-detect if omitted)"
      },
      "preserveFormatting": {
        "type": "boolean",
        "description": "Whether to preserve the original formatting",
        "default": true
      }
    }
  },
  "description": "Translate text between different languages"
}`,
      rating: 4.9,
    },
  ]);

  const [externalTools, setExternalTools] = useState<Tool[]>([
    {
      id: "ext-1",
      name: "Company Database",
      description: "Access proprietary company database",
      detailedDescription:
        "This tool provides secure access to Acme Corp's proprietary database, allowing authorized agents to query company data, including employee records, sales figures, inventory levels, and customer information. All queries are logged and access is restricted based on user permissions.",
      isLoaded: false,
      requiresPermission: true,
      owner: "Acme Corp",
      creator: "Acme Corp Data Team",
      createdAt: "2023-02-10",
      version: "3.2.1",
      category: "Data Access",
      tags: ["database", "company", "proprietary"],
      usageExamples: [
        "Query 'sales figures for Q1 2023'",
        "Find 'employee contact information for Marketing department'",
        "Check 'inventory levels for product SKU-12345'",
      ],
      schema: `{
  "name": "companyDatabase",
  "customJson": {
    "name": "queryCompanyDatabase",
    "apiSpec": {
      "path": "/api/database/query",
      "method": "POST",
      "baseUrl": "https://api.acmecorp.com",
      "headers": {
        "Content-Type": "application/json",
        "Authorization": "Bearer {API_KEY}"
      }
    },
    "parameters": {
      "type": "object",
      "required": ["query"],
      "properties": {
        "query": {
          "type": "string",
          "description": "SQL query to execute against the company database"
        },
        "limit": {
          "type": "number",
          "description": "Maximum number of results to return"
        }
      }
    },
    "description": "Query the Acme Corp proprietary database"
  },
  "description": "Access and query the Acme Corp database"
}`,
      rating: 4.6,
      rawSchema: `{
  "name": "companyDatabaseTool",
  "customJson": "{\\"name\\":\\"queryCompanyDatabase\\",\\"apiSpec\\":{\\"path\\":\\"/api/database/query\\",\\"method\\":\\"POST\\",\\"baseUrl\\":\\"https://api.acmecorp.com\\",\\"headers\\":{\\"Content-Type\\":\\"application/json\\",\\"Authorization\\":\\"Bearer {API_KEY}\\"}},\\"parameters\\":{\\"type\\":\\"object\\",\\"required\\":[\\"query\\"],\\"properties\\":{\\"query\\":{\\"type\\":\\"string\\",\\"description\\":\\"SQL query to execute against the company database\\"},\\"limit\\":{\\"type\\":\\"number\\",\\"description\\":\\"Maximum number of results to return\\"}}},\\"description\\":\\"Query the Acme Corp proprietary database\\"}",
  "description": "Access and query the Acme Corp database"
}`,
    },
    {
      id: "ext-2",
      name: "Financial API",
      description: "Access to financial data services",
      detailedDescription:
        "FinTech Inc's Financial API provides comprehensive access to market data, stock quotes, company financials, and economic indicators. It offers real-time and historical data from global markets, with advanced filtering and analysis capabilities.",
      isLoaded: false,
      requiresPermission: true,
      owner: "FinTech Inc",
      creator: "FinTech Inc API Team",
      createdAt: "2023-01-15",
      version: "2.5.0",
      category: "Finance",
      tags: ["financial", "stocks", "market data"],
      usageExamples: [
        "Get stock price for 'AAPL' over the past week",
        "Analyze financial statements for 'MSFT' from Q2 2023",
        "Compare performance of 'TSLA' vs 'F' year-to-date",
      ],
      schema: `{
  "name": "financialData",
  "customJson": {
    "name": "getStockData",
    "apiSpec": {
      "path": "/api/stocks/{symbol}",
      "method": "GET",
      "baseUrl": "https://api.fintech.com",
      "headers": {
        "Accept": "application/json",
        "X-API-Key": "{API_KEY}"
      }
    },
    "parameters": {
      "type": "object",
      "required": ["symbol"],
      "properties": {
        "symbol": {
          "type": "string",
          "description": "Stock symbol to retrieve data for"
        },
        "period": {
          "type": "string",
          "enum": ["1d", "1w", "1m", "3m", "1y", "5y"],
          "description": "Time period for the data"
        }
      }
    },
    "description": "Retrieve financial data for a specific stock symbol"
  },
  "description": "Access financial market data and analytics"
}`,
      rating: 4.7,
      rawSchema: `{
  "name": "financialDataTool",
  "customJson": "{\\"name\\":\\"getStockData\\",\\"apiSpec\\":{\\"path\\":\\"/api/stocks/{symbol}\\",\\"method\\":\\"GET\\",\\"baseUrl\\":\\"https://api.fintech.com\\",\\"headers\\":{\\"Accept\\":\\"application/json\\",\\"X-API-Key\\":\\"{API_KEY}\\"}},\\"parameters\\":{\\"type\\":\\"object\\",\\"required\\":[\\"symbol\\"],\\"properties\\":{\\"symbol\\":{\\"type\\":\\"string\\",\\"description\\":\\"Stock symbol to retrieve data for\\"},\\"period\\":{\\"type\\":\\"string\\",\\"enum\\":[\\"1d\\",\\"1w\\",\\"1m\\",\\"3m\\",\\"1y\\",\\"5y\\"],\\"description\\":\\"Time period for the data\\"}}},\\"description\\":\\"Retrieve financial data for a specific stock symbol\\"}",
  "description": "Access financial market data and analytics"
}`,
    },
    {
      id: "ext-3",
      name: "Chuck Norris Jokes",
      description: "Access to Chuck Norris jokes API",
      detailedDescription:
        "This tool connects to the Chuck Norris Jokes API, providing access to thousands of Chuck Norris jokes across various categories. It can retrieve random jokes, search by keywords, or filter by categories like science, dev, music, and more.",
      isLoaded: false,
      requiresPermission: true,
      owner: "Joke Systems Inc",
      creator: "Humor API Team",
      createdAt: "2023-03-01",
      version: "1.0.3",
      category: "Entertainment",
      tags: ["jokes", "humor", "entertainment"],
      usageExamples: [
        "Get a random Chuck Norris joke in the 'dev' category",
        "Find Chuck Norris jokes containing the word 'code'",
        "Retrieve a Chuck Norris joke about 'science'",
      ],
      schema: `{
  "name": "getChuckNorrisJokeByCategory",
  "apiSpec": {
    "path": "/jokes/random",
    "method": "GET",
    "baseUrl": "https://api.chucknorris.io",
    "headers": {
      "Accept": "application/json"
    },
    "queryParams": {
      "category": "{category}"
    }
  },
  "parameters": {
    "type": "object",
    "required": [
      "category"
    ],
    "properties": {
      "category": {
        "type": "string",
        "description": "Category of Chuck Norris jokes. e.g. science, dev, music..."
      }
    }
  },
  "description": "Retrieves a random Chuck Norris joke for the provided category."
}`,
      rawSchema: `{
  "name": "chuckNorrisJokes",
  "customJson": "{\\"name\\":\\"getChuckNorrisJokeByCategory\\",\\"apiSpec\\":{\\"path\\":\\"/jokes/random\\",\\"method\\":\\"GET\\",\\"baseUrl\\":\\"https://api.chucknorris.io\\",\\"headers\\":{\\"Accept\\":\\"application/json\\"},\\"queryParams\\":{\\"category\\":\\"{category}\\"}},\\"parameters\\":{\\"type\\":\\"object\\",\\"required\\":[\\"category\\"],\\"properties\\":{\\"category\\":{\\"type\\":\\"string\\",\\"description\\":\\"Category of Chuck Norris jokes. e.g. science, dev, music...\\"}}},\\"description\\":\\"Retrieves a random Chuck Norris joke for the provided category.\\"}",
  "description": "Access to Chuck Norris jokes API"
}`,
      rating: 4.2,
    },
  ]);

  // My Tools - tools owned by the current user
  const [myTools, setMyTools] = useState<Tool[]>([
    {
      id: "my-tool-1",
      name: "Personal Notes",
      description: "Access and manage your personal notes",
      detailedDescription:
        "This tool allows you to create, read, update, and delete your personal notes. Notes can be organized by tags, categories, or dates. You can also search through your notes using keywords.",
      isLoaded: true,
      creator: CURRENT_USER.name,
      createdAt: "2023-08-15",
      version: "1.0.0",
      category: "Productivity",
      tags: ["notes", "personal", "productivity"],
      usageExamples: [
        "Create a new note titled 'Meeting Notes'",
        "Find all notes with the tag 'work'",
        "Update my note about project deadlines",
      ],
      schema: `{
  "name": "personalNotes",
  "parameters": {
    "type": "object",
    "required": ["action"],
    "properties": {
      "action": {
        "type": "string",
        "enum": ["create", "read", "update", "delete", "search"],
        "description": "The action to perform on notes"
      },
      "title": {
        "type": "string",
        "description": "Title of the note"
      },
      "content": {
        "type": "string",
        "description": "Content of the note"
      },
      "tags": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "Tags associated with the note"
      },
      "query": {
        "type": "string",
        "description": "Search query for finding notes"
      }
    }
  },
  "description": "Manage personal notes"
}`,
      rating: 4.9,
    },
    {
      id: "my-tool-2",
      name: "Task Manager",
      description: "Manage your personal tasks and to-dos",
      detailedDescription:
        "A personal task management tool that helps you organize your to-do list. You can create tasks, set due dates, assign priorities, mark tasks as complete, and organize them into projects or categories.",
      isLoaded: false,
      creator: CURRENT_USER.name,
      createdAt: "2023-09-05",
      version: "1.2.1",
      category: "Productivity",
      tags: ["tasks", "to-do", "productivity"],
      usageExamples: [
        "Add a new task 'Prepare presentation' due tomorrow",
        "Mark task 'Send email to client' as complete",
        "List all high priority tasks due this week",
      ],
      schema: `{
  "name": "taskManager",
  "parameters": {
    "type": "object",
    "required": ["action"],
    "properties": {
      "action": {
        "type": "string",
        "enum": ["add", "complete", "update", "delete", "list"],
        "description": "The action to perform on tasks"
      },
      "title": {
        "type": "string",
        "description": "Title of the task"
      },
      "dueDate": {
        "type": "string",
        "description": "Due date for the task (ISO format or natural language)"
      },
      "priority": {
        "type": "string",
        "enum": ["low", "medium", "high"],
        "description": "Priority level of the task"
      },
      "project": {
        "type": "string",
        "description": "Project or category the task belongs to"
      }
    }
  },
  "description": "Manage personal tasks and to-dos"
}`,
      rating: 4.7,
    },
    {
      id: "my-tool-3",
      name: "Custom Search",
      description: "Search your personal data sources",
      detailedDescription:
        "This tool allows you to search across your personal data sources, including documents, emails, notes, and bookmarks. It provides unified search results with relevance ranking and filtering options.",
      isLoaded: false,
      creator: CURRENT_USER.name,
      createdAt: "2023-10-12",
      version: "0.9.5",
      category: "Information Retrieval",
      tags: ["search", "personal", "data"],
      usageExamples: [
        "Search for 'quarterly report' in my documents",
        "Find emails from 'jane@example.com' about 'project timeline'",
        "Look for bookmarks related to 'machine learning'",
      ],
      schema: `{
  "name": "customSearch",
  "parameters": {
    "type": "object",
    "required": ["query"],
    "properties": {
      "query": {
        "type": "string",
        "description": "The search query"
      },
      "sources": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": ["documents", "emails", "notes", "bookmarks", "all"]
        },
        "description": "Data sources to search",
        "default": ["all"]
      },
      "dateRange": {
        "type": "string",
        "description": "Date range for filtering results (e.g., 'last week', 'past month')"
      },
      "limit": {
        "type": "number",
        "description": "Maximum number of results to return",
        "default": 10
      }
    }
  },
  "description": "Search across personal data sources"
}`,
      rating: 4.5,
    },
  ]);

  const [searchQuery, setSearchQuery] = useState("");

  // Filter tools based on search query
  // Filter and sort tools based on search query and loaded status
  const filterAndSortTools = (tools: Tool[]) => {
    // First filter by search query
    let filteredTools = tools;
    if (searchQuery) {
      filteredTools = tools.filter(
        (tool) =>
          tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          tool.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          tool.tags?.some((tag) =>
            tag.toLowerCase().includes(searchQuery.toLowerCase())
          ) ||
          tool.category?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Then sort by loaded status (loaded tools first)
    return filteredTools.sort((a, b) => {
      const aLoaded = loadedTools.some((t) => t.id === a.id) ? 1 : 0;
      const bLoaded = loadedTools.some((t) => t.id === b.id) ? 1 : 0;
      return bLoaded - aLoaded; // Descending order (loaded first)
    });
  };

  // Toggle tool loading status
  const toggleTool = (
    tool: Tool,
    type: "common" | "external" | "my",
    e: React.MouseEvent
  ) => {
    e.stopPropagation(); // Prevent opening the details dialog when clicking the button

    const isLoaded = loadedTools.some((t) => t.id === tool.id);

    if (isLoaded) {
      // Remove from loaded tools
      setLoadedTools(loadedTools.filter((t) => t.id !== tool.id));
    } else {
      // Add to loaded tools
      setLoadedTools([...loadedTools, { ...tool, isLoaded: true }]);
    }

    // Update the tool in its respective list
    if (type === "common") {
      setCommonTools(
        commonTools.map((t) =>
          t.id === tool.id ? { ...t, isLoaded: !isLoaded } : t
        )
      );
    } else if (type === "external") {
      setExternalTools(
        externalTools.map((t) =>
          t.id === tool.id ? { ...t, isLoaded: !isLoaded } : t
        )
      );
    } else if (type === "my") {
      setMyTools(
        myTools.map((t) =>
          t.id === tool.id ? { ...t, isLoaded: !isLoaded } : t
        )
      );
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div className="cursor-pointer border rounded-lg p-2 h-24">
          <div className="text-sm flex items-center gap-1 mb-1 ml-1">
            <span>Agent Tools</span>
            <Badge variant="secondary">{loadedTools.length}</Badge>
          </div>
          <div className="">
            {loadedTools.length > 0 ? (
              <div className="grid grid-cols-3 gap-1">
                {loadedTools
                  .slice(0, Math.min(5, loadedTools.length))
                  .map((tool) => (
                    <div className="col-span-1">
                      <div
                        key={tool.id}
                        className="border rounded-full px-2 py-0.5 w-full"
                      >
                        <p className="text-xs font-normal truncate max-w-[100px]">
                          {tool.name}
                        </p>
                      </div>
                    </div>
                  ))}
                {loadedTools.length > 5 && (
                  <Badge variant="outline" className="text-xs max-w-[50px]">
                    +{loadedTools.length - 5}
                  </Badge>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </DialogTrigger>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>Agent Tools</DialogTitle>
          <DialogDescription>
            Manage the tools your agent can use to perform tasks
          </DialogDescription>
        </DialogHeader>

        {/* Loaded Tools Section */}
        <div className="mb-4">
          <h3 className="text-sm font-medium mb-2">
            Loaded Tools ({loadedTools.length})
          </h3>
          {loadedTools.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {loadedTools.map((tool) => (
                <Badge
                  key={tool.id}
                  variant="secondary"
                  className="flex items-center gap-1"
                >
                  {tool.name}
                  <X
                    className="h-3 w-3 cursor-pointer"
                    onClick={() => {
                      // Determine which list the tool belongs to
                      let toolType: "common" | "external" | "my" = "common";
                      if (myTools.some((t) => t.id === tool.id)) {
                        toolType = "my";
                      } else if (externalTools.some((t) => t.id === tool.id)) {
                        toolType = "external";
                      }

                      toggleTool(tool, toolType, {} as React.MouseEvent);
                    }}
                  />
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No tools loaded. Add tools below.
            </p>
          )}
        </div>

        {/* Search Bar */}
        <div className="relative mb-4">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tools..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Tabs for Common and External Tools */}
        <Tabs defaultValue="my-tools" className="w-full">
          <TabsList className="grid max-w-xl grid-cols-3 mb-4">
            <TabsTrigger value="my-tools">My Tools</TabsTrigger>
            <TabsTrigger value="common-tools">Common Tools</TabsTrigger>
            <TabsTrigger value="external-tools">External Tools</TabsTrigger>
          </TabsList>

          {/* My Tools Tab */}
          <TabsContent
            value="my-tools"
            className="space-y-4  overflow-y-auto pr-2"
          >
            <ScrollArea className="h-80 p-2">
              <div className="grid grid-cols-3 gap-2">
                {filterAndSortTools(myTools).length > 0 ? (
                  filterAndSortTools(myTools).map((tool) => (
                    <div className="col-span-1" key={tool.id}>
                      <ToolCard
                        key={tool.id}
                        tool={tool}
                        isLoaded={loadedTools.some((t) => t.id === tool.id)}
                        onToggle={(e) => toggleTool(tool, "my", e)}
                        toolType="my"
                      />
                    </div>
                  ))
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    No personal tools found
                  </p>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Common Tools Tab */}
          <TabsContent
            value="common-tools"
            className="space-y-4 overflow-y-auto pr-2"
          >
            <ScrollArea className="h-80 p-2">
              <div className="grid grid-cols-3 gap-2">
                {filterAndSortTools(commonTools).length > 0 ? (
                  filterAndSortTools(commonTools).map((tool) => (
                    <div className="col-span-1" key={tool.id}>
                      <ToolCard
                        key={tool.id}
                        tool={tool}
                        isLoaded={loadedTools.some((t) => t.id === tool.id)}
                        onToggle={(e) => toggleTool(tool, "common", e)}
                        toolType="common"
                      />
                    </div>
                  ))
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    No common tools found
                  </p>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
          {/* My Tools Tab */}
          <TabsContent
            value="my"
            className="space-y-4 max-h-[300px] overflow-y-auto pr-2"
          >
            {filterAndSortTools(myTools).length > 0 ? (
              filterAndSortTools(myTools).map((tool) => (
                <ToolCard
                  key={tool.id}
                  tool={tool}
                  isLoaded={loadedTools.some((t) => t.id === tool.id)}
                  onToggle={(e) => toggleTool(tool, "my", e)}
                  toolType="my"
                />
              ))
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No personal tools found
              </p>
            )}
          </TabsContent>

          {/* External Tools Tab */}
          <TabsContent
            value="external-tools"
            className="space-y-4 overflow-y-auto pr-2"
          >
            <ScrollArea className="h-80 p-2">
              <div className="grid grid-cols-3 gap-2">
                {filterAndSortTools(externalTools).length > 0 ? (
                  filterAndSortTools(externalTools).map((tool) => (
                    <div className="col-span-1" key={tool.id}>
                      <ToolCard
                        key={tool.id}
                        tool={tool}
                        isLoaded={loadedTools.some((t) => t.id === tool.id)}
                        onToggle={(e) => toggleTool(tool, "external", e)}
                        toolType="external"
                      />
                    </div>
                  ))
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    No external tools found
                  </p>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
