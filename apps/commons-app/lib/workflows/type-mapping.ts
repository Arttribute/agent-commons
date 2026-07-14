/**
 * Maps JSON Schema types to workflow data types
 * Handles common type patterns from tool schemas
 */

export type WorkflowDataType =
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "array"
  | "null"
  | "any";

export interface TypedParameter {
  name: string;
  type: WorkflowDataType;
  required: boolean;
  description?: string;
  /** Dot-separated runtime path. The display name may be changed independently. */
  path?: string;
  items?: WorkflowDataType; // For arrays
  properties?: Record<string, any>; // For objects
}

export interface WorkflowPort extends TypedParameter {
  /** Original JSON Schema fragment used to expose nested fields in the mapper. */
  schema?: Record<string, any>;
}

/**
 * Extract typed parameters from a tool's JSON Schema
 */
export function extractTypedParameters(schema: any): WorkflowPort[] {
  if (!schema?.function?.parameters) return [];

  const params = schema.function.parameters;
  const properties = params.properties || {};
  const required = params.required || [];

  const topLevel = Object.entries(properties).map(([name, prop]: [string, any]) => ({
    name,
    type: mapJsonSchemaType(prop),
    required: required.includes(name),
    description: prop.description,
    path: name,
    items: prop.items ? mapJsonSchemaType(prop.items) : undefined,
    properties: prop.type === "object" ? prop.properties : undefined,
    schema: prop,
  }));

  const nested = Object.entries(properties).flatMap(([name, prop]: [string, any]) =>
    prop.type === "object" || prop.properties
      ? flattenSchemaPorts(prop, name).map((port) => ({ ...port, required: false }))
      : []
  );

  return [...topLevel, ...nested];
}

/**
 * Flatten an object schema into selectable field paths while retaining the
 * parent object. This mirrors how automation products expose a result bundle:
 * users can wire the whole value or a precise nested property.
 */
export function flattenSchemaPorts(
  schema: any,
  rootPath = "",
  depth = 0
): WorkflowPort[] {
  if (!schema || depth > 6) return [];

  const properties = schema.properties ?? {};
  const required = new Set<string>(schema.required ?? []);
  const ports: WorkflowPort[] = [];

  for (const [name, property] of Object.entries(properties) as [string, any][]) {
    const path = rootPath ? `${rootPath}.${name}` : name;
    ports.push({
      name: path,
      path,
      type: mapJsonSchemaType(property),
      required: required.has(name),
      description: property.description,
      items: property.items ? mapJsonSchemaType(property.items) : undefined,
      properties: property.properties,
      schema: property,
    });
    if (property.type === "object" || property.properties) {
      ports.push(...flattenSchemaPorts(property, path, depth + 1));
    }
  }

  return ports;
}

/**
 * Map JSON Schema type to workflow type
 */
export function mapJsonSchemaType(schemaProp: any): WorkflowDataType {
  if (!schemaProp) return "any";

  const type = schemaProp.type;

  // Handle union types
  if (Array.isArray(type)) {
    // If one of the types is "null", filter it out and use the other
    const nonNullTypes = type.filter((t: string) => t !== "null");
    if (nonNullTypes.length === 1) {
      return mapSingleType(nonNullTypes[0]);
    }
    // Multiple non-null types, default to "any"
    return "any";
  }

  return mapSingleType(type);
}

function mapSingleType(type: string): WorkflowDataType {
  switch (type) {
    case "string":
      return "string";
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    case "object":
      return "object";
    case "array":
      return "array";
    case "null":
      return "null";
    default:
      return "any";
  }
}

/**
 * Infer output type from tool description or schema
 * Uses heuristics based on function name and description
 */
export function inferOutputType(schema: any): WorkflowDataType {
  const description = schema?.function?.description || "";
  const functionName = schema?.function?.name || "";

  // Check description for explicit type hints
  if (description.toLowerCase().includes("returns a string")) return "string";
  if (description.toLowerCase().includes("returns a number")) return "number";
  if (description.toLowerCase().includes("returns a boolean")) return "boolean";
  if (description.toLowerCase().includes("returns an array")) return "array";
  if (description.toLowerCase().includes("returns array")) return "array";

  // Infer from function name patterns
  // Functions with plural names or list/find/search/get typically return arrays
  const lowerName = functionName.toLowerCase();
  if (
    lowerName.endsWith("s") || // plural: findResources, getGoals, etc.
    lowerName.includes("list") ||
    lowerName.includes("find") ||
    lowerName.includes("search") ||
    lowerName.includes("all")
  ) {
    // Check if description mentions "resource" or "resources" which are typically arrays
    if (description.toLowerCase().includes("resource")) return "array";
  }

  // Most tools return structured objects
  return "object";
}

/**
 * Get color for a data type (for visual indicators)
 */
export function getTypeColor(type: WorkflowDataType): string {
  switch (type) {
    case "string":
      return "#3b82f6"; // blue
    case "number":
      return "#10b981"; // green
    case "boolean":
      return "#8b5cf6"; // purple
    case "object":
      return "#f59e0b"; // amber
    case "array":
      return "#ec4899"; // pink
    case "null":
      return "#6b7280"; // gray
    case "any":
    default:
      return "#9ca3af"; // light gray
  }
}

/**
 * Format type for display
 */
export function formatType(type: WorkflowDataType): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Extract output parameters from a tool's schema
 *
 * Note: LLM tool schemas (ChatGPT function calling format) don't have a standard
 * way to specify return types. This function uses heuristics to infer outputs.
 *
 * For proper object destructuring, tool interfaces should:
 * 1. Have properly typed return values (not 'any')
 * 2. Include return type information in schema extensions
 * 3. Or document return structure in descriptions with specific patterns
 */
export function extractOutputParameters(
  schema: any
): WorkflowPort[] {
  const outputs: WorkflowPort[] = [];

  // Check if there's a return type definition in the schema
  const description = schema?.function?.description || "";
  const functionName = schema?.function?.name || "";
  const returnSchema =
    schema?.function?.returns ??
    schema?.function?.outputSchema ??
    schema?.returns ??
    schema?.outputSchema ??
    schema?.responseSchema;
  const baseOutputType = returnSchema
    ? mapJsonSchemaType(returnSchema)
    : inferOutputType(schema);

  // Always include the main result output
  outputs.push({
    name: "result",
    path: "result",
    type: baseOutputType,
    description: "Complete result from the tool",
    required: false,
    schema: returnSchema,
  });

  if (returnSchema?.properties) {
    outputs.push(...flattenSchemaPorts(returnSchema, "result"));
  }

  // Check for explicit return type documentation in description
  // Pattern 1: "returns an object with: field1 (type1), field2 (type2)"
  const explicitFieldsPattern = /returns?\s+(?:an?\s+)?(?:object|json)\s+(?:with|containing):?\s*(.+)/i;
  const explicitMatch = description.match(explicitFieldsPattern);

  if (explicitMatch && baseOutputType === "object") {
    const fieldsText = explicitMatch[1];
    const fieldPattern = /(\w+)\s*\(([^)]+)\)/g;
    let fieldMatch;

    while ((fieldMatch = fieldPattern.exec(fieldsText)) !== null) {
      const fieldName = fieldMatch[1];
      const fieldType = fieldMatch[2].toLowerCase();

      outputs.push({
        name: `result.${fieldName}`,
        path: `result.${fieldName}`,
        type: mapSingleType(fieldType),
        description: `${fieldName} field from result`,
        required: false,
      });
    }
  }

  // Pattern 2: Check for common return patterns based on function name
  // e.g., "findResources" likely returns an array
  if (functionName.toLowerCase().includes("find") ||
      functionName.toLowerCase().includes("get") ||
      functionName.toLowerCase().includes("list") ||
      functionName.toLowerCase().includes("search")) {
    // These functions typically return arrays, but we've already set that in inferOutputType
    // For now, just keep the single result output
  }

  // TODO: In the future, support custom schema extensions for return types
  // e.g., schema.function.returns = { type: "object", properties: {...} }

  // Some schemas/documentation repeat a field. Keep the first, most precise
  // declaration so React Flow handle ids remain stable.
  return outputs.filter(
    (port, index) => outputs.findIndex((candidate) => candidate.name === port.name) === index
  );
}
