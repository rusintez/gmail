# @rusintez/gmail

CLI for Gmail API - sync emails locally, search, send, manage labels. Supports multiple accounts.

## Features

- **Sync** emails locally as JSON for offline access and searching
- **Search** with DuckDB across thousands of messages instantly
- **Stats** dashboard with analytics (top senders, domains, activity patterns)
- **Multi-account** support with easy switching
- **Rate limit handling** - auto-retry with exponential backoff
- **Resumable sync** - interrupted syncs continue where they left off
- **Attachments** - optionally download all attachments

## Install

```bash
npm install -g @rusintez/gmail

# Requires duckdb for stats command
brew install duckdb
```

## Setup

### 1. Create Google Cloud OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Go to **APIs & Services** → **Enable APIs** → Search "Gmail API" → **Enable**
4. Go to **APIs & Services** → **OAuth consent screen**:
   - Select "External" user type
   - Fill in app name, support email
   - Add your email as test user (while in testing mode)
5. Go to **APIs & Services** → **Credentials**:
   - Click **Create Credentials** → **OAuth 2.0 Client ID**
   - Application type: **Desktop app**
   - Copy the **Client ID** and **Client Secret**

### 2. Configure the CLI

```bash
gmail auth setup <client-id> <client-secret>
gmail auth login  # Opens browser for OAuth consent
```

### 3. Add More Accounts (optional)

```bash
gmail auth login  # Repeat for each account
gmail auth list   # List all accounts
gmail auth default user@gmail.com  # Set default
```

> **Note:** While your OAuth app is in "Testing" mode, only emails added as test users can authenticate.

## Usage

### Sync Emails Locally

```bash
gmail sync                          # Incremental sync (newest 100)
gmail sync --full                   # Full sync (all messages)
gmail sync --include-attachments    # Download attachments too
gmail sync -a user@gmail.com        # Sync specific account
```

Sync is **resumable** - if interrupted, it continues where it left off.

Data is stored at `~/.local/share/gmail/{account}/`

### View Stats

```bash
gmail stats                    # Stats for default account
gmail stats user@gmail.com     # Stats for specific account
```

Shows: message counts, top senders, domains, activity by time, labels, largest senders by size.

### Read Emails

```bash
gmail inbox                    # Recent inbox messages
gmail inbox -u                 # Unread only
gmail inbox -l STARRED         # Starred messages
gmail inbox -n 50              # Limit results
gmail inbox -q "from:boss"     # Gmail search query

gmail message <id>             # Full message content
gmail thread <id>              # Full conversation thread
gmail search "subject:invoice" # Search messages
```

### Send Emails

```bash
gmail send --to user@example.com --subject "Hi" --body "Hello!"
gmail send --to a@x.com --cc b@x.com --subject "Meeting" --body "Let's meet"
```

### Manage Messages

```bash
gmail archive <id>             # Remove from inbox
gmail trash <id>               # Move to trash
gmail mark-read <id>           # Mark as read
gmail mark-unread <id>         # Mark as unread
gmail label <id> STARRED       # Add label
gmail unlabel <id> STARRED     # Remove label
```

### Labels

```bash
gmail labels                   # List all labels
```

### Sync Management

```bash
gmail sync-status              # List synced accounts
gmail sync-status user@gmail.com  # Status for specific account
gmail sync-reset user@gmail.com   # Reset state (next sync = full)
```

### Migrations

```bash
gmail migrate decode-body              # Decode body in all accounts
gmail migrate decode-body user@gmail.com  # Specific account
```

## Query with DuckDB

After syncing, query your emails with SQL:

```bash
cd ~/.local/share/gmail/user_at_gmail_com
duckdb
```

```sql
-- Search message body
SELECT _headers.subject, _body[1:100] as preview
FROM read_json_auto('messages/*.json', maximum_object_size=10485760)
WHERE _body ILIKE '%invoice%';

-- Top senders
SELECT _headers.from, count(*) as count
FROM read_json_auto('messages/*.json', maximum_object_size=10485760)
GROUP BY 1 ORDER BY 2 DESC LIMIT 10;

-- Messages by month
SELECT strftime(to_timestamp(internalDate::bigint/1000), '%Y-%m') as month, count(*)
FROM read_json_auto('messages/*.json', maximum_object_size=10485760)
GROUP BY 1 ORDER BY 1 DESC;
```

See [schema.md](schema.md) for full data schema and more query examples.

## Output Formats

```bash
gmail inbox              # Markdown table (default)
gmail inbox -f json      # JSON - for scripting
gmail inbox -f minimal   # Tab-separated
```

## Multi-Account

```bash
gmail -a work@company.com inbox     # Use specific account
gmail -a personal@gmail.com search "receipts"
```

## Gmail Search Syntax

Use Gmail's powerful search in `-q` or `search` command:

```bash
gmail search "from:user@example.com"
gmail search "subject:invoice after:2024/01/01"
gmail search "has:attachment filename:pdf"
gmail search "is:unread category:primary"
```

See [Gmail search operators](https://support.google.com/mail/answer/7190) for full syntax.

## Config Location

- Config: `~/.config/gmail-cli/config.json`
- Synced data: `~/.local/share/gmail/`
- Schema: [schema.md](schema.md)

## License

MIT
