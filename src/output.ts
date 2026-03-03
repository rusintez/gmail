// Output formatting utilities - markdown by default for agent-friendly I/O

export type OutputFormat = "md" | "json" | "minimal";

export function formatOutput(
  data: unknown,
  format: OutputFormat = "md",
  context?: { command?: string }
): string {
  if (format === "json") {
    return JSON.stringify(data, null, 2);
  }

  if (format === "minimal") {
    if (Array.isArray(data)) {
      return data.map((item) => formatMinimal(item)).join("\n");
    }
    return formatMinimal(data);
  }

  // Markdown format (default)
  return formatMarkdown(data, context);
}

function formatMinimal(item: unknown): string {
  if (typeof item === "string") return item;
  if (typeof item === "number" || typeof item === "boolean") return String(item);
  if (item && typeof item === "object") {
    const obj = item as Record<string, unknown>;
    if ("identifier" in obj && "title" in obj) {
      return `${obj.identifier}\t${obj.title}`;
    }
    if ("id" in obj && "name" in obj) {
      return `${obj.id}\t${obj.name}`;
    }
    return JSON.stringify(item);
  }
  return String(item);
}

function formatMarkdown(data: unknown, context?: { command?: string }): string {
  if (data === null || data === undefined) {
    return "_No data_";
  }

  // Single object
  if (!Array.isArray(data) && typeof data === "object") {
    return formatObjectMarkdown(data as Record<string, unknown>);
  }

  // Array of items
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return "_No results_";
    }
    return formatTableMarkdown(data);
  }

  // Primitives
  return String(data);
}

function formatObjectMarkdown(obj: Record<string, unknown>): string {
  const lines: string[] = [];

  // Special handling for issues with identifier
  if ("identifier" in obj && "title" in obj) {
    lines.push(`## ${obj.identifier}: ${obj.title}`);
    lines.push("");
  }

  for (const [key, value] of Object.entries(obj)) {
    if (key === "identifier" || key === "title") continue; // already in header

    if (value === null || value === undefined) {
      lines.push(`**${key}:** _none_`);
    } else if (typeof value === "object" && !Array.isArray(value)) {
      // Nested object - show inline
      const nested = value as Record<string, unknown>;
      if ("name" in nested) {
        lines.push(`**${key}:** ${nested.name}`);
      } else if ("id" in nested) {
        lines.push(`**${key}:** ${nested.id}`);
      } else {
        lines.push(`**${key}:** ${JSON.stringify(nested)}`);
      }
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`**${key}:** _none_`);
      } else if ("nodes" in (value[0] as object || {})) {
        // GraphQL connection
        lines.push(`**${key}:** ${value.length} items`);
      } else {
        const items = value.map((v) => {
          if (typeof v === "object" && v && "name" in v) return (v as { name: string }).name;
          return String(v);
        });
        lines.push(`**${key}:** ${items.join(", ")}`);
      }
    } else if (key === "description" && typeof value === "string") {
      lines.push("");
      lines.push("### Description");
      lines.push("");
      lines.push(value);
    } else if (key.endsWith("At") && typeof value === "string") {
      // Format dates
      lines.push(`**${key}:** ${new Date(value).toLocaleString()}`);
    } else {
      lines.push(`**${key}:** ${value}`);
    }
  }

  return lines.join("\n");
}

function formatTableMarkdown(items: unknown[]): string {
  if (items.length === 0) return "_No results_";

  const sample = items[0] as Record<string, unknown>;

  // Determine columns - prefer common useful fields first
  const preferredOrder = ["identifier", "key", "name", "title", "state", "assignee", "priority", "type", "id"];
  const allKeys = Object.keys(sample);

  // Filter to scalar values and flatten simple nested objects
  const columns: string[] = [];
  for (const key of preferredOrder) {
    if (allKeys.includes(key)) columns.push(key);
  }
  for (const key of allKeys) {
    if (!columns.includes(key)) {
      const val = sample[key];
      if (val === null || typeof val !== "object") {
        columns.push(key);
      } else if (typeof val === "object" && val && "name" in val) {
        columns.push(key); // will extract .name
      }
    }
  }

  // Limit columns for readability
  const displayCols = columns.slice(0, 6);

  // Header
  const header = `| ${displayCols.join(" | ")} |`;
  const separator = `| ${displayCols.map(() => "---").join(" | ")} |`;

  // Rows
  const rows = items.map((item) => {
    const rec = item as Record<string, unknown>;
    const cells = displayCols.map((col) => {
      const val = rec[col];
      if (val === null || val === undefined) return "-";
      if (typeof val === "object" && val && "name" in val) {
        return String((val as { name: unknown }).name);
      }
      if (typeof val === "string" && col.endsWith("At")) {
        return new Date(val).toLocaleDateString();
      }
      return String(val).replace(/\|/g, "\\|").replace(/\n/g, " ");
    });
    return `| ${cells.join(" | ")} |`;
  });

  return [header, separator, ...rows].join("\n");
}

export function printError(error: unknown): void {
  if (error instanceof Error) {
    console.error(`**Error:** ${error.message}`);
  } else {
    console.error("**Error:**", error);
  }
}

export function printSuccess(message: string): void {
  console.log(message);
}
