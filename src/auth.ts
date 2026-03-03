import { google } from "googleapis";
import { createServer } from "node:http";
import { URL } from "node:url";
import { exec } from "node:child_process";
import {
  getOAuthCredentials,
  addAccount,
  getAccount,
  type Account,
} from "./config.js";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://mail.google.com/", // Full access for sync
];

const REDIRECT_PORT = 8089;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth2callback`;

function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  exec(`${cmd} "${url}"`);
}

export function createOAuth2Client() {
  const creds = getOAuthCredentials();
  if (!creds) {
    throw new Error(
      "OAuth credentials not configured. Run: gmail auth setup <client-id> <client-secret>",
    );
  }
  return new google.auth.OAuth2(creds.clientId, creds.clientSecret, REDIRECT_URI);
}

export async function getAuthenticatedClient(account?: Account) {
  const acc = account || getAccount();
  if (!acc) {
    throw new Error("No account configured. Run: gmail auth login");
  }

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: acc.refreshToken });

  // Force token refresh to ensure we have valid access token
  await oauth2Client.getAccessToken();

  return { client: oauth2Client, email: acc.email };
}

export async function loginFlow(): Promise<{ email: string }> {
  const oauth2Client = createOAuth2Client();

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent", // Force to get refresh token
  });

  console.log("Opening browser for authentication...");
  openBrowser(authUrl);

  // Start local server to receive callback
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url!, `http://localhost:${REDIRECT_PORT}`);
        if (url.pathname !== "/oauth2callback") {
          res.writeHead(404);
          res.end("Not found");
          return;
        }

        const code = url.searchParams.get("code");
        if (!code) {
          res.writeHead(400);
          res.end("No authorization code received");
          reject(new Error("No authorization code"));
          server.close();
          return;
        }

        // Exchange code for tokens
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        if (!tokens.refresh_token) {
          res.writeHead(400);
          res.end("No refresh token received. Try revoking app access and retry.");
          reject(new Error("No refresh token"));
          server.close();
          return;
        }

        // Get user email
        const gmail = google.gmail({ version: "v1", auth: oauth2Client });
        const profile = await gmail.users.getProfile({ userId: "me" });
        const email = profile.data.emailAddress!;

        // Save account
        addAccount(email, tokens.refresh_token);

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <html>
            <body style="font-family: system-ui; padding: 40px; text-align: center;">
              <h1>Authentication successful!</h1>
              <p>Logged in as <strong>${email}</strong></p>
              <p>You can close this window.</p>
            </body>
          </html>
        `);

        server.close(() => {
          resolve({ email });
        });
      } catch (err) {
        res.writeHead(500);
        res.end("Authentication failed");
        reject(err);
        server.close();
      }
    });

    server.listen(REDIRECT_PORT, () => {
      console.log(`Waiting for authentication on port ${REDIRECT_PORT}...`);
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error("Authentication timeout"));
    }, 5 * 60 * 1000);
  });
}
