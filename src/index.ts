#!/usr/bin/env npx tsx
import { Command, Option } from "@commander-js/extra-typings";
import {
  addAccount,
  getAccount,
  getDefaultAccountEmail,
  listAccounts,
  removeAccount,
  setDefaultAccount,
  setOAuthCredentials,
  getOAuthCredentials,
} from "./config.js";
import {
  getGmailClient,
  listLabels,
  listMessages,
  getMessage,
  getThread,
  listThreads,
  sendMessage,
  modifyMessage,
  trashMessage,
  parseMessageHeaders,
  getMessageBody,
} from "./api.js";
import { formatOutput, type OutputFormat, printError } from "./output.js";
import { loginFlow } from "./auth.js";
import {
  sync,
  getSyncStatus,
  resetSyncState,
  listSyncedAccounts,
  COLLECTIONS,
  type Collection,
} from "./sync.js";

const program = new Command()
  .name("gmail")
  .description("CLI for Gmail API - sync emails locally, search, send, manage labels")
  .version("1.0.0")
  .option("-a, --account <email>", "account to use (defaults to default account)")
  .addOption(
    new Option("-f, --format <format>", "output format")
      .choices(["md", "json", "minimal"] as const)
      .default("md" as const),
  );

// ============================================================================
// AUTH COMMANDS
// ============================================================================
const authCmd = program.command("auth").description("manage authentication");

authCmd
  .command("setup")
  .description("configure OAuth credentials (from Google Cloud Console)")
  .argument("<client-id>", "OAuth client ID")
  .argument("<client-secret>", "OAuth client secret")
  .action((clientId, clientSecret) => {
    setOAuthCredentials(clientId, clientSecret);
    console.log("OAuth credentials saved.");
    console.log("Now run: gmail auth login");
  });

authCmd
  .command("login")
  .description("authenticate with Google (opens browser)")
  .action(async () => {
    try {
      const creds = getOAuthCredentials();
      if (!creds) {
        console.error("OAuth credentials not configured.");
        console.error("Run: gmail auth setup <client-id> <client-secret>");
        process.exit(1);
      }
      const { email } = await loginFlow();
      console.log(`\nAuthenticated as: ${email}`);
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });

authCmd
  .command("list")
  .description("list authenticated accounts")
  .action(() => {
    const accounts = listAccounts();
    const defaultEmail = getDefaultAccountEmail();
    if (accounts.length === 0) {
      console.log("No accounts configured.");
      console.log("Run: gmail auth login");
      return;
    }
    for (const acc of accounts) {
      const marker = acc.email === defaultEmail ? " (default)" : "";
      console.log(`${acc.email}${marker}`);
    }
  });

authCmd
  .command("remove")
  .description("remove an account")
  .argument("<email>", "account email")
  .action((email) => {
    if (removeAccount(email)) {
      console.log(`Account "${email}" removed.`);
    } else {
      console.error(`Account "${email}" not found.`);
    }
  });

authCmd
  .command("default")
  .description("set default account")
  .argument("<email>", "account email")
  .action((email) => {
    if (setDefaultAccount(email)) {
      console.log(`Default account set to "${email}".`);
    } else {
      console.error(`Account "${email}" not found.`);
    }
  });

// ============================================================================
// LABELS
// ============================================================================
program
  .command("labels")
  .description("list all labels")
  .action(async (_, cmd) => {
    const { account, format } = cmd.optsWithGlobals();
    try {
      const acc = getAccount(account);
      if (!acc) {
        console.error("No account configured. Run: gmail auth login");
        process.exit(1);
      }
      const { gmail } = await getGmailClient(acc);
      const labels = await listLabels(gmail);
      console.log(formatOutput(labels, format as OutputFormat));
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });

// ============================================================================
// INBOX / MESSAGES
// ============================================================================
program
  .command("inbox")
  .description("list recent messages")
  .option("-l, --label <label>", "filter by label (default: INBOX)", "INBOX")
  .option("-u, --unread", "show only unread messages")
  .option("-n, --limit <number>", "max messages to return", "20")
  .option("-q, --query <query>", "Gmail search query")
  .action(async (opts, cmd) => {
    const { account, format } = cmd.optsWithGlobals();
    try {
      const acc = getAccount(account);
      if (!acc) {
        console.error("No account configured. Run: gmail auth login");
        process.exit(1);
      }
      const { gmail } = await getGmailClient(acc);

      const labelIds = [opts.label];
      if (opts.unread) labelIds.push("UNREAD");

      const result = await listMessages(gmail, {
        maxResults: parseInt(opts.limit, 10),
        labelIds,
        q: opts.query,
      });

      // Fetch message details
      const messages = await Promise.all(
        result.messages.map(async (m) => {
          const msg = await getMessage(gmail, m.id, "metadata");
          const headers = parseMessageHeaders(msg);
          return {
            id: m.id,
            threadId: m.threadId,
            from: headers.from,
            subject: headers.subject,
            date: headers.date,
            snippet: msg.snippet,
          };
        }),
      );

      console.log(formatOutput(messages, format as OutputFormat));
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });

program
  .command("message")
  .description("get full message content")
  .argument("<id>", "message ID")
  .action(async (id, _, cmd) => {
    const { account, format } = cmd.optsWithGlobals();
    try {
      const acc = getAccount(account);
      if (!acc) {
        console.error("No account configured. Run: gmail auth login");
        process.exit(1);
      }
      const { gmail } = await getGmailClient(acc);
      const msg = await getMessage(gmail, id, "full");
      const headers = parseMessageHeaders(msg);
      const body = getMessageBody(msg);

      if (format === "json") {
        console.log(formatOutput(msg, format as OutputFormat));
      } else {
        console.log(`**From:** ${headers.from}`);
        console.log(`**To:** ${headers.to}`);
        console.log(`**Subject:** ${headers.subject}`);
        console.log(`**Date:** ${headers.date}`);
        console.log(`**Labels:** ${msg.labelIds?.join(", ") || "none"}`);
        console.log("");
        console.log("---");
        console.log("");
        console.log(body);
      }
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });

// ============================================================================
// THREADS
// ============================================================================
program
  .command("threads")
  .description("list conversation threads")
  .option("-l, --label <label>", "filter by label", "INBOX")
  .option("-n, --limit <number>", "max threads", "20")
  .option("-q, --query <query>", "Gmail search query")
  .action(async (opts, cmd) => {
    const { account, format } = cmd.optsWithGlobals();
    try {
      const acc = getAccount(account);
      if (!acc) {
        console.error("No account configured. Run: gmail auth login");
        process.exit(1);
      }
      const { gmail } = await getGmailClient(acc);
      const result = await listThreads(gmail, {
        maxResults: parseInt(opts.limit, 10),
        labelIds: [opts.label],
        q: opts.query,
      });
      console.log(formatOutput(result.threads, format as OutputFormat));
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });

program
  .command("thread")
  .description("get full thread with all messages")
  .argument("<id>", "thread ID")
  .action(async (id, _, cmd) => {
    const { account, format } = cmd.optsWithGlobals();
    try {
      const acc = getAccount(account);
      if (!acc) {
        console.error("No account configured. Run: gmail auth login");
        process.exit(1);
      }
      const { gmail } = await getGmailClient(acc);
      const thread = await getThread(gmail, id, "full");

      if (format === "json") {
        console.log(formatOutput(thread, format as OutputFormat));
      } else {
        console.log(`**Thread ID:** ${thread.id}`);
        console.log(`**Messages:** ${thread.messages?.length || 0}`);
        console.log("");

        for (const msg of thread.messages || []) {
          const headers = parseMessageHeaders(msg);
          const body = getMessageBody(msg);
          console.log("---");
          console.log(`**From:** ${headers.from}`);
          console.log(`**Date:** ${headers.date}`);
          console.log("");
          console.log(body);
          console.log("");
        }
      }
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });

// ============================================================================
// SEARCH
// ============================================================================
program
  .command("search")
  .description("search messages using Gmail query syntax")
  .argument("<query>", "search query (e.g., 'from:user@example.com')")
  .option("-n, --limit <number>", "max results", "25")
  .action(async (query, opts, cmd) => {
    const { account, format } = cmd.optsWithGlobals();
    try {
      const acc = getAccount(account);
      if (!acc) {
        console.error("No account configured. Run: gmail auth login");
        process.exit(1);
      }
      const { gmail } = await getGmailClient(acc);
      const result = await listMessages(gmail, {
        maxResults: parseInt(opts.limit, 10),
        q: query,
      });

      const messages = await Promise.all(
        result.messages.map(async (m) => {
          const msg = await getMessage(gmail, m.id, "metadata");
          const headers = parseMessageHeaders(msg);
          return {
            id: m.id,
            from: headers.from,
            subject: headers.subject,
            date: headers.date,
            snippet: msg.snippet,
          };
        }),
      );

      console.log(formatOutput(messages, format as OutputFormat));
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });

// ============================================================================
// SEND
// ============================================================================
program
  .command("send")
  .description("send an email")
  .requiredOption("--to <email>", "recipient email")
  .requiredOption("--subject <subject>", "email subject")
  .requiredOption("--body <body>", "email body")
  .option("--cc <email>", "CC recipient")
  .option("--bcc <email>", "BCC recipient")
  .action(async (opts, cmd) => {
    const { account, format } = cmd.optsWithGlobals();
    try {
      const acc = getAccount(account);
      if (!acc) {
        console.error("No account configured. Run: gmail auth login");
        process.exit(1);
      }
      const { gmail } = await getGmailClient(acc);
      const result = await sendMessage(gmail, opts.to, opts.subject, opts.body, {
        cc: opts.cc,
        bcc: opts.bcc,
      });
      console.log(`Message sent. ID: ${result.id}`);
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });

// ============================================================================
// ACTIONS
// ============================================================================
program
  .command("archive")
  .description("archive a message (remove from inbox)")
  .argument("<id>", "message ID")
  .action(async (id, _, cmd) => {
    const { account } = cmd.optsWithGlobals();
    try {
      const acc = getAccount(account);
      if (!acc) {
        console.error("No account configured. Run: gmail auth login");
        process.exit(1);
      }
      const { gmail } = await getGmailClient(acc);
      await modifyMessage(gmail, id, undefined, ["INBOX"]);
      console.log("Message archived.");
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });

program
  .command("trash")
  .description("move message to trash")
  .argument("<id>", "message ID")
  .action(async (id, _, cmd) => {
    const { account } = cmd.optsWithGlobals();
    try {
      const acc = getAccount(account);
      if (!acc) {
        console.error("No account configured. Run: gmail auth login");
        process.exit(1);
      }
      const { gmail } = await getGmailClient(acc);
      await trashMessage(gmail, id);
      console.log("Message moved to trash.");
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });

program
  .command("mark-read")
  .description("mark message as read")
  .argument("<id>", "message ID")
  .action(async (id, _, cmd) => {
    const { account } = cmd.optsWithGlobals();
    try {
      const acc = getAccount(account);
      if (!acc) {
        console.error("No account configured. Run: gmail auth login");
        process.exit(1);
      }
      const { gmail } = await getGmailClient(acc);
      await modifyMessage(gmail, id, undefined, ["UNREAD"]);
      console.log("Message marked as read.");
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });

program
  .command("mark-unread")
  .description("mark message as unread")
  .argument("<id>", "message ID")
  .action(async (id, _, cmd) => {
    const { account } = cmd.optsWithGlobals();
    try {
      const acc = getAccount(account);
      if (!acc) {
        console.error("No account configured. Run: gmail auth login");
        process.exit(1);
      }
      const { gmail } = await getGmailClient(acc);
      await modifyMessage(gmail, id, ["UNREAD"]);
      console.log("Message marked as unread.");
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });

program
  .command("label")
  .description("add label to message")
  .argument("<id>", "message ID")
  .argument("<label>", "label name or ID")
  .action(async (id, label, _, cmd) => {
    const { account } = cmd.optsWithGlobals();
    try {
      const acc = getAccount(account);
      if (!acc) {
        console.error("No account configured. Run: gmail auth login");
        process.exit(1);
      }
      const { gmail } = await getGmailClient(acc);
      await modifyMessage(gmail, id, [label]);
      console.log(`Label "${label}" added.`);
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });

program
  .command("unlabel")
  .description("remove label from message")
  .argument("<id>", "message ID")
  .argument("<label>", "label name or ID")
  .action(async (id, label, _, cmd) => {
    const { account } = cmd.optsWithGlobals();
    try {
      const acc = getAccount(account);
      if (!acc) {
        console.error("No account configured. Run: gmail auth login");
        process.exit(1);
      }
      const { gmail } = await getGmailClient(acc);
      await modifyMessage(gmail, id, undefined, [label]);
      console.log(`Label "${label}" removed.`);
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });

// ============================================================================
// SYNC COMMANDS
// ============================================================================
program
  .command("sync")
  .description("sync Gmail data to local JSON files (~/.local/share/gmail/)")
  .option("--full", "full sync (re-fetch everything)")
  .option(
    "-c, --collections <collections>",
    `collections to sync (comma-separated: ${COLLECTIONS.join(",")})`,
  )
  .action(async (opts, cmd) => {
    const { account } = cmd.optsWithGlobals();

    // Parse collections
    let collections: Collection[] | undefined;
    if (opts.collections) {
      collections = opts.collections.split(",").map((c: string) => c.trim()) as Collection[];
      const invalid = collections.filter((c) => !COLLECTIONS.includes(c));
      if (invalid.length) {
        console.error(`Invalid collections: ${invalid.join(", ")}`);
        console.error(`Valid collections: ${COLLECTIONS.join(", ")}`);
        process.exit(1);
      }
    }

    // Get accounts to sync
    const accounts = account
      ? [getAccount(account)].filter(Boolean) as { email: string; refreshToken: string }[]
      : listAccounts();

    if (accounts.length === 0) {
      console.error("No accounts configured. Run: gmail auth login");
      process.exit(1);
    }

    const startTime = Date.now();

    // Track progress per account
    const progress: Record<string, { collection: string; fetched: number }> = {};
    const renderProgress = () => {
      const lines = Object.entries(progress)
        .map(([email, p]) => `  ${email}: ${p.collection} (${p.fetched})`)
        .join("\n");
      process.stdout.write(`\r\x1b[K${lines}`);
    };

    console.log(`Syncing ${accounts.length} account(s)...\n`);

    const results = await sync({
      accounts,
      full: opts.full,
      collections,
      onProgress: (p) => {
        // Note: progress callback needs account context
        // For now just show collection progress
        process.stdout.write(`\r  ${p.collection}: ${p.fetched} items`);
      },
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n\nSync complete in ${elapsed}s\n`);

    console.log("Summary:");
    for (const result of results) {
      if (result.error) {
        console.error(`  ${result.email}: ERROR - ${result.error}`);
      } else {
        const totalSynced = Object.values(result.synced).reduce((a, b) => a + b, 0);
        const totalRemoved = Object.values(result.removed).reduce((a, b) => a + b, 0);
        const removedStr = totalRemoved > 0 ? `, ${totalRemoved} removed` : "";
        console.log(`  ${result.email}: ${totalSynced} items${removedStr}`);
      }
    }
  });

program
  .command("sync-status")
  .description("show sync status")
  .argument("[email]", "account email (shows all if not specified)")
  .action((emailArg) => {
    if (!emailArg) {
      const accounts = listSyncedAccounts();
      if (accounts.length === 0) {
        console.log("No synced accounts found.");
        console.log("Run: gmail sync");
        return;
      }
      console.log("Synced accounts:");
      for (const email of accounts) {
        console.log(`  ${email}`);
      }
      return;
    }

    const status = getSyncStatus(emailArg);
    console.log(`Account: ${emailArg}`);
    console.log(`Data directory: ${status.dataDir}`);
    console.log(
      `Last sync: ${status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : "never"}`,
    );
    console.log("\nCollections:");
    for (const [name, info] of Object.entries(status.collections)) {
      console.log(`  ${name}: ${info.count} items`);
    }
  });

program
  .command("sync-reset")
  .description("reset sync state (next sync will be full)")
  .argument("<email>", "account email")
  .action((email) => {
    resetSyncState(email);
    console.log(`Sync state reset for "${email}".`);
  });

program.parse();
