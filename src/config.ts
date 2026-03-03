import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Account {
  email: string;
  refreshToken: string;
}

export interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
}

export interface Config {
  accounts: Account[];
  defaultAccount?: string;
  oauth?: OAuthCredentials;
}

const CONFIG_DIR = join(homedir(), ".config", "gmail-cli");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadConfig(): Config {
  ensureConfigDir();
  if (!existsSync(CONFIG_FILE)) {
    return { accounts: [] };
  }
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
  } catch {
    return { accounts: [] };
  }
}

export function saveConfig(config: Config): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function getAccount(email?: string): Account | undefined {
  const config = loadConfig();
  if (email) {
    return config.accounts.find((a) => a.email === email);
  }
  if (config.defaultAccount) {
    return config.accounts.find((a) => a.email === config.defaultAccount);
  }
  return config.accounts[0];
}

export function listAccounts(): Account[] {
  return loadConfig().accounts;
}

export function addAccount(email: string, refreshToken: string): void {
  const config = loadConfig();
  const existing = config.accounts.findIndex((a) => a.email === email);
  if (existing >= 0) {
    config.accounts[existing].refreshToken = refreshToken;
  } else {
    config.accounts.push({ email, refreshToken });
  }
  if (!config.defaultAccount) {
    config.defaultAccount = email;
  }
  saveConfig(config);
}

export function removeAccount(email: string): boolean {
  const config = loadConfig();
  const idx = config.accounts.findIndex((a) => a.email === email);
  if (idx < 0) return false;
  config.accounts.splice(idx, 1);
  if (config.defaultAccount === email) {
    config.defaultAccount = config.accounts[0]?.email;
  }
  saveConfig(config);
  return true;
}

export function setDefaultAccount(email: string): boolean {
  const config = loadConfig();
  const account = config.accounts.find((a) => a.email === email);
  if (!account) return false;
  config.defaultAccount = email;
  saveConfig(config);
  return true;
}

export function getDefaultAccountEmail(): string | undefined {
  return loadConfig().defaultAccount;
}

export function getOAuthCredentials(): OAuthCredentials | undefined {
  return loadConfig().oauth;
}

export function setOAuthCredentials(clientId: string, clientSecret: string): void {
  const config = loadConfig();
  config.oauth = { clientId, clientSecret };
  saveConfig(config);
}
