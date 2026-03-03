# @rusintez/gmail

CLI for Gmail API - sync emails locally, search, send, manage labels. Supports multiple accounts.

## Install

```bash
npm install -g @rusintez/gmail
```

## Setup

### 1. Create Google Cloud OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable the Gmail API
4. Go to Credentials → Create Credentials → OAuth 2.0 Client ID
5. Application type: Desktop app
6. Download or copy the Client ID and Client Secret

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

## Usage

### Read Emails

```bash
gmail inbox                    # Recent inbox messages
gmail inbox -u                 # Unread only
gmail inbox -l STARRED         # Starred messages
gmail inbox -n 50              # Limit results
gmail inbox -q "from:boss"     # Gmail search query

gmail message <id>             # Full message content
gmail thread <id>              # Full conversation thread
gmail threads                  # List threads
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

### Sync (Local Cache)

Sync all Gmail data to local JSON files for offline access and searching.

```bash
gmail sync                     # Incremental sync all accounts
gmail sync --full              # Full sync (re-fetch all)
gmail sync -a user@gmail.com   # Sync specific account
gmail sync -c messages,labels  # Sync specific collections
```

Data is stored at `~/.local/share/gmail/{account}/`

### Sync Management

```bash
gmail sync-status              # List synced accounts
gmail sync-status user@gmail.com  # Status for specific account
gmail sync-reset user@gmail.com   # Reset state (next sync = full)
```

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

## License

MIT
