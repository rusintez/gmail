# @rusintez/gmail

CLI for Gmail API - sync emails locally, search, send, manage labels. Supports multiple accounts.

## Install

```bash
npm install -g @rusintez/gmail
```

## Setup

### 1. Create Google Cloud OAuth Credentials

#### Option A: Using gcloud CLI (recommended)

```bash
# Install gcloud CLI
# macOS:
brew install --cask google-cloud-sdk
# Or download installer: https://cloud.google.com/sdk/docs/install

# Login and set project
gcloud auth login
gcloud projects create gmail-cli-project --name="Gmail CLI"  # or use existing
gcloud config set project gmail-cli-project

# Enable Gmail API
gcloud services enable gmail.googleapis.com

# Configure OAuth consent screen (required before creating credentials)
# This opens a browser - select "External" user type, fill minimal info
gcloud alpha iap oauth-brands create \
  --application_title="Gmail CLI" \
  --support_email="your-email@gmail.com"

# Create OAuth 2.0 credentials
gcloud alpha iap oauth-clients create \
  $(gcloud alpha iap oauth-brands list --format='value(name)') \
  --display_name="Gmail CLI Desktop"

# List credentials to get client ID and secret
gcloud alpha iap oauth-clients list \
  $(gcloud alpha iap oauth-brands list --format='value(name)') \
  --format='table(name.basename(), secret)'
```

#### Option B: Using Google Cloud Console (web UI)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Go to **APIs & Services** → **Enable APIs** → Search "Gmail API" → **Enable**
4. Go to **APIs & Services** → **OAuth consent screen**:
   - Select "External" user type
   - Fill in app name, support email
   - Add scopes: `gmail.readonly`, `gmail.send`, `gmail.modify`, `gmail.labels`
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

> **Note:** While your OAuth app is in "Testing" mode, only emails added as test users can authenticate. To allow any Google account, submit your app for verification.

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
