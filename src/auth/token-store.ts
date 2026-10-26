import {
  deletePassword,
  getPassword,
  setPassword,
} from "cross-keychain";
import type { Credentials } from "google-auth-library";

const SERVICE = "gdoc2typst";
const CLIENT_ACCOUNT = "oauth-client";
const TOKENS_ACCOUNT = "oauth-tokens";

export interface StoredClient {
  clientId: string;
  clientSecret: string;
}

export async function getStoredClient(): Promise<StoredClient | null> {
  const raw = await getPassword(SERVICE, CLIENT_ACCOUNT);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as StoredClient;
    if (
      typeof parsed.clientId === "string" &&
      typeof parsed.clientSecret === "string"
    ) {
      return parsed;
    }
  } catch {
    // ignore malformed entries
  }
  return null;
}

export async function setStoredClient(client: StoredClient): Promise<void> {
  await setPassword(SERVICE, CLIENT_ACCOUNT, JSON.stringify(client));
}

export async function deleteStoredClient(): Promise<void> {
  try {
    await deletePassword(SERVICE, CLIENT_ACCOUNT);
  } catch {
    // already absent
  }
}

export async function getStoredTokens(): Promise<Credentials | null> {
  const raw = await getPassword(SERVICE, TOKENS_ACCOUNT);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as Credentials;
  } catch {
    return null;
  }
}

export async function setStoredTokens(tokens: Credentials): Promise<void> {
  await setPassword(SERVICE, TOKENS_ACCOUNT, JSON.stringify(tokens));
}

export async function deleteStoredTokens(): Promise<void> {
  try {
    await deletePassword(SERVICE, TOKENS_ACCOUNT);
  } catch {
    // already absent
  }
}

export async function authStatus(): Promise<{
  hasClient: boolean;
  hasTokens: boolean;
}> {
  const [client, tokens] = await Promise.all([
    getStoredClient(),
    getStoredTokens(),
  ]);
  return {
    hasClient: client !== null,
    hasTokens: tokens?.refresh_token != null || tokens?.access_token != null,
  };
}
