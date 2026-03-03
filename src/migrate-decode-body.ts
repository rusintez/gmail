#!/usr/bin/env npx tsx
/**
 * Migration script to decode base64 message bodies in-place.
 * This makes message content searchable with DuckDB/grep.
 *
 * Usage: pnpm tsx src/migrate-decode-body.ts [email]
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

interface MessagePart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: {
    size?: number;
    data?: string;
    attachmentId?: string;
    _decoded?: string; // Our decoded field
  };
  parts?: MessagePart[];
}

interface Message {
  id: string;
  payload?: MessagePart;
  _body?: string; // Top-level decoded body we'll add
  [key: string]: unknown;
}

function decodeBase64(data: string): string {
  try {
    // Gmail uses base64url encoding
    const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(base64, "base64").toString("utf-8");
  } catch {
    return data; // Return as-is if decode fails
  }
}

function extractAndDecodeBody(part: MessagePart): string | null {
  // Check if this part has body data
  if (part.body?.data && !part.body.attachmentId) {
    return decodeBase64(part.body.data);
  }

  // Recursively check parts
  if (part.parts) {
    for (const subpart of part.parts) {
      // Prefer text/plain over text/html
      if (subpart.mimeType === "text/plain" && subpart.body?.data) {
        return decodeBase64(subpart.body.data);
      }
    }
    // Fall back to text/html if no text/plain
    for (const subpart of part.parts) {
      if (subpart.mimeType === "text/html" && subpart.body?.data) {
        return decodeBase64(subpart.body.data);
      }
    }
    // Try nested parts
    for (const subpart of part.parts) {
      const nested = extractAndDecodeBody(subpart);
      if (nested) return nested;
    }
  }

  return null;
}

function migrateMessage(msg: Message): boolean {
  // Skip if already migrated
  if (msg._body !== undefined) {
    return false;
  }

  if (!msg.payload) {
    return false;
  }

  const body = extractAndDecodeBody(msg.payload);
  if (body) {
    msg._body = body;
    return true;
  }

  return false;
}

function getDataDir(email: string): string {
  const safeName = email.replace(/@/g, "_at_").replace(/\./g, "_");
  return join(homedir(), ".local", "share", "gmail", safeName);
}

export async function migrateDecodeBody(email: string) {
  const dataDir = getDataDir(email);
  const messagesDir = join(dataDir, "messages");

  console.log(`Migrating messages for ${email}...`);
  console.log(`Directory: ${messagesDir}`);

  const files = readdirSync(messagesDir).filter((f) => f.endsWith(".json"));
  console.log(`Found ${files.length} messages\n`);

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = join(messagesDir, file);

    try {
      const content = readFileSync(filePath, "utf-8");
      const msg: Message = JSON.parse(content);

      if (migrateMessage(msg)) {
        writeFileSync(filePath, JSON.stringify(msg, null, 2));
        migrated++;
      } else {
        skipped++;
      }
    } catch (err) {
      errors++;
      console.error(`Error processing ${file}:`, err);
    }

    // Progress
    if ((i + 1) % 1000 === 0 || i === files.length - 1) {
      process.stdout.write(`\r  Progress: ${i + 1}/${files.length} (migrated: ${migrated}, skipped: ${skipped}, errors: ${errors})`);
    }
  }

  console.log(`\n\nMigration complete!`);
  console.log(`  Migrated: ${migrated}`);
  console.log(`  Skipped (already done): ${skipped}`);
  console.log(`  Errors: ${errors}`);
}

// Main
const email = process.argv[2];
if (!email) {
  // List available accounts
  const baseDir = join(homedir(), ".local", "share", "gmail");
  try {
    const accounts = readdirSync(baseDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name.replace(/_at_/g, "@").replace(/_/g, "."));

    console.log("Usage: pnpm tsx src/migrate-decode-body.ts <email>\n");
    console.log("Available accounts:");
    for (const acc of accounts) {
      console.log(`  ${acc}`);
    }
  } catch {
    console.log("No synced accounts found.");
  }
  process.exit(1);
}

// Run if called directly
if (process.argv[1]?.includes("migrate-decode-body")) {
  migrateDecodeBody(email).catch(console.error);
}
