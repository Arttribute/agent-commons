export interface ToolSchema {
  name: string;
  apiSpec: {
    path: string;
    method: string;
    baseUrl: string;
    headers: Record<string, string>;
    queryParams: Record<string, string>;
  };
  parameters: {
    type: string;
    required: string[];
    properties: {};
  };
  description: string;
}
