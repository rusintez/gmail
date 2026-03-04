# Gmail CLI Skill

CLI for Gmail API with local sync. Supports multiple Google accounts.

## Running

```bash
gmail <command>     # Globally linked
```

## Authentication

Requires OAuth2 credentials from Google Cloud Console:

```bash
gmail auth setup <client-id> <client-secret>  # One-time setup
gmail auth login                               # Opens browser
gmail auth list                                # List accounts
gmail auth default user@gmail.com              # Set default
```

Switch accounts with `-a <email>`:

```bash
gmail -a work@company.com inbox
```

## Quick Reference

### Read Emails

```bash
gmail inbox                    # Recent inbox
gmail inbox -u                 # Unread only
gmail inbox -l STARRED         # By label
gmail inbox -n 50              # Limit
gmail inbox -q "from:boss"     # Gmail search

gmail message <id>             # Full message
gmail thread <id>              # Full conversation
gmail threads                  # List threads
gmail search "subject:urgent"  # Search
```

### Send

```bash
gmail send --to user@x.com --subject "Hi" --body "Hello"
gmail send --to a@x.com --cc b@x.com --subject "FYI" --body "..."
```

### Manage (Mutations)

All mutations sync to Gmail server immediately:

```bash
gmail archive <id>             # Remove from inbox (keeps in All Mail)
gmail trash <id>               # Move to trash
gmail mark-read <id>           # Mark read (removes UNREAD label)
gmail mark-unread <id>         # Mark unread (adds UNREAD label)
gmail label <id> STARRED       # Add label
gmail unlabel <id> IMPORTANT   # Remove label
```

**Read/unread state**: Stored in `labelIds` array - presence of `UNREAD` = unread.

**Archive vs Trash**: Archive removes from INBOX but message remains in All Mail. Trash moves to trash folder (auto-deleted after 30 days).

### Labels

```bash
gmail labels                   # List all labels
```

## Gmail Search Syntax

```bash
gmail search "from:user@example.com"
gmail search "subject:invoice after:2024/01/01"
gmail search "has:attachment filename:pdf"
gmail search "is:unread in:inbox"
gmail search "category:primary newer_than:7d"
```

## Sync (Local Data Cache)

Sync Gmail data to local JSON files for offline access and searching.

**Exclusions**: Spam and Trash are automatically excluded from sync (never downloaded).

```bash
gmail sync                          # Incremental sync all accounts
gmail sync --full                   # Full sync
gmail sync --include-attachments    # Include attachments
gmail sync -a user@gmail.com        # Sync one account
gmail sync -c messages,labels       # Sync specific collections
```

### Sync Status

```bash
gmail sync-status              # List synced accounts
gmail sync-status user@x.com   # Status for account
gmail sync-reset user@x.com    # Reset state
```

### Data Location

```
~/.local/share/gmail/{email}/
├── profile.json
├── labels/{id}.json
├── messages/{id}.json
├── threads/{id}.json
├── drafts/{id}.json
└── .sync-state.json
```

### Collections

| Collection | Description |
|------------|-------------|
| labels | Gmail labels (INBOX, STARRED, custom) |
| messages | Individual emails with headers and body |
| threads | Conversation threads |
| drafts | Draft messages |
| attachments | Downloaded attachments (when `--include-attachments`) |

**Note**: Attachments from promotional emails (CATEGORY_PROMOTIONS) are skipped (security). Spam/trash are excluded entirely.

See `schema.md` for full field documentation.

## Output Formats

| Flag | Format | Use Case |
|------|--------|----------|
| (default) | Markdown | Human readable |
| `-f json` | JSON | Parsing, scripting |
| `-f minimal` | Tab-separated | Simple processing |

## Notes

- Config: `~/.config/gmail-cli/config.json`
- Sync data: `~/.local/share/gmail/`
- OAuth tokens refresh automatically
