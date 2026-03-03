# Gmail Schema Reference

This document describes all collections synced by `gmail sync` and their field semantics.

Data is stored at `~/.local/share/gmail/{account}/{collection}/{id}.json`

---

## Profile

**File:** `profile.json`

The Gmail account profile information.

| Field | Type | Description |
|-------|------|-------------|
| `emailAddress` | string | Account email address |
| `messagesTotal` | number | Total messages in mailbox |
| `threadsTotal` | number | Total threads in mailbox |
| `historyId` | string | Current history ID for incremental sync |

---

## Labels

**Directory:** `labels/`

Gmail labels (folders/categories). Includes system labels and user-created labels.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Label ID (e.g., "INBOX", "Label_123") |
| `name` | string | Display name |
| `type` | string | Label type: `system` or `user` |
| `messageListVisibility` | string | Visibility in message list: `show`, `hide` |
| `labelListVisibility` | string | Visibility in label list: `labelShow`, `labelShowIfUnread`, `labelHide` |
| `messagesTotal` | number | Total messages with this label |
| `messagesUnread` | number | Unread messages with this label |
| `threadsTotal` | number | Total threads with this label |
| `threadsUnread` | number | Unread threads with this label |
| `color` | object? | Label color (user labels only) |
| `color.textColor` | string | Text color hex |
| `color.backgroundColor` | string | Background color hex |

### System Labels

| Label ID | Description |
|----------|-------------|
| `INBOX` | Inbox |
| `SENT` | Sent mail |
| `DRAFT` | Drafts |
| `TRASH` | Trash |
| `SPAM` | Spam |
| `STARRED` | Starred |
| `IMPORTANT` | Important |
| `UNREAD` | Unread (pseudo-label) |
| `CATEGORY_PRIMARY` | Primary category |
| `CATEGORY_SOCIAL` | Social category |
| `CATEGORY_PROMOTIONS` | Promotions category |
| `CATEGORY_UPDATES` | Updates category |
| `CATEGORY_FORUMS` | Forums category |

---

## Messages

**Directory:** `messages/`

Individual email messages.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Message ID |
| `threadId` | string | Thread this message belongs to |
| `labelIds` | string[] | Labels applied to this message |
| `snippet` | string | Short preview of message content |
| `historyId` | string | History ID when message was modified |
| `internalDate` | string | Timestamp (ms since epoch) when received |
| `sizeEstimate` | number | Estimated size in bytes |
| `payload` | object | Message content (see below) |
| `_headers` | object | Extracted headers (added by sync) |

### Payload Structure

| Field | Type | Description |
|-------|------|-------------|
| `partId` | string | Part identifier |
| `mimeType` | string | MIME type (e.g., "text/plain", "multipart/alternative") |
| `filename` | string | Filename for attachments |
| `headers` | array | Email headers |
| `body` | object | Body content |
| `body.size` | number | Body size in bytes |
| `body.data` | string | Base64url-encoded body content |
| `body.attachmentId` | string | Attachment ID (for large attachments) |
| `parts` | array | Sub-parts for multipart messages |

### Extracted Headers (_headers)

Added by sync for easier access:

| Field | Type | Description |
|-------|------|-------------|
| `from` | string | From address |
| `to` | string | To addresses |
| `subject` | string | Subject line |
| `date` | string | Date header |
| `messageId` | string | Message-ID header |

### Common Headers

| Header | Description |
|--------|-------------|
| `From` | Sender address |
| `To` | Recipient addresses |
| `Cc` | CC addresses |
| `Bcc` | BCC addresses (usually not visible) |
| `Subject` | Email subject |
| `Date` | Send date |
| `Message-ID` | Unique message identifier |
| `In-Reply-To` | Message ID being replied to |
| `References` | Thread reference chain |
| `Content-Type` | MIME type and charset |

---

## Threads

**Directory:** `threads/`

Conversation threads grouping related messages.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Thread ID |
| `snippet` | string | Preview of most recent message |
| `historyId` | string | History ID when thread was modified |
| `messages` | array | Messages in thread (when fetched with format=full) |

---

## Drafts

**Directory:** `drafts/`

Draft messages not yet sent.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Draft ID |
| `message` | object | The draft message content |
| `message.id` | string | Message ID |
| `message.threadId` | string | Thread ID (if reply) |
| `message.labelIds` | string[] | Always includes "DRAFT" |
| `message.payload` | object | Message content (same as Messages) |

---

## Sync State

**File:** `.sync-state.json`

Internal file tracking sync progress (not part of Gmail API).

| Field | Type | Description |
|-------|------|-------------|
| `lastSyncAt` | datetime? | Last successful sync time |
| `pageTokens` | object | Pagination tokens for resume |
| `historyId` | string? | Last history ID for incremental sync |

---

## Common Patterns

### Timestamps

- `internalDate` is milliseconds since Unix epoch as a string
- Header `Date` is RFC 2822 format

### Base64url Encoding

Message body data uses base64url encoding (URL-safe base64):
- Replace `+` with `-`
- Replace `/` with `_`
- No padding `=`

Decode with: `Buffer.from(data, 'base64').toString('utf-8')`

### Labels vs Folders

Gmail uses labels, not folders. A message can have multiple labels.
To "move" a message, add the destination label and remove the source label.

### Archive

Archiving removes the `INBOX` label but keeps the message accessible.

### Read/Unread

The `UNREAD` label indicates unread status. Remove it to mark as read.
