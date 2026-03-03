import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  getGmailClient,
  getProfile,
  listLabels,
  listMessages,
  getMessage,
  listThreads,
  getThread,
  listDrafts,
  getDraft,
  getAttachment,
  getAttachmentInfos,
  parseMessageHeaders,
  type Gmail,
  type Message,
  type Label,
  type Thread,
  type Draft,
} from "./api.js";
import { listAccounts, type Account } from "./config.js";

// Types
interface SyncState {
  lastSyncAt: string | null;
  pageTokens: Record<string, string | null>;
  historyId?: string;
}

interface SyncProgress {
  collection: string;
  fetched: number;
}

type ProgressCallback = (progress: SyncProgress) => void;

// Collections to sync
const COLLECTIONS = ["labels", "messages", "threads", "drafts"] as const;
type Collection = (typeof COLLECTIONS)[number];

// Get data directory
function getDataDir(email: string): string {
  // Sanitize email for filesystem
  const safeName = email.replace(/@/g, "_at_").replace(/\./g, "_");
  return join(homedir(), ".local", "share", "gmail", safeName);
}

function getStateFile(email: string): string {
  return join(getDataDir(email), ".sync-state.json");
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function loadSyncState(email: string): SyncState {
  const stateFile = getStateFile(email);
  if (!existsSync(stateFile)) {
    return { lastSyncAt: null, pageTokens: {} };
  }
  try {
    return JSON.parse(readFileSync(stateFile, "utf-8"));
  } catch {
    return { lastSyncAt: null, pageTokens: {} };
  }
}

function saveSyncState(email: string, state: SyncState): void {
  const stateFile = getStateFile(email);
  ensureDir(getDataDir(email));
  writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

function writeResource(email: string, collection: string, id: string, resource: unknown): void {
  const dir = join(getDataDir(email), collection);
  ensureDir(dir);
  const filePath = join(dir, `${id}.json`);
  writeFileSync(filePath, JSON.stringify(resource, null, 2));
}

function getExistingIds(email: string, collection: string): Set<string> {
  const dir = join(getDataDir(email), collection);
  if (!existsSync(dir)) return new Set();
  try {
    return new Set(
      readdirSync(dir)
        .filter((f) => f.endsWith(".json") && !f.startsWith("."))
        .map((f) => f.replace(".json", "")),
    );
  } catch {
    return new Set();
  }
}

function removeResource(email: string, collection: string, id: string): boolean {
  const filePath = join(getDataDir(email), collection, `${id}.json`);
  if (existsSync(filePath)) {
    unlinkSync(filePath);
    return true;
  }
  return false;
}

// Sanitize filename for filesystem (remove/replace problematic characters)
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[/\\]/g, "_") // Replace path separators with underscore
    .replace(/[<>:"|?*\x00-\x1f]/g, "_") // Replace other problematic chars
    .replace(/^\.+/, "_") // Don't start with dots (hidden files)
    .slice(0, 255); // Limit length
}

// Write attachment to file
async function writeAttachment(
  gmail: Gmail,
  email: string,
  messageId: string,
  attachmentId: string,
  filename: string,
): Promise<void> {
  const data = await getAttachment(gmail, messageId, attachmentId);
  const dir = join(getDataDir(email), "attachments", messageId);
  ensureDir(dir);
  // Decode base64url to binary
  const buffer = Buffer.from(data, "base64");
  const safeFilename = sanitizeFilename(filename);
  writeFileSync(join(dir, safeFilename), buffer);
}

// Sync a single account
async function syncAccount(
  gmail: Gmail,
  email: string,
  options: {
    full?: boolean;
    collections?: Collection[];
    includeAttachments?: boolean;
    onProgress?: ProgressCallback;
  } = {},
): Promise<{ synced: Record<string, number>; removed: Record<string, number> }> {
  const state = loadSyncState(email);
  const collectionsToSync = options.collections || [...COLLECTIONS];
  const isFullSync = options.full || state.lastSyncAt === null;

  const synced: Record<string, number> = {};
  const removed: Record<string, number> = {};

  // Sync profile
  const profile = await getProfile(gmail);
  ensureDir(getDataDir(email));
  writeFileSync(
    join(getDataDir(email), "profile.json"),
    JSON.stringify(profile, null, 2),
  );
  options.onProgress?.({ collection: "profile", fetched: 1 });

  // Sync labels
  if (collectionsToSync.includes("labels")) {
    synced.labels = 0;
    removed.labels = 0;
    const seenIds = new Set<string>();

    const labels = await listLabels(gmail);
    for (const label of labels) {
      if (label.id) {
        writeResource(email, "labels", label.id, label);
        seenIds.add(label.id);
        synced.labels++;
      }
    }
    options.onProgress?.({ collection: "labels", fetched: synced.labels });

    if (isFullSync) {
      const existing = getExistingIds(email, "labels");
      for (const id of existing) {
        if (!seenIds.has(id)) {
          removeResource(email, "labels", id);
          removed.labels++;
        }
      }
    }
  }

  // Sync messages
  if (collectionsToSync.includes("messages")) {
    synced.messages = 0;
    removed.messages = 0;
    const seenIds = new Set<string>();

    const savedPageToken = state.pageTokens.messages;
    const hasSavedProgress = !!savedPageToken;
    const BATCH_SIZE = 20;

    // Helper to fetch and save a page of messages
    const fetchPage = async (pageToken?: string) => {
      const result = await listMessages(gmail, { maxResults: 100, pageToken });

      for (let i = 0; i < result.messages.length; i += BATCH_SIZE) {
        const batch = result.messages.slice(i, i + BATCH_SIZE);

        await Promise.all(
          batch.map(async (msg) => {
            const fullMsg = await getMessage(gmail, msg.id, "full");
            const headers = parseMessageHeaders(fullMsg);

            writeResource(email, "messages", msg.id, {
              ...fullMsg,
              _headers: headers,
            });
            seenIds.add(msg.id);

            if (options.includeAttachments) {
              const attachments = getAttachmentInfos(fullMsg);
              await Promise.all(
                attachments.map((att) =>
                  writeAttachment(gmail, email, msg.id, att.attachmentId, att.filename),
                ),
              );
              if (attachments.length > 0) {
                synced.attachments = (synced.attachments || 0) + attachments.length;
              }
            }
          }),
        );

        synced.messages += batch.length;
        options.onProgress?.({ collection: "messages", fetched: synced.messages });
      }

      return result.nextPageToken;
    };

    // Step 1: Always fetch newest first (no pageToken)
    let nextPageToken = await fetchPage();

    // Step 2: If we have saved progress from incomplete sync, continue from there
    // Otherwise, for incremental sync, we're done after getting newest
    if (hasSavedProgress || isFullSync) {
      let pageToken: string | undefined = hasSavedProgress ? savedPageToken! : nextPageToken;

      while (pageToken) {
        state.pageTokens.messages = pageToken;
        saveSyncState(email, state);

        const next = await fetchPage(pageToken);
        pageToken = next || undefined;
      }
    }

    // Clear pageToken when complete
    state.pageTokens.messages = null;
    saveSyncState(email, state);
    options.onProgress?.({ collection: "messages", fetched: synced.messages });

    if (isFullSync) {
      const existing = getExistingIds(email, "messages");
      for (const id of existing) {
        if (!seenIds.has(id)) {
          removeResource(email, "messages", id);
          removed.messages++;
        }
      }
    }
  }

  // Sync threads
  if (collectionsToSync.includes("threads")) {
    synced.threads = 0;
    removed.threads = 0;
    const seenIds = new Set<string>();

    const savedPageToken = state.pageTokens.threads;
    const hasSavedProgress = !!savedPageToken;
    const BATCH_SIZE = 20;

    // Helper to fetch and save a page of threads
    const fetchPage = async (pageToken?: string) => {
      const result = await listThreads(gmail, { maxResults: 100, pageToken });

      for (let i = 0; i < result.threads.length; i += BATCH_SIZE) {
        const batch = result.threads.slice(i, i + BATCH_SIZE);

        await Promise.all(
          batch.map(async (thread) => {
            const fullThread = await getThread(gmail, thread.id, "metadata");
            writeResource(email, "threads", thread.id, fullThread);
            seenIds.add(thread.id);
          }),
        );

        synced.threads += batch.length;
        options.onProgress?.({ collection: "threads", fetched: synced.threads });
      }

      return result.nextPageToken;
    };

    // Step 1: Always fetch newest first (no pageToken)
    let nextPageToken = await fetchPage();

    // Step 2: If we have saved progress from incomplete sync, continue from there
    // Otherwise, for incremental sync, we're done after getting newest
    if (hasSavedProgress || isFullSync) {
      let pageToken: string | undefined = hasSavedProgress ? savedPageToken! : nextPageToken;

      while (pageToken) {
        state.pageTokens.threads = pageToken;
        saveSyncState(email, state);

        const next = await fetchPage(pageToken);
        pageToken = next || undefined;
      }
    }

    // Clear pageToken when complete
    state.pageTokens.threads = null;
    saveSyncState(email, state);
    options.onProgress?.({ collection: "threads", fetched: synced.threads });

    if (isFullSync) {
      const existing = getExistingIds(email, "threads");
      for (const id of existing) {
        if (!seenIds.has(id)) {
          removeResource(email, "threads", id);
          removed.threads++;
        }
      }
    }
  }

  // Sync drafts
  if (collectionsToSync.includes("drafts")) {
    synced.drafts = 0;
    removed.drafts = 0;
    const seenIds = new Set<string>();

    const result = await listDrafts(gmail);
    for (const draft of result.drafts) {
      if (draft.id) {
        const fullDraft = await getDraft(gmail, draft.id);
        writeResource(email, "drafts", draft.id, fullDraft);
        seenIds.add(draft.id);
        synced.drafts++;
      }
    }
    options.onProgress?.({ collection: "drafts", fetched: synced.drafts });

    if (isFullSync) {
      const existing = getExistingIds(email, "drafts");
      for (const id of existing) {
        if (!seenIds.has(id)) {
          removeResource(email, "drafts", id);
          removed.drafts++;
        }
      }
    }
  }

  state.lastSyncAt = new Date().toISOString();
  saveSyncState(email, state);

  return { synced, removed };
}

// Main sync function
export interface SyncOptions {
  accounts?: Account[];
  collections?: Collection[];
  full?: boolean;
  includeAttachments?: boolean;
  onProgress?: ProgressCallback;
}

export async function sync(
  options: SyncOptions = {},
): Promise<Array<{
  email: string;
  synced: Record<string, number>;
  removed: Record<string, number>;
  error?: string;
}>> {
  const accounts = options.accounts || listAccounts();
  const results: Array<{
    email: string;
    synced: Record<string, number>;
    removed: Record<string, number>;
    error?: string;
  }> = [];

  // Sync accounts concurrently
  await Promise.all(
    accounts.map(async (account) => {
      try {
        const { gmail, email } = await getGmailClient(account);
        const result = await syncAccount(gmail, email, {
          full: options.full,
          collections: options.collections,
          includeAttachments: options.includeAttachments,
          onProgress: options.onProgress,
        });
        results.push({ email, ...result });
      } catch (err) {
        results.push({
          email: account.email,
          synced: {},
          removed: {},
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  );

  return results;
}

// Get sync status
export function getSyncStatus(email: string): {
  dataDir: string;
  lastSyncAt: string | null;
  collections: Record<string, { count: number }>;
} {
  const dataDir = getDataDir(email);
  const state = loadSyncState(email);

  const collections: Record<string, { count: number }> = {};
  for (const collection of COLLECTIONS) {
    const ids = getExistingIds(email, collection);
    collections[collection] = { count: ids.size };
  }

  return { dataDir, lastSyncAt: state.lastSyncAt, collections };
}

// Reset sync state
export function resetSyncState(email: string): void {
  const stateFile = getStateFile(email);
  if (existsSync(stateFile)) {
    unlinkSync(stateFile);
  }
}

// List synced accounts
export function listSyncedAccounts(): string[] {
  const baseDir = join(homedir(), ".local", "share", "gmail");
  if (!existsSync(baseDir)) return [];
  try {
    return readdirSync(baseDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name.replace(/_at_/g, "@").replace(/_/g, "."));
  } catch {
    return [];
  }
}

export { COLLECTIONS };
export type { Collection };
