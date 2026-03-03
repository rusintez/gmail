import { google, gmail_v1 } from "googleapis";
import { getAuthenticatedClient } from "./auth.js";
import type { Account } from "./config.js";

export type Gmail = gmail_v1.Gmail;
export type Message = gmail_v1.Schema$Message;
export type Thread = gmail_v1.Schema$Thread;
export type Label = gmail_v1.Schema$Label;
export type Draft = gmail_v1.Schema$Draft;
export type Profile = gmail_v1.Schema$Profile;

export async function getGmailClient(account?: Account): Promise<{ gmail: Gmail; email: string }> {
  const { client, email } = await getAuthenticatedClient(account);
  const gmail = google.gmail({ version: "v1", auth: client });
  return { gmail, email };
}

// Profile
export async function getProfile(gmail: Gmail): Promise<Profile> {
  const res = await gmail.users.getProfile({ userId: "me" });
  return res.data;
}

// Labels
export async function listLabels(gmail: Gmail): Promise<Label[]> {
  const res = await gmail.users.labels.list({ userId: "me" });
  return res.data.labels || [];
}

export async function getLabel(gmail: Gmail, id: string): Promise<Label> {
  const res = await gmail.users.labels.get({ userId: "me", id });
  return res.data;
}

// Messages
export interface ListMessagesOptions {
  maxResults?: number;
  pageToken?: string;
  labelIds?: string[];
  q?: string; // Gmail search query
}

export async function listMessages(
  gmail: Gmail,
  options: ListMessagesOptions = {},
): Promise<{ messages: Array<{ id: string; threadId: string }>; nextPageToken?: string }> {
  const res = await gmail.users.messages.list({
    userId: "me",
    maxResults: options.maxResults || 100,
    pageToken: options.pageToken,
    labelIds: options.labelIds,
    q: options.q,
  });
  return {
    messages: (res.data.messages || []).map((m) => ({
      id: m.id!,
      threadId: m.threadId!,
    })),
    nextPageToken: res.data.nextPageToken || undefined,
  };
}

export async function getMessage(
  gmail: Gmail,
  id: string,
  format: "full" | "metadata" | "minimal" | "raw" = "full",
): Promise<Message> {
  const res = await gmail.users.messages.get({ userId: "me", id, format });
  return res.data;
}

export async function modifyMessage(
  gmail: Gmail,
  id: string,
  addLabelIds?: string[],
  removeLabelIds?: string[],
): Promise<Message> {
  const res = await gmail.users.messages.modify({
    userId: "me",
    id,
    requestBody: { addLabelIds, removeLabelIds },
  });
  return res.data;
}

export async function trashMessage(gmail: Gmail, id: string): Promise<Message> {
  const res = await gmail.users.messages.trash({ userId: "me", id });
  return res.data;
}

export async function untrashMessage(gmail: Gmail, id: string): Promise<Message> {
  const res = await gmail.users.messages.untrash({ userId: "me", id });
  return res.data;
}

// Threads
export interface ListThreadsOptions {
  maxResults?: number;
  pageToken?: string;
  labelIds?: string[];
  q?: string;
}

export async function listThreads(
  gmail: Gmail,
  options: ListThreadsOptions = {},
): Promise<{ threads: Array<{ id: string; snippet: string; historyId: string }>; nextPageToken?: string }> {
  const res = await gmail.users.threads.list({
    userId: "me",
    maxResults: options.maxResults || 100,
    pageToken: options.pageToken,
    labelIds: options.labelIds,
    q: options.q,
  });
  return {
    threads: (res.data.threads || []) as Array<{ id: string; snippet: string; historyId: string }>,
    nextPageToken: res.data.nextPageToken || undefined,
  };
}

export async function getThread(gmail: Gmail, id: string, format: "full" | "metadata" | "minimal" = "full"): Promise<Thread> {
  const res = await gmail.users.threads.get({ userId: "me", id, format });
  return res.data;
}

export async function trashThread(gmail: Gmail, id: string): Promise<Thread> {
  const res = await gmail.users.threads.trash({ userId: "me", id });
  return res.data;
}

// Drafts
export async function listDrafts(
  gmail: Gmail,
  options: { maxResults?: number; pageToken?: string } = {},
): Promise<{ drafts: Draft[]; nextPageToken?: string }> {
  const res = await gmail.users.drafts.list({
    userId: "me",
    maxResults: options.maxResults || 100,
    pageToken: options.pageToken,
  });
  return {
    drafts: res.data.drafts || [],
    nextPageToken: res.data.nextPageToken || undefined,
  };
}

export async function getDraft(gmail: Gmail, id: string): Promise<Draft> {
  const res = await gmail.users.drafts.get({ userId: "me", id, format: "full" });
  return res.data;
}

// Send
export async function sendMessage(
  gmail: Gmail,
  to: string,
  subject: string,
  body: string,
  options: { cc?: string; bcc?: string; inReplyTo?: string; threadId?: string } = {},
): Promise<Message> {
  const messageParts = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
  ];

  if (options.cc) messageParts.splice(1, 0, `Cc: ${options.cc}`);
  if (options.bcc) messageParts.splice(1, 0, `Bcc: ${options.bcc}`);
  if (options.inReplyTo) {
    messageParts.splice(1, 0, `In-Reply-To: ${options.inReplyTo}`);
    messageParts.splice(1, 0, `References: ${options.inReplyTo}`);
  }

  messageParts.push("", body);

  const raw = Buffer.from(messageParts.join("\r\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw,
      threadId: options.threadId,
    },
  });

  return res.data;
}

// Helpers
export function parseMessageHeaders(message: Message): {
  from?: string;
  to?: string;
  subject?: string;
  date?: string;
  messageId?: string;
} {
  const headers = message.payload?.headers || [];
  const get = (name: string) => headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value;
  return {
    from: get("from") ?? undefined,
    to: get("to") ?? undefined,
    subject: get("subject") ?? undefined,
    date: get("date") ?? undefined,
    messageId: get("message-id") ?? undefined,
  };
}

export function getMessageBody(message: Message): string {
  const payload = message.payload;
  if (!payload) return "";

  // Simple text/plain message
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf-8");
  }

  // Multipart message - find text/plain part
  const findTextPart = (parts: gmail_v1.Schema$MessagePart[] | undefined): string => {
    if (!parts) return "";
    for (const part of parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return Buffer.from(part.body.data, "base64").toString("utf-8");
      }
      if (part.parts) {
        const nested = findTextPart(part.parts);
        if (nested) return nested;
      }
    }
    return "";
  };

  return findTextPart(payload.parts);
}
