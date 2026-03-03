# Gmail CLI Data Schema

Synced data is stored at `~/.local/share/gmail/{account}/` as JSON files.

## Directory Structure

```
~/.local/share/gmail/
└── {email_sanitized}/           # e.g., user_at_gmail_com
    ├── .sync-state.json         # Sync progress tracking
    ├── profile.json             # Account profile
    ├── labels/
    │   └── {labelId}.json       # Gmail labels
    ├── messages/
    │   └── {messageId}.json     # Full messages with decoded body
    ├── threads/
    │   └── {threadId}.json      # Thread metadata
    ├── drafts/
    │   └── {draftId}.json       # Draft messages
    └── attachments/
        └── {messageId}/
            └── {filename}       # Downloaded attachments
```

## Message Schema

Each message file includes Gmail API data plus convenience fields:

```json
{
  "id": "18d1a2b3c4d5e6f7",
  "threadId": "18d1a2b3c4d5e6f7",
  "snippet": "Preview text...",
  "historyId": "12345678",
  "internalDate": "1709251200000",
  "sizeEstimate": 4521,
  "labelIds": ["INBOX", "UNREAD", "CATEGORY_PERSONAL"],
  
  "payload": {
    "mimeType": "multipart/alternative",
    "headers": [
      { "name": "From", "value": "sender@example.com" },
      { "name": "To", "value": "recipient@example.com" },
      { "name": "Subject", "value": "Email subject" },
      ...
    ],
    "body": { "size": 0 },
    "parts": [
      {
        "mimeType": "text/plain",
        "body": { "data": "base64encodedcontent..." }
      },
      {
        "mimeType": "text/html",
        "body": { "data": "base64encodedcontent..." }
      }
    ]
  },

  "_headers": {
    "from": "Sender Name <sender@example.com>",
    "to": "recipient@example.com",
    "subject": "Email subject",
    "date": "Fri, 01 Mar 2024 12:00:00 +0000",
    "messageId": "<unique-id@mail.example.com>"
  },

  "_body": "Decoded plaintext body content.\nReady for searching."
}
```

### Convenience Fields

| Field | Description |
|-------|-------------|
| `_headers` | Parsed headers object for easy access (from, to, subject, date, messageId) |
| `_body` | Decoded plaintext body (base64 decoded, ready for full-text search) |

## Label Schema

```json
{
  "id": "Label_123456789",
  "name": "My Label",
  "type": "user",
  "messageListVisibility": "show",
  "labelListVisibility": "labelShow",
  "messagesTotal": 42,
  "messagesUnread": 5,
  "threadsTotal": 30,
  "threadsUnread": 3
}
```

## Thread Schema

```json
{
  "id": "18d1a2b3c4d5e6f7",
  "historyId": "12345678",
  "messages": [
    {
      "id": "18d1a2b3c4d5e6f7",
      "threadId": "18d1a2b3c4d5e6f7",
      "snippet": "Message preview...",
      "payload": {
        "mimeType": "text/plain",
        "headers": [...]
      },
      "labelIds": ["INBOX"],
      "internalDate": "1709251200000"
    }
  ]
}
```

## Sync State Schema

```json
{
  "lastSyncAt": "2024-03-01T12:00:00.000Z",
  "pageTokens": {
    "messages": null,
    "threads": "token-for-resuming"
  }
}
```

- `pageTokens.messages = null` means messages sync is complete
- Non-null pageToken means sync was interrupted and will resume from that point

## DuckDB Queries

Query your email data using DuckDB:

```bash
# Install duckdb
brew install duckdb

# Run queries
cd ~/.local/share/gmail/user_at_gmail_com
duckdb
```

### Example Queries

```sql
-- Count messages
SELECT count(*) FROM read_json_auto('messages/*.json', maximum_object_size=10485760);

-- Search message body
SELECT _headers.subject, _headers.from, _body[1:100] as preview
FROM read_json_auto('messages/*.json', maximum_object_size=10485760)
WHERE _body ILIKE '%invoice%'
LIMIT 10;

-- Top senders
SELECT _headers.from as sender, count(*) as count
FROM read_json_auto('messages/*.json', maximum_object_size=10485760)
GROUP BY 1 ORDER BY 2 DESC LIMIT 10;

-- Messages by month
SELECT strftime(to_timestamp(internalDate::bigint/1000), '%Y-%m') as month, count(*)
FROM read_json_auto('messages/*.json', maximum_object_size=10485760)
GROUP BY 1 ORDER BY 1 DESC;

-- Unread messages
SELECT _headers.subject, _headers.from
FROM read_json_auto('messages/*.json', maximum_object_size=10485760),
  LATERAL (SELECT unnest(labelIds) as label)
WHERE label = 'UNREAD';

-- Messages with attachments by sender
SELECT _headers.from, count(*), printf('%.1f MB', sum(sizeEstimate)/1024.0/1024.0) as size
FROM read_json_auto('messages/*.json', maximum_object_size=10485760)
WHERE sizeEstimate > 100000
GROUP BY 1 ORDER BY sum(sizeEstimate) DESC LIMIT 10;
```

## Gmail API Reference

- [Messages](https://developers.google.com/gmail/api/reference/rest/v1/users.messages)
- [Threads](https://developers.google.com/gmail/api/reference/rest/v1/users.threads)
- [Labels](https://developers.google.com/gmail/api/reference/rest/v1/users.labels)
- [Search operators](https://support.google.com/mail/answer/7190)
