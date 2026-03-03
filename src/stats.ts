import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function getDataDir(email: string): string {
  const safeName = email.replace(/@/g, "_at_").replace(/\./g, "_");
  return join(homedir(), ".local", "share", "gmail", safeName);
}

function runQuery(dataDir: string, query: string): string {
  try {
    const result = execSync(`duckdb -c "${query.replace(/"/g, '\\"')}"`, {
      cwd: dataDir,
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    });
    return result;
  } catch (error) {
    if (error instanceof Error && "stderr" in error) {
      throw new Error(`Query failed: ${(error as { stderr: string }).stderr}`);
    }
    throw error;
  }
}

export interface Stats {
  overview: {
    messages: number;
    threads: number;
    labels: number;
  };
  topSenders: Array<{ sender: string; count: number }>;
  topDomains: Array<{ domain: string; count: number }>;
  messagesByMonth: Array<{ month: string; count: number }>;
  messagesByDayOfWeek: Array<{ day: string; count: number }>;
  messagesByHour: Array<{ hour: string; count: number }>;
  topLabels: Array<{ label: string; count: number }>;
  largestSenders: Array<{ email: string; msgCount: number; totalSize: string }>;
  unreadCount: number;
}

export async function getStats(email: string): Promise<Stats> {
  const dataDir = getDataDir(email);

  if (!existsSync(join(dataDir, "messages"))) {
    throw new Error(`No synced data found for ${email}. Run 'gmail sync' first.`);
  }

  // Overview counts
  const overviewQuery = `
    SELECT 'messages' as t, count(*) as c FROM read_json_auto('messages/*.json', maximum_object_size=10485760)
    UNION ALL SELECT 'threads', count(*) FROM read_json_auto('threads/*.json', maximum_object_size=10485760)
    UNION ALL SELECT 'labels', count(*) FROM read_json_auto('labels/*.json')
  `;
  const overviewResult = runQuery(dataDir, overviewQuery);
  const overview = { messages: 0, threads: 0, labels: 0 };
  for (const line of overviewResult.split("\n")) {
    if (line.includes("messages")) overview.messages = parseInt(line.match(/\d+/)?.[0] || "0");
    if (line.includes("threads")) overview.threads = parseInt(line.match(/\d+/)?.[0] || "0");
    if (line.includes("labels")) overview.labels = parseInt(line.match(/\d+/)?.[0] || "0");
  }

  // Top senders
  const topSendersQuery = `
    SELECT _headers.from as sender, count(*) as count
    FROM read_json_auto('messages/*.json', maximum_object_size=10485760)
    GROUP BY 1 ORDER BY 2 DESC LIMIT 10
  `;
  const topSenders = parseTable(runQuery(dataDir, topSendersQuery), ["sender", "count"]).map((r) => ({
    sender: r.sender,
    count: parseInt(r.count),
  }));

  // Top domains
  const topDomainsQuery = `
    SELECT regexp_extract(_headers.from, '@([^>]+)', 1) as domain, count(*) as count
    FROM read_json_auto('messages/*.json', maximum_object_size=10485760)
    WHERE _headers.from IS NOT NULL
    GROUP BY 1 ORDER BY 2 DESC LIMIT 10
  `;
  const topDomains = parseTable(runQuery(dataDir, topDomainsQuery), ["domain", "count"]).map((r) => ({
    domain: r.domain,
    count: parseInt(r.count),
  }));

  // Messages by month
  const byMonthQuery = `
    SELECT strftime(to_timestamp(internalDate::bigint/1000), '%Y-%m') as month, count(*) as count
    FROM read_json_auto('messages/*.json', maximum_object_size=10485760)
    GROUP BY 1 ORDER BY 1 DESC LIMIT 12
  `;
  const messagesByMonth = parseTable(runQuery(dataDir, byMonthQuery), ["month", "count"]).map((r) => ({
    month: r.month,
    count: parseInt(r.count),
  }));

  // Messages by day of week
  const byDayQuery = `
    SELECT strftime(to_timestamp(internalDate::bigint/1000), '%A') as day,
           strftime(to_timestamp(internalDate::bigint/1000), '%w')::int as day_num,
           count(*) as count
    FROM read_json_auto('messages/*.json', maximum_object_size=10485760)
    GROUP BY 1, 2 ORDER BY 2
  `;
  const messagesByDayOfWeek = parseTable(runQuery(dataDir, byDayQuery), ["day", "day_num", "count"]).map((r) => ({
    day: r.day,
    count: parseInt(r.count),
  }));

  // Messages by hour
  const byHourQuery = `
    SELECT strftime(to_timestamp(internalDate::bigint/1000), '%H') as hour, count(*) as count
    FROM read_json_auto('messages/*.json', maximum_object_size=10485760)
    GROUP BY 1 ORDER BY 1
  `;
  const messagesByHour = parseTable(runQuery(dataDir, byHourQuery), ["hour", "count"]).map((r) => ({
    hour: r.hour,
    count: parseInt(r.count),
  }));

  // Top labels with names
  const topLabelsQuery = `
    WITH label_names AS (SELECT id, name FROM read_json_auto('labels/*.json')),
    msg_labels AS (
      SELECT label FROM read_json_auto('messages/*.json', maximum_object_size=10485760),
        LATERAL (SELECT unnest(labelIds) as label)
    )
    SELECT COALESCE(ln.name, ml.label) as label_name, count(*) as count
    FROM msg_labels ml LEFT JOIN label_names ln ON ml.label = ln.id
    WHERE ml.label NOT LIKE 'CATEGORY_%' AND ml.label NOT IN ('IMPORTANT', 'STARRED', 'SENT', 'INBOX', 'UNREAD', 'DRAFT', 'TRASH', 'SPAM')
    GROUP BY 1 ORDER BY 2 DESC LIMIT 10
  `;
  const topLabels = parseTable(runQuery(dataDir, topLabelsQuery), ["label", "count"]).map((r) => ({
    label: r.label,
    count: parseInt(r.count),
  }));

  // Largest senders by size
  const largestQuery = `
    SELECT regexp_extract(_headers.from, '<([^>]+)>', 1) as email,
           count(*) as msg_count,
           printf('%.1f MB', sum(sizeEstimate) / 1024.0 / 1024.0) as total_size
    FROM read_json_auto('messages/*.json', maximum_object_size=10485760)
    WHERE sizeEstimate > 50000
    GROUP BY 1 ORDER BY sum(sizeEstimate) DESC LIMIT 10
  `;
  const largestSenders = parseTable(runQuery(dataDir, largestQuery), ["email", "msgCount", "totalSize"]).map((r) => ({
    email: r.email,
    msgCount: parseInt(r.msgCount),
    totalSize: r.totalSize,
  }));

  // Unread count
  const unreadQuery = `
    SELECT count(DISTINCT id) as count
    FROM read_json_auto('messages/*.json', maximum_object_size=10485760),
      LATERAL (SELECT unnest(labelIds) as label)
    WHERE label = 'UNREAD'
  `;
  const unreadResult = runQuery(dataDir, unreadQuery);
  const unreadCount = parseInt(unreadResult.match(/\d+/)?.[0] || "0");

  return {
    overview,
    topSenders,
    topDomains,
    messagesByMonth,
    messagesByDayOfWeek,
    messagesByHour,
    topLabels,
    largestSenders,
    unreadCount,
  };
}

function parseTable(output: string, columns: string[]): Array<Record<string, string>> {
  const lines = output.split("\n").filter((l) => l.includes("│"));
  const results: Array<Record<string, string>> = [];

  for (const line of lines) {
    // Skip header separator lines
    if (line.includes("─") || line.includes("┼")) continue;

    const cells = line
      .split("│")
      .slice(1, -1)
      .map((c) => c.trim());

    // Skip header row (matches column names)
    if (cells.some((c, i) => c === columns[i] || c === columns[i].replace(/([A-Z])/g, "_$1").toLowerCase())) continue;
    // Skip type row
    if (cells.every((c) => ["varchar", "int64", "int32", "bigint", "date"].includes(c))) continue;

    if (cells.length >= columns.length) {
      const row: Record<string, string> = {};
      columns.forEach((col, i) => {
        row[col] = cells[i] || "";
      });
      results.push(row);
    }
  }

  return results;
}

export function formatStats(email: string, stats: Stats): string {
  const lines: string[] = [];

  lines.push(`\n📊 Gmail Stats for ${email}\n`);
  lines.push("═".repeat(60));

  // Overview
  lines.push("\n📬 Overview");
  lines.push(`   Messages: ${stats.overview.messages.toLocaleString()}`);
  lines.push(`   Threads:  ${stats.overview.threads.toLocaleString()}`);
  lines.push(`   Labels:   ${stats.overview.labels}`);
  lines.push(`   Unread:   ${stats.unreadCount.toLocaleString()}`);

  // Top senders
  lines.push("\n👤 Top Senders");
  for (const s of stats.topSenders.slice(0, 8)) {
    const name = s.sender.replace(/<.*>/, "").trim() || s.sender;
    lines.push(`   ${s.count.toString().padStart(5)}  ${name.slice(0, 50)}`);
  }

  // Top domains
  lines.push("\n🌐 Top Domains");
  for (const d of stats.topDomains.slice(0, 8)) {
    lines.push(`   ${d.count.toString().padStart(5)}  ${d.domain}`);
  }

  // Messages by month (bar chart)
  lines.push("\n📅 Messages by Month");
  const maxMonth = Math.max(...stats.messagesByMonth.map((m) => m.count));
  for (const m of stats.messagesByMonth.slice(0, 6)) {
    const bar = "█".repeat(Math.round((m.count / maxMonth) * 20));
    lines.push(`   ${m.month}  ${bar} ${m.count}`);
  }

  // Day of week
  lines.push("\n📆 Messages by Day");
  const maxDay = Math.max(...stats.messagesByDayOfWeek.map((d) => d.count));
  for (const d of stats.messagesByDayOfWeek) {
    const bar = "█".repeat(Math.round((d.count / maxDay) * 15));
    lines.push(`   ${d.day.slice(0, 3).padEnd(3)}  ${bar} ${d.count}`);
  }

  // Hour distribution
  lines.push("\n🕐 Peak Hours (UTC)");
  const hoursByCount = [...stats.messagesByHour].sort((a, b) => b.count - a.count);
  const peakHours = hoursByCount.slice(0, 5);
  lines.push(`   Peak: ${peakHours.map((h) => `${h.hour}:00`).join(", ")}`);

  // Top labels
  if (stats.topLabels.length > 0) {
    lines.push("\n🏷️  Top Labels");
    for (const l of stats.topLabels.slice(0, 6)) {
      lines.push(`   ${l.count.toString().padStart(5)}  ${l.label}`);
    }
  }

  // Largest senders
  lines.push("\n📦 Largest Senders (by attachment size)");
  for (const s of stats.largestSenders.slice(0, 5)) {
    lines.push(`   ${s.totalSize.padStart(10)}  ${s.email?.slice(0, 40) || "unknown"}`);
  }

  lines.push("\n" + "═".repeat(60));

  return lines.join("\n");
}
