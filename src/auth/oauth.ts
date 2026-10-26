import http from "node:http";
import { URL } from "node:url";
import { OAuth2Client, type Credentials } from "google-auth-library";
import open from "open";
import {
  deleteStoredClient,
  deleteStoredTokens,
  getStoredClient,
  getStoredTokens,
  setStoredClient,
  setStoredTokens,
  type StoredClient,
} from "./token-store.js";

export const DOCS_READONLY_SCOPE =
  "https://www.googleapis.com/auth/documents.readonly";

export interface ClientOptions {
  clientId?: string;
  clientSecret?: string;
}

export class MissingClientError extends Error {
  constructor() {
    super(
      [
        "Google OAuth client credentials are required.",
        "Pass --client-id and --client-secret, or set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET,",
        "or run `gdoc2typst auth login` after providing them once so they can be stored.",
      ].join(" "),
    );
    this.name = "MissingClientError";
  }
}

export function resolveClient(options: ClientOptions = {}): StoredClient {
  const fromFlags =
    options.clientId && options.clientSecret
      ? {
          clientId: options.clientId,
          clientSecret: options.clientSecret,
        }
      : null;

  if (fromFlags) {
    return fromFlags;
  }

  const fromEnv =
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        }
      : null;

  if (fromEnv) {
    return fromEnv;
  }

  throw new MissingClientError();
}

async function resolveClientWithStore(
  options: ClientOptions = {},
): Promise<StoredClient> {
  try {
    return resolveClient(options);
  } catch (error) {
    if (!(error instanceof MissingClientError)) {
      throw error;
    }
  }

  const stored = await getStoredClient();
  if (stored) {
    return stored;
  }

  throw new MissingClientError();
}

function createOAuthClient(
  client: StoredClient,
  redirectUri: string,
): OAuth2Client {
  return new OAuth2Client({
    clientId: client.clientId,
    clientSecret: client.clientSecret,
    redirectUri,
  });
}

function persistTokens(oauth2Client: OAuth2Client): void {
  oauth2Client.on("tokens", (tokens) => {
    void (async () => {
      const existing = (await getStoredTokens()) ?? {};
      const merged: Credentials = {
        ...existing,
        ...tokens,
        refresh_token: tokens.refresh_token ?? existing.refresh_token,
      };
      await setStoredTokens(merged);
    })();
  });
}

async function exchangeAuthorizationCode(
  client: StoredClient,
): Promise<OAuth2Client> {
  const server = http.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Failed to bind local OAuth callback server.");
  }

  const redirectUri = `http://127.0.0.1:${address.port}/oauth2callback`;
  const oauth2Client = createOAuthClient(client, redirectUri);

  const authorizeUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [DOCS_READONLY_SCOPE],
  });

  const code = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(
      () => {
        server.close();
        reject(new Error("Timed out waiting for Google OAuth callback."));
      },
      5 * 60 * 1000,
    );

    server.on("request", (req, res) => {
      try {
        if (!req.url) {
          res.writeHead(400).end("Missing URL");
          return;
        }
        const requestUrl = new URL(req.url, redirectUri);
        if (requestUrl.pathname !== "/oauth2callback") {
          res.writeHead(404).end("Not found");
          return;
        }

        const error = requestUrl.searchParams.get("error");
        if (error) {
          res.writeHead(400).end(`Authentication failed: ${error}`);
          clearTimeout(timeout);
          server.close();
          reject(new Error(`OAuth error: ${error}`));
          return;
        }

        const authCode = requestUrl.searchParams.get("code");
        if (!authCode) {
          res.writeHead(400).end("Missing authorization code");
          return;
        }

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          "<html><body><p>Authentication successful. You can close this window and return to the terminal.</p></body></html>",
        );
        clearTimeout(timeout);
        server.close();
        resolve(authCode);
      } catch (err) {
        clearTimeout(timeout);
        server.close();
        reject(err);
      }
    });

    void open(authorizeUrl, { wait: false }).then((child) => child.unref());
  });

  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  await setStoredClient(client);
  await setStoredTokens(tokens);
  persistTokens(oauth2Client);
  return oauth2Client;
}

export async function login(options: ClientOptions = {}): Promise<OAuth2Client> {
  const client = await resolveClientWithStore(options);
  console.error("Opening browser for Google sign-in…");
  return exchangeAuthorizationCode(client);
}

export async function ensureAuthenticated(
  options: ClientOptions = {},
): Promise<OAuth2Client> {
  const client = await resolveClientWithStore(options);
  const tokens = await getStoredTokens();

  if (tokens?.refresh_token || tokens?.access_token) {
    const oauth2Client = createOAuthClient(client, "http://127.0.0.1");
    oauth2Client.setCredentials(tokens);
    persistTokens(oauth2Client);

    try {
      await oauth2Client.getAccessToken();
      return oauth2Client;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/invalid_grant/i.test(message)) {
        throw error;
      }
      console.error(
        "Stored Google credentials are no longer valid. Starting sign-in…",
      );
    }
  } else {
    console.error("No Google credentials found. Starting sign-in…");
  }

  return login(options);
}

export async function logout(forgetClient = false): Promise<void> {
  await deleteStoredTokens();
  if (forgetClient) {
    await deleteStoredClient();
  }
}
