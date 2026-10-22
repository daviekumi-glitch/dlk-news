// ---------------------------------------------------------------------------
// Tool / skill registry.
//
// A "skill" is a named bundle of tools the model may call. The registry is the
// single source of truth for: the JSON schema handed to the LLM, the metadata
// rendered in the Tools & Skills panel, and the server-side executor.
// ---------------------------------------------------------------------------

export type ToolName =
  | "web_search"
  | "generate_image"
  | "read_file"
  | "get_current_time"
  | "calculator"
  | "get_weather";

export interface ToolDefinition {
  name: ToolName;
  /** Human label shown in the UI. */
  label: string;
  /** One-line description shown in the Tools & Skills panel. */
  description: string;
  /** Lucide icon name, resolved in the UI. */
  icon: string;
  /** Which skill bundle this tool belongs to. */
  skill: SkillId;
  /** JSON Schema for the model's function-calling interface. */
  parameters: Record<string, unknown>;
}

export type SkillId = "research" | "media" | "files" | "utility" | "math";

export interface SkillDefinition {
  id: SkillId;
  label: string;
  description: string;
  icon: string;
  tools: ToolName[];
}

export const SKILLS: SkillDefinition[] = [
  {
    id: "research",
    label: "Web Research",
    description: "Search the live web and read pages for up-to-date answers.",
    icon: "Globe",
    tools: ["web_search", "get_weather"],
  },
  {
    id: "math",
    label: "Math & Data",
    description: "Evaluate arithmetic precisely instead of estimating it.",
    icon: "Calculator",
    tools: ["calculator"],
  },
  {
    id: "media",
    label: "Image Generation",
    description: "Create images from a text prompt and render them inline.",
    icon: "Image",
    tools: ["generate_image"],
  },
  {
    id: "files",
    label: "File Reading",
    description: "Read text content out of files attached to the conversation.",
    icon: "FileText",
    tools: ["read_file"],
  },
  {
    id: "utility",
    label: "Utilities",
    description: "Small helpers such as the current date and time.",
    icon: "Wrench",
    tools: ["get_current_time"],
  },
];

export const TOOLS: ToolDefinition[] = [
  {
    name: "web_search",
    label: "Web search",
    description: "Search the web for current information and return ranked results.",
    icon: "Globe",
    skill: "research",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query." },
        max_results: {
          type: "integer",
          description: "How many results to return (1-8). Defaults to 5.",
          minimum: 1,
          maximum: 8,
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_weather",
    label: "Weather",
    description: "Look up current weather conditions for a city.",
    icon: "CloudSun",
    skill: "research",
    parameters: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "City name, optionally with a country code, e.g. 'Blantyre,MW'.",
        },
        units: {
          type: "string",
          enum: ["metric", "imperial"],
          description: "metric = °C (default), imperial = °F.",
        },
      },
      required: ["location"],
      additionalProperties: false,
    },
  },
  {
    name: "calculator",
    label: "Calculator",
    description:
      "Evaluate an arithmetic expression exactly (+ - * / % ^, parentheses, sqrt, log, min, max, pi, e).",
    icon: "Calculator",
    skill: "math",
    parameters: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "Arithmetic expression, e.g. '(1250 * 1.18) / 3' or 'sqrt(2) * pi'.",
        },
        precision: {
          type: "integer",
          description: "Decimal places to round to (0-12). Defaults to 6.",
          minimum: 0,
          maximum: 12,
        },
      },
      required: ["expression"],
      additionalProperties: false,
    },
  },
  {
    name: "generate_image",
    label: "Generate image",
    description: "Generate an image from a text prompt and return its URL.",
    icon: "Image",
    skill: "media",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "A detailed description of the image." },
        size: {
          type: "string",
          enum: ["1024x1024", "1024x1536", "1536x1024"],
          description: "Output size. Defaults to 1024x1024.",
        },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
  },
  {
    name: "read_file",
    label: "Read file",
    description: "Read the text content of a file attached to this conversation.",
    icon: "FileText",
    skill: "files",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "The attachment filename to read, e.g. 'notes.md'.",
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "get_current_time",
    label: "Current time",
    description: "Return the current date and time in a given IANA timezone.",
    icon: "Clock",
    skill: "utility",
    parameters: {
      type: "object",
      properties: {
        timezone: {
          type: "string",
          description: "IANA timezone, e.g. 'Africa/Blantyre'. Defaults to UTC.",
        },
      },
      additionalProperties: false,
    },
  },
];

export const TOOL_MAP: Record<string, ToolDefinition> = Object.fromEntries(
  TOOLS.map((t) => [t.name, t]),
);

/** Every tool runs inside the Base44 `agentChat` function, so all are available. */
export function isToolAvailable(tool: ToolDefinition): boolean {
  void tool;
  return true;
}

export function availableToolNames(): ToolName[] {
  return TOOLS.map((t) => t.name);
}
