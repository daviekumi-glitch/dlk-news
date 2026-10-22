// ---------------------------------------------------------------------------
// Slash commands for the composer.
//
// Deliberately a static table rather than something derived from the tool
// registry: this module is imported by a client component, and the registry
// reads `process.env` for tool availability, which is a server concern. Keeping
// the two apart means the composer bundle carries no server-only logic.
// ---------------------------------------------------------------------------

export type SlashCommandKind = "tool" | "skill" | "action";

export interface SlashCommand {
  /** Text typed after the slash, without the slash. */
  id: string;
  label: string;
  description: string;
  /** Lucide icon name, resolved by the palette. */
  icon: string;
  kind: SlashCommandKind;
  /** Tools this command switches on. */
  tools?: string[];
  /** True when running it must NOT send a message. */
  local?: boolean;
  /** Extra words the fuzzy filter should match on. */
  keywords?: string[];
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "new",
    label: "New chat",
    description: "Start a fresh conversation",
    icon: "Plus",
    kind: "action",
    local: true,
    keywords: ["reset", "clear"],
  },
  {
    id: "export",
    label: "Export chat",
    description: "Download this conversation as Markdown",
    icon: "Download",
    kind: "action",
    local: true,
    keywords: ["download", "save"],
  },
  {
    id: "search",
    label: "Search in chat",
    description: "Find text within this conversation",
    icon: "Search",
    kind: "action",
    local: true,
    keywords: ["find"],
  },
  {
    id: "tools",
    label: "Open tools & skills",
    description: "Choose which tools the model may call",
    icon: "Wrench",
    kind: "action",
    local: true,
    keywords: ["skills", "panel"],
  },
  {
    id: "web",
    label: "Web search",
    description: "Research the live web before answering",
    icon: "Globe",
    kind: "tool",
    tools: ["web_search"],
    keywords: ["search", "internet", "news"],
  },
  {
    id: "weather",
    label: "Weather",
    description: "Look up current conditions for a city",
    icon: "CloudSun",
    kind: "tool",
    tools: ["get_weather"],
  },
  {
    id: "calc",
    label: "Calculator",
    description: "Evaluate arithmetic precisely, not approximately",
    icon: "Calculator",
    kind: "tool",
    tools: ["calculator"],
    keywords: ["math", "sum", "arithmetic"],
  },
  {
    id: "code",
    label: "Run code",
    description: "Execute JavaScript in a sandbox to compute a result",
    icon: "Terminal",
    kind: "tool",
    tools: ["run_code"],
    keywords: ["javascript", "execute", "sandbox"],
  },
  {
    id: "image",
    label: "Generate image",
    description: "Create an image from a description",
    icon: "Image",
    kind: "tool",
    tools: ["generate_image"],
    keywords: ["picture", "draw", "art"],
  },
  {
    id: "file",
    label: "Read file",
    description: "Read text out of an attachment",
    icon: "FileText",
    kind: "tool",
    tools: ["read_file"],
    keywords: ["attachment", "document"],
  },
  {
    id: "time",
    label: "Current time",
    description: "Get the current date and time",
    icon: "Clock",
    kind: "tool",
    tools: ["get_current_time"],
    keywords: ["date", "clock", "now"],
  },
];

/**
 * Filter commands by a query typed after the slash.
 *
 * Ranking is: exact id, then id prefix, then label prefix, then substring on
 * any searchable field. Ties keep the table's order, so the list is stable as
 * the user types.
 */
export function matchSlashCommands(query: string, commands = SLASH_COMMANDS): SlashCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return commands;

  const scored: { command: SlashCommand; score: number; index: number }[] = [];

  commands.forEach((command, index) => {
    const id = command.id.toLowerCase();
    const label = command.label.toLowerCase();
    const haystack = [id, label, ...(command.keywords ?? [])].join(" ");

    let score = -1;
    if (id === q) score = 0;
    else if (id.startsWith(q)) score = 1;
    else if (label.startsWith(q)) score = 2;
    else if (haystack.includes(q)) score = 3;

    if (score >= 0) scored.push({ command, score, index });
  });

  return scored
    .sort((a, b) => (a.score === b.score ? a.index - b.index : a.score - b.score))
    .map((entry) => entry.command);
}

/**
 * Detect a slash query at the caret. Only fires when the slash starts the
 * input, so normal prose containing a slash ("and/or", a file path) never
 * opens the palette.
 */
export function parseSlashCommand(value: string): { query: string } | null {
  if (!value.startsWith("/")) return null;
  const rest = value.slice(1);
  // A space means the user has moved on to writing the actual message.
  if (/\s/.test(rest)) return null;
  return { query: rest };
}
